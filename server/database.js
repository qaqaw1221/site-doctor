const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT UNIQUE,
                password TEXT NOT NULL,
                plan TEXT DEFAULT 'free',
                scans_used INTEGER DEFAULT 0,
                scans_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                subscription_end TEXT,
                subscription_cancelled INTEGER DEFAULT 0,
                email_verified INTEGER DEFAULT 0,
                verification_code TEXT,
                verification_expires TEXT,
                comparisons_used INTEGER DEFAULT 0
            )
        `, (err) => {
            if (err) console.error('Error creating users table:', err.message);
            else console.log('Users table ready');
        });

        db.run(`ALTER TABLE users ADD COLUMN scans_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN scans_limit INTEGER DEFAULT 3`, () => {});

        db.run(`
            CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                url TEXT NOT NULL,
                results TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `, (err) => {
            if (err) console.error('Error creating scan_history table:', err.message);
            else console.log('Scan history table ready');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                period TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                method TEXT,
                status TEXT DEFAULT 'pending',
                external_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `, (err) => {
            if (err) console.error('Error creating payments table:', err.message);
            else console.log('Payments table ready');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS comparison_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                main_url TEXT NOT NULL,
                competitors TEXT NOT NULL,
                results TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `, (err) => {
            if (err) console.error('Error creating comparison_history table:', err.message);
            else console.log('Comparison history table ready');
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS scheduled_scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                name TEXT,
                frequency TEXT DEFAULT 'daily',
                last_scan_at DATETIME,
                next_scan_at DATETIME,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `, (err) => {
            if (err) console.error('Error creating scheduled_scans table:', err.message);
            else console.log('Scheduled scans table ready');
        });
    });
}

// Plan limits
const PLAN_LIMITS = {
    free: { scans: 3, comparisons: 1 },
    pro: { scans: 50, comparisons: 50 },
    business: { scans: 500, comparisons: 500 }
};

// Plan features
const PLAN_FEATURES = {
    free: {
        scans: 3,
        comparisons: 1,
        autoFixes: false,
        pdfExport: false,
        csvExport: false,
        apiAccess: false,
        whiteLabel: false,
        teamAccess: false,
        scheduledScans: false,
        history: 1 // days
    },
    pro: {
        scans: 50,
        comparisons: 50,
        autoFixes: true,
        pdfExport: true,
        csvExport: true,
        apiAccess: false,
        whiteLabel: false,
        teamAccess: false,
        scheduledScans: false,
        history: 90 // days
    },
    business: {
        scans: 500,
        comparisons: 500,
        autoFixes: true,
        pdfExport: true,
        csvExport: true,
        apiAccess: true,
        whiteLabel: true,
        teamAccess: 5,
        scheduledScans: true,
        history: 365 // days
    }
};

function getScanLimit(plan) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    return limits.scans;
}

function getComparisonLimit(plan) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    return limits.comparisons;
}

// Export db directly for compatibility, and also as named exports
module.exports = db;
module.exports.PLAN_LIMITS = PLAN_LIMITS;
module.exports.PLAN_FEATURES = PLAN_FEATURES;
module.exports.getScanLimit = getScanLimit;
module.exports.getComparisonLimit = getComparisonLimit;
