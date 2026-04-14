// =============================================================================
// server.js
// Expert Advisor backend — Express server entry point.
//
// Start with:  node server.js
// The server listens on http://localhost:3001
// All API routes are prefixed with /api
// =============================================================================

const express = require('express');
const cors    = require('cors');

// Importing db.js runs the CREATE TABLE statements on first launch.
require('./db');

const authRouter     = require('./routes/auth');
const studentsRouter = require('./routes/students');
const plansRouter    = require('./routes/plans');
const coursesRouter  = require('./routes/courses');
const majorsRouter   = require('./routes/majors');

const app  = express();
const PORT = 3001;

// Allow the React frontend (localhost:5173) to call this server.
app.use(cors());

// Parse incoming JSON request bodies.
app.use(express.json());

// Mount all route files under /api
app.use('/api/auth',     authRouter);
app.use('/api/students', studentsRouter);
app.use('/api/plans',    plansRouter);
app.use('/api/courses',  coursesRouter);
app.use('/api/majors',   majorsRouter);

// Simple health-check route — visit http://localhost:3001/ in a browser to
// confirm the server is running.
app.get('/', (req, res) => {
    res.json({ message: 'Expert Advisor API is running.' });
});

// Start listening
app.listen(PORT, () => {
    console.log(`Expert Advisor server running on http://localhost:${PORT}`);
});
