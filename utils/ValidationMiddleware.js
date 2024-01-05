// validationMiddleware.js
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  console.log("errors array:", errors.array())
  if (errors.isEmpty()) {
    return next();
  }
  const extractedErrors = errors.array().map(err => ({ [err.path]: err.msg }));
  return res.status(422).json({ errors: extractedErrors });
};

module.exports = validate;
