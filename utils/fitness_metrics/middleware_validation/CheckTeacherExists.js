const { User } = require('../../../models');

async function checkTeacherExists(req, res, next) {
    const { teacherUserId } = req.body;

    try {
        const teacher = await User.findByPk(teacherUserId);
        if (!teacher) {
            const err = new Error(`Teacher with ID ${teacherUserId} not found`);
            err.status = 404;
            return next(err);
        }
        req.teacher = teacher;
        next();
    } catch (err) {
        console.error('Error checking teacher existence:', err);
        next(err);
    }
}

module.exports = checkTeacherExists;