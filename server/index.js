const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scan');
const scanV2Routes = require('./routes/scan-v2');
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
app.use(express.json());

// Raw body for webhook verification
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/scan/v2', scanV2Routes);
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
    
    console.log('Testing SMTP connection...');
    console.log('SMTP_HOST:', process.env.SMTP_HOST);
    console.log('SMTP_PORT:', process.env.SMTP_PORT);
    console.log('SMTP_USER:', process.env.SMTP_USER);
    
    const connected = await testConnection();
    if (connected) {
        res.json({ success: true, message: 'SMTP connected successfully' });
    } else {
        res.json({ success: false, message: 'SMTP connection failed - check logs' });
    }
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Site Doctor running on http://localhost:${PORT}`);
    console.log(`Database: SQLite`);
});
