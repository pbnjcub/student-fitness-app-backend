const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const Papa = require('papaparse');
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// import models
const { User, StudentDetail, StudentAnthro, TeacherDetail, AdminDetail, sequelize, Sequelize } = require('../models');

// import helper functions
const { createUser, findUserById, detailedUser, updateUserDetails, updateUserAndDetails, getUsersWithDetails, getUsersByTypeAndArchived } = require('../utils/user/helper_functions/UserHelpers');
const UserDTO = require('../utils/user/dto/UserDTO');
const processCsv = require('../utils/csv_handling/GenCSVHandler');
const userRowHandler = require('../utils/user/csv_handling/UserCSVRowHandler');
const { handleTransaction } = require('../utils/csv_handling/HandleTransaction');

//import validation middleware
const { createUserValidationRules, updateUserValidationRules } = require('../utils/user/middleware_validation/UserReqObjValidation');
const validate = require('../utils/validation/ValidationMiddleware');
const { checkUserExists } = require('../utils/user/middleware_validation/CheckUserExists');
const { checkEmailExists } = require('../utils/user/middleware_validation/CheckEmailExists');
const { checkIfRostered } = require('../utils/user/middleware_validation/CheckIfRostered');

//create user
router.post('/users/register',
    createUserValidationRules(),
    validate,
    checkEmailExists,
    async (req, res, next) => {
        try {
            const newUser = await createUser(req.body);
            const userWithDetails = await findUserById(newUser.id);
            const userDto = new UserDTO(userWithDetails.toJSON());
            return res.status(201).json(userDto);
        } catch (err) {
            next(err);
        }
});

// Retrieve all users
router.get('/users', async (req, res, next) => {
    try {
        const users = await getUsersWithDetails();

        const usersDTO = users.map(user => new UserDTO(user.toJSON()));
        res.json(usersDTO);
    } catch (err) {
        next(err);
    }
});

// Retrieve only admin users
router.get('/users/admin', async (req, res, next) => {
    try {
        const admins = await getUsersByTypeAndArchived('admin');
        const adminDTOs = admins.map(admin => new UserDTO(admin.toJSON()));
        res.json(adminDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only active admin users
router.get('/users/admin/active', async (req, res, next) => {
    try {
        const activeAdmins = await getUsersByTypeAndArchived('admin', false);
        const activeAdminDTOs = activeAdmins.map(admin => new UserDTO(admin.toJSON()));
        res.json(activeAdminDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only student users
router.get('/users/student', async (req, res, next) => {
    try {
        const students = await getUsersByTypeAndArchived('student');
        const studentDTOs = students.map(student => new UserDTO(student.toJSON()));
        res.json(studentDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only active student users
router.get('/users/student/active', async (req, res, next) => {
    try {
        const activeStudents = await getUsersByTypeAndArchived('student', false);
        const activeStudentDTOs = activeStudents.map(student => new UserDTO(student.toJSON()));
        res.json(activeStudentDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only teacher users
router.get('/users/teacher', async (req, res, next) => {
    try {
        const teachers = await getUsersByTypeAndArchived('teacher');
        const teacherDTOs = teachers.map(teacher => new UserDTO(teacher.toJSON()));
        res.json(teacherDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only active teacher users
router.get('/users/teacher/active', async (req, res, next) => {
    try {
        const activeTeachers = await getUsersByTypeAndArchived('teacher', false);
        const activeTeacherDTOs = activeTeachers.map(teacher => new UserDTO(teacher.toJSON()));
        res.json(activeTeacherDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only active teacher and admin users
router.get('/users/teacher-admin/active', async (req, res, next) => {
    try {
        const teachersAndAdmins = await User.findAll({
            where: {
                [Sequelize.Op.or]: [
                    { userType: 'teacher' },
                    { userType: 'admin' }
                ],
                isArchived: false
            },
            include: [
                { model: TeacherDetail, as: 'teacherDetails' },
                { model: AdminDetail, as: 'adminDetails' }
            ]
        });

        const teacherAndAdminDTOs = teachersAndAdmins.map(user => new UserDTO(user.toJSON()));
        res.json(teacherAndAdminDTOs);
    } catch (err) {
        next(err);
    }
});

// Retrieve only non-archived, active users
router.get('/users/active', async (req, res, next) => {
    try {
        const activeUsers = await getUsersByTypeAndArchived(null, false); // Fetch all active users (not archived)
        const activeUsersDTO = activeUsers.map(user => new UserDTO(user.toJSON()));
        res.json(activeUsersDTO);
    } catch (err) {
        next(err);
    }
});

// Retrieve only archived users
router.get('/users/archived', async (req, res, next) => {
    try {
        const archivedUsers = await getUsersByTypeAndArchived(null, true); // Fetch all archived users
        const archivedUsersDTO = archivedUsers.map(user => new UserDTO(user.toJSON()));
        res.json(archivedUsersDTO);
    } catch (err) {
        next(err);
    }
});

// Retrieve user by id
router.get('/users/:id',
    checkUserExists,
    async (req, res, next) => {
        const { id } = req.params;

        try {
            const user = await findUserById(id);
            const userDto = new UserDTO(user);
            res.json(userDto);
        } catch (err) {
            next(err);
        }
    }
);

//bulk upload from csv
router.post('/users/register-upload-csv', upload.single('file'), async (req, res, next) => {
    try {
        const buffer = req.file.buffer;
        const content = buffer.toString();

        const newUsers = await processCsv(content, userRowHandler);

        await handleTransaction(async (transaction) => {
            for (const user of newUsers) {
                await createUser(user, transaction);
            }
        });

        const users = await getUsersWithDetails();

        const usersDTO = users.map(user => new UserDTO(user.toJSON()));
        res.status(201).json(usersDTO);
    } catch (err) {
        console.error('Error in POST /users/register-upload-csv', err);
        next(err);
    }
});

// Update user by id
router.patch('/users/:id',
    checkUserExists, // Ensure the user exists before proceeding
    updateUserValidationRules(), // Validate the incoming data
    validate, // Run validation and handle any validation errors
    checkIfRostered, // Final check for rostered status and handle isArchived status change
    async (req, res, next) => {
        const { id } = req.params;
        const { password, ...otherFields } = req.body;
        try {
            if (password) {
                otherFields.password = await hashPassword(password);
            }

            const user = req.user;

            // Call the helper function to handle user and detail updates
            await updateUserAndDetails(user, otherFields);

            const updatedUser = await findUserById(id); // Fetch updated user
            const userDto = new UserDTO(updatedUser);
            res.status(200).json(userDto);
        } catch (err) {
            console.error('Error in PATCH /users/:id', err);
            next(err);
        }
    }
);

//delete user by id
router.delete('/users/:id',
    checkUserExists,
    checkIfRostered,
    async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await findUserById(id);

    await user.destroy();
    // Send a 200 status code with a success message
    res.status(200).json({ message: "User successfully deleted" });
  } catch (err) {
    console.error('Error in DELETE /users/:id:', err); // Log the error for debugging
    next(err);
  }
});


module.exports = router;
