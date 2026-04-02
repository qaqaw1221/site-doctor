const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scan');
const fixesRoutes = require('./routes/fixes');
const paymentRoutes = require('./routes/payment');
const compareRoutes = require('./routes/compare');
const exportRoutes = require('./routes/export');
const schedulerRoutes = require('./routes/scheduler');

// Import database (SQLite)
require('./database');

const app = express();

// Middleware
app.use(cors());

// Raw body for webhook verification (must be before express.json)
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/fixes', fixesRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/scheduler', schedulerRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'SQLite'
    });
});

// Email test endpoint
app.get('/api/test-email', async (req, res) => {
    const { testConnection, sendVerificationCode } = require('./utils/email');
    
    // console.log('Testing SMTP connection...');
    // console.log('SMTP_HOST:', process.env.SMTP_HOST);
    // console.log('SMTP_PORT:', process.env.SMTP_PORT);
    // console.log('SMTP_USER:', process.env.SMTP_USER);
    
    const connected = await testConnection();
    if (connected) {
        res.json({ success: true, message: 'SMTP connected successfully' });
    } else {
        res.json({ success: false, message: 'SMTP connection failed - check logs' });
    }
});

// Debug: get database schema
app.get('/api/debug/db', (req, res) => {
    const db = require('./database');
    db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, rows) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ usersSchema: rows[0]?.sql });
        }
    });
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Site Doctor running on port ${PORT}`);
    console.log(`Database: SQLite`);
});
