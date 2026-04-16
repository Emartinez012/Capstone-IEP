const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'iep_engine_db',
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'password123',
    database: process.env.POSTGRES_DB || 'iep_engine',
    port: 5432,
});

async function waitForDb(retries = 10, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            await pool.query('SELECT 1');
            console.log('Database connection established.');
            return;
        } catch (err) {
            console.log(`DB not ready, retrying... (${i + 1}/${retries})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('Could not connect to database after retries.');
}

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    waitForDb,
};