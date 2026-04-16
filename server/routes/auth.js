// =============================================================================
// server/routes/auth.js
// =============================================================================
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const router  = express.Router();

router.post('/signup', async (req, res) => {
    const { first_name, last_name, email, password } = req.body;

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const hash = await bcrypt.hash(password, 10);

        const userRes = await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, role)
            VALUES ($1, $2, $3, $4, 'Student')
            RETURNING user_id
        `, [first_name, last_name, email, hash]);

        const userId = userRes.rows[0].user_id;

        const studentIdString = 'MDC-' + Math.floor(Math.random() * 90000 + 10000);

        await client.query(`
            INSERT INTO student_profiles (user_id, student_id, target_credits)
            VALUES ($1, $2, 12)
        `, [userId, studentIdString]);

        await client.query('COMMIT');

        res.json({ id: userId, role: 'Student', first_name, last_name, email });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Signup Error:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email already exists.' });
        }
        res.status(500).json({ error: 'Failed to create account.' });
    } finally {
        client.release();
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await db.query(
            `SELECT u.user_id AS id, u.role, u.first_name, u.last_name, u.password_hash,
                    sp.degree_code
             FROM users u
             LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
             WHERE u.email = $1 AND u.deleted_at IS NULL`,
            [email]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = userRes.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const { password_hash, ...safe } = user;
        res.json(safe);
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Database error during login.' });
    }
});

module.exports = router;