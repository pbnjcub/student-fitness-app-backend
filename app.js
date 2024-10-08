const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const bodyParser = require('body-parser');
// const { validationResult } = require('express-validator');
// const { userValidationRules } = require('./utils/ValidationRules');
const cors = require('cors'); // Import cors module
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { errorHandler } = require('./utils/error_handling/ErrorHandler');

const app = express();

// const jsonParser = bodyParser.json();
// const urlencodedParser = bodyParser.urlencoded({ extended: false });
const port = 3000;

// Import routes
const userRoutes = require('./routes/UserRoutes');
const studentRoutes = require('./routes/StudentRoutes');
const teacherRoutes = require('./routes/TeacherRoutes');
const adminRoutes = require('./routes/AdminRoutes');
const sectionRoutes = require('./routes/SectionRoutes');
const fitnessMetricsRoutes = require('./routes/FitnessMetricsRoutes');
const sessionsRoutes = require('./routes/SessionsRoutes');

//Import models and setup associations
const db = require('./models');
require('./models/99_Associations');

// Setup CORS Middleware
const corsOptions = {
  origin: 'http://localhost:8081', // Replace with your frontend application's address
  credentials: true,
  methods: 'GET,POST,PATCH,PUT,DELETE',
};
app.use(cors(corsOptions)); // Apply CORS with the options 

// app.use(jsonParser);
// app.use(urlencodedParser)

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || "default_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Handle JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  next();
});

//use routes
app.use('/api', userRoutes);
app.use('/api', studentRoutes);
app.use('/api', teacherRoutes);
app.use('/api', adminRoutes);
app.use('/api', sectionRoutes);
app.use('/api', fitnessMetricsRoutes);
app.use('/api', sessionsRoutes);

//global error handler
app.use(errorHandler);

app.get('/', (req, res) => {
  res.send('Hello from the Backend!');
});

app.listen(port, () => {
  console.log(`Backend is listening at http://localhost:${port}`);
});


