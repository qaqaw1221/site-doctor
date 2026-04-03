const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

let db = null;

const dbReady = initSqlJs().then(SQL => {
    try {
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
            console.log('Loaded existing SQLite database');
        } else {
            db = new SQL.Database();
            console.log('Created new SQLite database');
        }
        initializeDatabase();
    } catch (err) {
        console.error('Error initializing database:', err);
        db = new SQL.Database();
        initializeDatabase();
    }
});

function initializeDatabase() {
    try {
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
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
                comparisons_used INTEGER DEFAULT 0,
                scans_left INTEGER DEFAULT 3
            )
        `);
        console.log('Users table ready');

        db.run(`
            CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                url TEXT NOT NULL,
                results TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('Scan history table ready');

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
        `);
        console.log('Payments table ready');

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
        `);
        console.log('Comparison history table ready');

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
        `);
        console.log('Scheduled scans table ready');

        saveDatabase();
    } catch (err) {
        console.error('Error creating tables:', err);
    }
}

function saveDatabase() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (err) {
        console.error('Error saving database:', err);
    }
}

const dbModule = {
    run(sql, params = [], callback) {
        dbReady.then(() => {
            try {
                db.run(sql, params);
                saveDatabase();
                if (callback) callback(null);
            } catch (err) {
                if (callback) callback(err);
            }
        });
    },
    get(sql, params = [], callback) {
        dbReady.then(() => {
            try {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    stmt.free();
                    if (callback) callback(null, row);
                } else {
                    stmt.free();
                    if (callback) callback(null, undefined);
                }
            } catch (err) {
                if (callback) callback(err);
            }
        });
    },
    all(sql, params = [], callback) {
        dbReady.then(() => {
            try {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                const results = [];
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                if (callback) callback(null, results);
            } catch (err) {
                if (callback) callback(err);
            }
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
