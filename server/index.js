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

// Serve landing page for root route (MUST be before static!)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/landing.html'));
});

// Serve app for /scan route
app.get('/scan', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Serve favicon
app.get('/favicon.svg', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/favicon.svg'));
});

// Payment success page
app.get('/payment/success', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата прошла успешно - Site Doctor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            max-width: 500px;
        }
        .success-icon {
            font-size: 80px;
            margin-bottom: 30px;
        }
        h1 {
            font-size: 32px;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #4ade80, #22c55e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p {
            color: #9ca3af;
            font-size: 18px;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .btn {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Оплата прошла успешно!</h1>
        <p>Спасибо за покупку! Ваш план активирован. Теперь вы можете пользоваться всеми функциями Site Doctor без ограничений.</p>
        <a href="/scan" class="btn">Перейти к сканированию</a>
    </div>
</body>
</html>
    `);
});

// Payment cancelled page
app.get('/payment/cancelled', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата отменена - Site Doctor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            max-width: 500px;
        }
        .icon { font-size: 80px; margin-bottom: 30px; }
        h1 { font-size: 32px; margin-bottom: 20px; color: #f59e0b; }
        p { color: #9ca3af; font-size: 18px; margin-bottom: 30px; line-height: 1.6; }
        .btn {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4); }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔄</div>
        <h1>Оплата отменена</h1>
        <p>Оплата не была завершена. Вы можете попробовать снова, когда будете готовы.</p>
        <a href="/scan" class="btn">Вернуться на сайт</a>
    </div>
</body>
</html>
    `);
});

// Serve static files from client directory (but not root)
app.use(express.static(path.join(__dirname, '../client'), {
    index: false // Don't serve index.html for root
}));

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
    const dbModule = require('./database');
    const dbType = dbModule.pool ? 'PostgreSQL' : 'SQLite';
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: dbType
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

// Debug: get recent payments
app.get('/api/debug/payments', (req, res) => {
    const db = require('./database');
    db.all('SELECT payment_id, user_id, plan, period, amount, currency, method, status, created_at FROM payments ORDER BY created_at DESC LIMIT 50', (err, rows) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ 
                count: rows.length,
                payments: rows 
            });
        }
    });
});

// Debug: check NovaPay webhook status
app.post('/api/debug/test-webhook', async (req, res) => {
    const db = require('./database');
    const paymentRoutes = require('./routes/payment');
    
    const testPayment = {
        merchant_id: 2,
        order_id: 'TEST_' + Date.now(),
        status: 'success',
        session_id: 'test_session_' + Date.now(),
        amount: 1599,
        currency: 'UAH'
    };
    
    console.log('Test webhook data:', testPayment);
    
    res.json({ 
        received: true, 
        testPayment,
        message: 'Check server logs to see webhook processing'
    });
});

// Debug: get user's payments (by token)
app.get('/api/debug/my-payments', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = require('./database');
        
        db.all('SELECT payment_id, plan, period, amount, currency, method, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC', [decoded.id], (err, rows) => {
            if (err) {
                res.json({ error: err.message });
            } else {
                res.json({ 
                    userId: decoded.id,
                    payments: rows 
                });
            }
        });
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Site Doctor running on port ${PORT}`);
    console.log(`Database: SQLite`);
});
