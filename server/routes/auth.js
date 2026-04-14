// =============================================================================
// routes/auth.js
// Authentication endpoints for user Login and Signup.
// =============================================================================

const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');

const router = express.Router();

// -----------------------------------------------------------------------------
// POST /api/auth/signup
// Registers a new student user.
// -----------------------------------------------------------------------------
router.post('/signup', (req, res) => {
    const { first_name, last_name, email, password } = req.body;

    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const password_hash = bcrypt.hashSync(password, 10);

        // 1. Create the user record
        const insertUser = db.prepare(`
            INSERT INTO users (email, password_hash, role)
            VALUES (?, ?, 'student')
        `);
        const userResult = insertUser.run(email, password_hash);
        const userId = userResult.lastInsertRowid;

        // 2. Create the student record linked to the user
        const insertStudent = db.prepare(`
            INSERT INTO students (user_id, first_name, last_name, major_id)
            VALUES (?, ?, ?, 1) -- Default to major 1 (CAI) for demo
        `);
        const studentResult = insertStudent.run(userId, first_name, last_name);
        const studentId = studentResult.lastInsertRowid;

        res.status(201).json({
            message: 'Account created successfully.',
            user: { id: userId, email, role: 'student', student_id: studentId }
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed: users.email')) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        res.status(500).json({ error: 'Database error during signup.' });
    }
});

// -----------------------------------------------------------------------------
// POST /api/auth/login
// Authenticates a user and returns their profile info.
// -----------------------------------------------------------------------------
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const getUser = db.prepare(`
            SELECT u.*, s.id as student_id, s.first_name, s.last_name
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
            WHERE u.email = ?
        `);
        const user = getUser.get(email);

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        res.json({
            message: 'Login successful.',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                student_id: user.student_id,
                first_name: user.first_name,
                last_name: user.last_name
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Database error during login.' });
    }
});

module.exports = router;
