const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// import models
const { sequelize,User, Section, SectionRoster, StudentDetail } = require('../models');

// Import helper functions
const { SectionDTO, SectionByIdDTO } = require('../utils/section/dto/SectionDTO');
const { createSection, findSectionRoster, createRosterEntries, checkCsvForDuplicateSectionCode, checkCsvForDuplicateEmails, switchRosterEntries } = require('../utils/section/helper_functions/SectionHelpers');
const processCsv = require('../utils/csv_handling/GenCSVHandler');
const sectionRowHandler = require('../utils/section/csv_handling/SectionCSVRowHandler');
const rosterSectionRowHandler = require('../utils/section/csv_handling/RosterSectionCSVRowHandler');
const { handleTransaction } = require('../utils/csv_handling/HandleTransaction');

// Import validation middleware
const { createSectionValidationRules, updateSectionValidationRules } = require('../utils/section/middleware_validation/SectionReqObjValidation');
const validate = require('../utils/validation/ValidationMiddleware');
const { checkSectionExists, checkSectionIsActive } = require('../utils/section/middleware_validation/CheckSectionExistsIsActive');
const { hasRosteredStudents } = require('../utils/section/middleware_validation/CheckHasRosteredStudents');
const { checkSectionCodeExists } = require('../utils/section/middleware_validation/CheckSectionCodeExists');
const { validateRoster, validateUnroster } = require('../utils/section/middleware_validation/CheckStudentsToRosterInSection');
const checkStudentsExistEmail = require('../utils/section/csv_handling/RosterSectionCSVValidations');
const checkStudentsExistId = require('../utils/section/middleware_validation/CheckStudentsExistId');
const checkSectionsExistAndActive = require('../utils/section/middleware_validation/CheckSectionsExistAndActive');
const checkStudentsActive = require('../utils/section/middleware_validation/CheckStudentsActive');
const checkStudentsInFromSection = require('../utils/section/middleware_validation/CheckStudentsInFromSection');
const transferStudentsValidationRules = require('../utils/section/middleware_validation/TransferStudentsReqObjValidation');

// Add section
router.post('/sections',
    createSectionValidationRules(),
    validate,
    checkSectionCodeExists,
    async (req, res, next) => {
        try {
            const newSection = await createSection(req.body);
            const sectionDto = new SectionDTO(newSection);
            return res.status(201).json(sectionDto);
        } catch (err) {
            next(err);
        }
    }
);


// Retrieve all sections
router.get('/sections', async (req, res, next) => {
    try {
        const sections = await Section.findAll();
        const sectionDTOs = sections.map(section => new SectionDTO(section));
        res.json(sectionDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only active sections
router.get('/sections/active', async (req, res, next) => {
    try {
        const activeSections = await Section.findAll({
            where: {
                isActive: true
            }
        });
        const sectionDTOs = activeSections.map(section => new SectionDTO(section));
        res.json(sectionDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve section by id
router.get('/sections/:id',
    checkSectionExists,
    async (req, res, next) => {
        const { section } = req;

        try {
            const sectionRoster = await findSectionRoster(section.id);
            section.sectionRoster = sectionRoster;
            const sectionWithRoster = new SectionByIdDTO(section);
            res.json(sectionWithRoster);
        } catch (err) {
            next(err);
        }
    }
);

// Bulk upload from CSV
router.post('/sections/upload-csv',
    upload.single('file'),
    async (req, res, next) => {
        try {
            const buffer = req.file.buffer;
            const content = buffer.toString();
            const newSections = await processCsv(content, sectionRowHandler);

            //check newSections for duplicate sectionCodes
            await checkCsvForDuplicateSectionCode(newSections);

            // Create sections in a transaction
            await handleTransaction(async (transaction) => {
                for (const section of newSections) {
                    await createSection(section, transaction);
                }
            });

            const sections = await Section.findAll();
            const sectionsDTO = sections.map(section => new SectionDTO(section.toJSON()));
            res.status(201).json(sectionsDTO);
        } catch (err) {
            console.error('Error in POST /sections/upload-csv', err);
            next(err);
        }
});

// Edit section by id
router.patch('/sections/:id',
    checkSectionExists, // Ensure the section exists before proceeding
    updateSectionValidationRules(), // Validate the incoming data
    validate, // Run validation and handle any validation errors
    hasRosteredStudents, // Final check for rostered students and handle isActive status change
    async (req, res, next) => {
        const { section } = req;
        try {
            await section.update(req.body);
            const updatedSection = await Section.findByPk(section.id);
            const sectionDTO = new SectionDTO(updatedSection);
            res.status(200).json(sectionDTO);
        } catch (err) {
            console.error('Error updating section:', err);
            next(err);
        }
    }
);

// Delete section
router.delete('/sections/:id',
    checkSectionExists,
    hasRosteredStudents,
    async (req, res, next) => {
        const { section } = req;

        try {
            await section.destroy();
            res.status(200).json({ message: `Section with ID ${section.id} successfully deleted` });
        } catch (err) {
            console.error('Error deleting section:', err);
            next(err);
        }
    });

// Route to roster a student user to a section
router.post('/sections/:sectionId/roster-students',
    checkSectionExists,
    checkSectionIsActive,
    validateRoster,
    async (req, res, next) => {
        const { section } = req;
        try {
            await handleTransaction(async (transaction) => {
                const rosteredStudents = await createRosterEntries(req.validatedStudents, section.id, transaction);
                res.json({ rosteredStudents, message: `${rosteredStudents.length} student(s) added to the roster` });
            });
        } catch (err) {
            console.error('Error rostering students:', err);
            next(err);
        }
    }
);

// Route to unenroll student from section
router.delete('/sections/:sectionId/unroster-students',
    checkSectionExists,
    validateUnroster,
    async (req, res, next) => {
        const { section } = req;

        try {
            await handleTransaction(async (transaction) => {
                const unrosteredStudents = [];
                for (const student of req.validatedStudents) {
                    const sectionRoster = await SectionRoster.findOne({
                        where: { studentUserId: student.id, sectionId: section.id },
                        transaction
                    });
                    if (sectionRoster) {
                        await sectionRoster.destroy({ transaction });
                        unrosteredStudents.push(sectionRoster);
                    }
                }
                res.json({ unrosteredStudents, message: `${unrosteredStudents.length} student(s) removed from the roster` });
            });
        } catch (err) {
            console.error('Error unrostering students:', err);
            next(err);
        }
    }
);

// Roster students from CSV
router.post('/sections/:sectionId/roster-students-upload-csv', 
    upload.single('file'),
    async (req, res, next) => {
        try {
            const buffer = req.file.buffer;
            const content = buffer.toString();
            const { sectionId } = req.params;
            
            // Process the CSV content and validate each row
            const newStudents = await processCsv(content, rosterSectionRowHandler);

            console.log('newStudents:', newStudents);
            // Check for duplicate student IDs
            await checkCsvForDuplicateEmails(newStudents);

            const studentIds = await checkStudentsExistEmail(newStudents);

            // Attach the student IDs to the student objects
            newStudents.forEach(student => {
                student.id = studentIds[student.email]; // Attach the student ID to the student object
            });

            // Handle the transaction and create roster entries
            await handleTransaction(async (transaction) => {
                const rosteredStudents = await createRosterEntries(newStudents, sectionId, transaction);
                res.status(201).json({ success: 'File uploaded and processed successfully', rosteredStudents });
            });

        } catch (err) {
            console.error('Error uploading file:', err);
            next(err); // Pass the error to the centralized error handler
        }
    }
);

router.post('/sections/transfer-students', 
    transferStudentsValidationRules(), // Validate the request body structure
    validate, // Handle any validation errors
    checkStudentsExistId, // Middleware to check if student IDs exist and are valid
    checkStudentsActive,// Check if students are active and not archived
    checkSectionsExistAndActive, // Check if sections exist and toSection is active 
    checkStudentsInFromSection, // Check if students are in the fromSection
 
    async (req, res, next) => {
        try {
            const { fromSectionId, toSectionId } = req.body;
            const validSectionStudents = req.validSectionStudents;

            // Handle the transaction to switch students between sections
            await handleTransaction(async (transaction) => {
                const switchedStudents = await switchRosterEntries(validSectionStudents, fromSectionId, toSectionId, transaction);
                res.status(200).json({ success: 'Students switched successfully', switchedStudents });
            });

        } catch (err) {
            console.error('Error switching students:', err);
            next(err); // Pass the error to the centralized error handler
        }
    }
);




module.exports = router;
