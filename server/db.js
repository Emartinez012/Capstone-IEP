const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'iep_engine_db',
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'password123',
    database: process.env.POSTGRES_DB || 'iep_engine',
    port: 5432,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect()
};