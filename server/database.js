const { Pool } = require('pg');

let pool = null;
let usePostgres = false;

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL && DATABASE_URL !== 'placeholder_update_me' && DATABASE_URL.startsWith('postgresql://')) {
    console.log('Connecting to PostgreSQL...');
    console.log('DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':***@')); // Hide password
    
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        max: 1
    });
    
    pool.on('error', (err) => {
        console.error('Unexpected database error:', err);
    });
    usePostgres = true;
} else {
    console.log('DATABASE_URL not set or invalid, falling back to SQLite');
    console.log('DATABASE_URL value:', DATABASE_URL ? DATABASE_URL.substring(0, 30) + '...' : 'undefined');
}

async function initializeDatabase() {
    if (!usePostgres || !pool) {
        console.log('Database: SQLite (fallback)');
        return;
    }
    
    let client;
    try {
        console.log('Attempting PostgreSQL connection...');
        client = await pool.connect();
        console.log('PostgreSQL connected successfully!');
    } catch (err) {
        console.error('PostgreSQL connection failed:', err.message);
        console.log('Falling back to SQLite...');
        usePostgres = false;
        pool = null;
        return;
    }
    
    try {
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                password TEXT NOT NULL,
                plan TEXT DEFAULT 'free',
                scans_used INTEGER DEFAULT 0,
                scans_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                subscription_end TEXT,
                subscription_cancelled INTEGER DEFAULT 0,
                email_verified INTEGER DEFAULT 0,
                verification_code TEXT,
                verification_expires TEXT,
                comparisons_used INTEGER DEFAULT 0,
                scans_left INTEGER DEFAULT 3
            )
        `);
        console.log('Users table ready');

        // Scan history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS scan_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                url TEXT NOT NULL,
                results TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('Scan history table ready');

        // Payments table
        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                payment_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                period TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                method TEXT,
                status TEXT DEFAULT 'pending',
                external_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('Payments table ready');

        // Comparison history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS comparison_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                main_url TEXT NOT NULL,
                competitors TEXT NOT NULL,
                results TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('Comparison history table ready');

        // Scheduled scans table
        await client.query(`
            CREATE TABLE IF NOT EXISTS scheduled_scans (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                name TEXT,
                frequency TEXT DEFAULT 'daily',
                last_scan_at TIMESTAMP,
                next_scan_at TIMESTAMP,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('Scheduled scans table ready');

    } catch (err) {
        console.error('Error creating tables:', err);
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Initialize tables on startup
initializeDatabase();

const dbReady = Promise.resolve();

const dbModule = {
    run(sql, params = [], callback) {
        pool.query(sql, params)
            .then(() => {
                if (callback) callback(null);
            })
            .catch((err) => {
                console.error('DB run error:', err);
                if (callback) callback(err);
            });
    },
    get(sql, params = [], callback) {
        pool.query(sql, params)
            .then((result) => {
                if (callback) callback(null, result.rows[0]);
            })
            .catch((err) => {
                console.error('DB get error:', err);
                if (callback) callback(err);
            });
    },
    all(sql, params = [], callback) {
        pool.query(sql, params)
            .then((result) => {
                if (callback) callback(null, result.rows);
            })
            .catch((err) => {
                console.error('DB all error:', err);
                if (callback) callback(err);
            });
    }
};

const PLAN_LIMITS = {
    free: { scans: 3, comparisons: 1 },
    pro: { scans: 50, comparisons: 50 },
    business: { scans: 500, comparisons: 500 }
};

const PLAN_FEATURES = {
    free: { scans: 3, comparisons: 1, autoFixes: false, pdfExport: false, csvExport: false, apiAccess: false, whiteLabel: false, teamAccess: false, scheduledScans: false, history: 1 },
    pro: { scans: 50, comparisons: 50, autoFixes: true, pdfExport: true, csvExport: true, apiAccess: false, whiteLabel: false, teamAccess: false, scheduledScans: false, history: 90 },
    business: { scans: 500, comparisons: 500, autoFixes: true, pdfExport: true, csvExport: true, apiAccess: true, whiteLabel: true, teamAccess: 5, scheduledScans: true, history: 365 }
};

function getScanLimit(plan) {
    return PLAN_LIMITS[plan]?.scans || 3;
}

function getComparisonLimit(plan) {
    return PLAN_LIMITS[plan]?.comparisons || 1;
}

module.exports = dbModule;
module.exports.PLAN_LIMITS = PLAN_LIMITS;
module.exports.PLAN_FEATURES = PLAN_FEATURES;
module.exports.getScanLimit = getScanLimit;
module.exports.getComparisonLimit = getComparisonLimit;
module.exports.dbReady = dbReady;
module.exports.pool = pool;
module.exports.dbType = usePostgres ? 'PostgreSQL' : 'SQLite';
