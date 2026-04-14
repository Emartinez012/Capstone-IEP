// =============================================================================
// routes/auth.js - Refactored for PostgreSQL
// =============================================================================
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const router  = express.Router();

router.post('/signup', async (req, res) => {
    // Grab student_id if the frontend sends it
    const { first_name, last_name, email, password, student_id } = req.body;

    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const password_hash = bcrypt.hashSync(password, 10);

        // 1. Create User
        const userRes = await db.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role) 
             VALUES ($1, $2, $3, $4, 'Student') 
             RETURNING user_id`,
            [first_name, last_name, email, password_hash]
        );
        const userId = userRes.rows[0].user_id;

        // Generate a random 8-digit ID if the frontend doesn't provide one
        const finalStudentId = student_id || Math.floor(10000000 + Math.random() * 90000000).toString();

        // 2. Create Student Profile (Fixed: added student_id)
        await db.query(
            `INSERT INTO student_profiles (user_id, student_id, degree_code) 
             VALUES ($1, $2, $3)`,
            [userId, finalStudentId, 'BS-SE']
        );

        res.status(201).json({
            message: 'User created successfully.',
            user: { id: userId, email, role: 'Student', first_name, last_name }
        });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') { 
            return res.status(409).json({ error: 'Email already exists.' });
        }
        res.status(500).json({ error: 'Database error during signup.', detail: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
        const user = result.rows[0];

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        res.json({
            message: 'Login successful.',
            user: {
                id: user.user_id, 
                email: user.email,
                role: user.role,
                first_name: user.first_name,
                last_name: user.last_name
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error during login.' });
    }
});

module.exports = router;