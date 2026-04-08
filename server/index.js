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

// Disable caching for all responses
app.use((req, res, next) => {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    next();
});

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
    <title>Оплата прошла успешно! 🎉 - Site Doctor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f1729 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            overflow-x: hidden;
            position: relative;
        }
        /* Confetti */
        .confetti-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: hidden;
            z-index: 1;
        }
        .confetti {
            position: absolute;
            width: 10px;
            height: 10px;
            opacity: 0;
        }
        @keyframes confetti-fall {
            0% {
                transform: translateY(-100px) rotate(0deg);
                opacity: 1;
            }
            100% {
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
            }
        }
        .container {
            text-align: center;
            padding: 40px;
            max-width: 550px;
            position: relative;
            z-index: 10;
        }
        /* Animated Check Icon */
        .success-icon {
            width: 120px;
            height: 120px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #4ade80, #22c55e);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse-glow 2s ease-in-out infinite;
            box-shadow: 0 0 60px rgba(74, 222, 128, 0.4);
        }
        .success-icon svg {
            width: 60px;
            height: 60px;
            stroke: white;
            stroke-width: 3;
            fill: none;
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            animation: draw-check 1s ease forwards 0.3s;
        }
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 60px rgba(74, 222, 128, 0.4); }
            50% { box-shadow: 0 0 80px rgba(74, 222, 128, 0.6); }
        }
        @keyframes draw-check {
            to { stroke-dashoffset: 0; }
        }
        h1 {
            font-size: 36px;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #4ade80, #22c55e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: fade-in-up 0.6s ease forwards;
        }
        .subtitle {
            color: #9ca3af;
            font-size: 18px;
            margin-bottom: 30px;
            animation: fade-in-up 0.6s ease forwards 0.2s;
            opacity: 0;
            animation-fill-mode: forwards;
        }
        /* Plan Card */
        .plan-card {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            animation: fade-in-up 0.6s ease forwards 0.4s;
            opacity: 0;
            animation-fill-mode: forwards;
        }
        @keyframes fade-in-up {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .plan-badge {
            display: inline-block;
            padding: 8px 24px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            border-radius: 30px;
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 20px;
            animation: shimmer 2s linear infinite;
            background-size: 200% 100%;
        }
        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
        }
        .stat-item {
            text-align: center;
            padding: 15px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 700;
            background: linear-gradient(135deg, #4ade80, #22c55e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stat-label {
            color: #9ca3af;
            font-size: 14px;
            margin-top: 5px;
        }
        /* Buttons */
        .btn-primary {
            display: inline-block;
            padding: 18px 50px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: white;
            text-decoration: none;
            border-radius: 16px;
            font-weight: 600;
            font-size: 18px;
            transition: all 0.3s ease;
            animation: fade-in-up 0.6s ease forwards 0.6s;
            opacity: 0;
            animation-fill-mode: forwards;
            box-shadow: 0 10px 40px rgba(99, 102, 241, 0.4);
        }
        .btn-primary:hover {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 15px 50px rgba(99, 102, 241, 0.5);
        }
        .btn-primary:active {
            transform: translateY(-1px) scale(1);
        }
        /* Loading State */
        .loading-text {
            color: #6366f1;
            font-size: 18px;
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        /* Error State */
        .error-card {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 16px;
            padding: 20px;
            margin-top: 20px;
        }
        /* Particles */
        .particle {
            position: absolute;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            pointer-events: none;
        }
        @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
        }
        /* Fireworks */
        .firework {
            position: absolute;
            width: 4px;
            height: 4px;
            border-radius: 50%;
        }
        @keyframes explode {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(0); opacity: 0; }
        }
    </style>
</head>
<body>
    <div class="confetti-container" id="confettiContainer"></div>
    
    <div class="container">
        <div class="success-icon" id="successIcon">
            <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </div>
        
        <h1 id="title">Поздравляем!</h1>
        <p class="subtitle" id="subtitle">Ваша оплата успешно обработана</p>
        
        <div class="plan-card" id="planCard" style="display: none;">
            <div class="plan-badge" id="planBadge">PRO</div>
            
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value" id="scansValue">50</div>
                    <div class="stat-label">Сканирований/мес</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" id="comparisonsValue">50</div>
                    <div class="stat-label">Сравнений/мес</div>
                </div>
            </div>
        </div>
        
        <p class="loading-text" id="loadingText">Обрабатываем вашу оплату<span id="dots">...</span></p>
        
        <a href="/scan" class="btn-primary" id="startBtn" style="display: none;">
            🚀 Начать использовать
        </a>
        
        <div class="error-card" id="errorCard" style="display: none;">
            <p id="errorText" style="color: #f87171; margin: 0;"></p>
        </div>
    </div>

    <script>
        const BASE_URL = 'https://site--site-doctor--4rfn89yxsfpw.code.run';
        
        // Create confetti
        function createConfetti() {
            const container = document.getElementById('confettiContainer');
            const colors = ['#4ade80', '#6366f1', '#a855f7', '#f59e0b', '#ec4899', '#22c55e'];
            
            for (let i = 0; i < 100; i++) {
                setTimeout(() => {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti';
                    confetti.style.left = Math.random() * 100 + '%';
                    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.width = (Math.random() * 10 + 5) + 'px';
                    confetti.style.height = (Math.random() * 10 + 5) + 'px';
                    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
                    confetti.style.animation = 'confetti-fall ' + (Math.random() * 3 + 2) + 's linear forwards';
                    container.appendChild(confetti);
                    
                    setTimeout(() => confetti.remove(), 5000);
                }, i * 50);
            }
            
            // Repeat confetti every 5 seconds for a while
            let repeatCount = 0;
            const repeatInterval = setInterval(() => {
                if (repeatCount++ > 3) {
                    clearInterval(repeatInterval);
                    return;
                }
                for (let i = 0; i < 30; i++) {
                    setTimeout(() => {
                        const confetti = document.createElement('div');
                        confetti.className = 'confetti';
                        confetti.style.left = Math.random() * 100 + '%';
                        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                        confetti.style.width = (Math.random() * 8 + 4) + 'px';
                        confetti.style.height = (Math.random() * 8 + 4) + 'px';
                        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
                        confetti.style.animation = 'confetti-fall ' + (Math.random() * 2 + 1.5) + 's linear forwards';
                        container.appendChild(confetti);
                        setTimeout(() => confetti.remove(), 4000);
                    }, i * 30);
                }
            }, 5000);
        }
        
        // Animate dots
        function animateDots() {
            const dotsEl = document.getElementById('dots');
            let count = 0;
            setInterval(() => {
                count = (count + 1) % 4;
                dotsEl.textContent = '.'.repeat(count || 3);
            }, 500);
        }
        
        async function activatePlan() {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session_id');
            const token = localStorage.getItem('auth_token');
            
            if (!sessionId) {
                document.getElementById('loadingText').style.display = 'none';
                document.getElementById('errorCard').style.display = 'block';
                document.getElementById('errorText').textContent = 'Ошибка: данные сессии не найдены';
                return;
            }
            
            if (!token) {
                document.getElementById('loadingText').style.display = 'none';
                document.getElementById('errorCard').style.display = 'block';
                document.getElementById('errorText').textContent = 'Войдите в аккаунт для активации плана';
                return;
            }
            
            try {
                const response = await fetch(BASE_URL + '/api/payment/activate-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ session_id: sessionId })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update UI
                    document.getElementById('loadingText').style.display = 'none';
                    document.getElementById('title').textContent = 'Оплата прошла!';
                    document.getElementById('subtitle').textContent = 'Ваш план активирован';
                    
                    // Plan details
                    const plan = data.plan || 'pro';
                    const planNames = { pro: 'PRO', agency: 'AGENCY', free: 'FREE' };
                    document.getElementById('planBadge').textContent = planNames[plan] || 'PRO';
                    
                    // Stats
                    const limits = { free: { scans: 3, comparisons: 1 }, pro: { scans: 50, comparisons: 50 }, agency: { scans: 500, comparisons: 500 } };
                    const stats = limits[plan] || limits.pro;
                    document.getElementById('scansValue').textContent = stats.scans;
                    document.getElementById('comparisonsValue').textContent = stats.comparisons;
                    
                    // Show card and button
                    document.getElementById('planCard').style.display = 'block';
                    document.getElementById('startBtn').style.display = 'inline-block';
                    
                    // Update localStorage
                    if (data.user) {
                        localStorage.setItem('user', JSON.stringify(data.user));
                    }
                    
                    // Start confetti!
                    createConfetti();
                    
                    // Extra celebration
                    setTimeout(() => createConfetti(), 1000);
                } else {
                    document.getElementById('loadingText').style.display = 'none';
                    document.getElementById('errorCard').style.display = 'block';
                    document.getElementById('errorText').textContent = data.message || 'Не удалось активировать план';
                }
            } catch (err) {
                document.getElementById('loadingText').style.display = 'none';
                document.getElementById('errorCard').style.display = 'block';
                document.getElementById('errorText').textContent = 'Ошибка соединения. Обновите страницу.';
            }
        }
        
        // Initialize
        animateDots();
        activatePlan();
    </script>
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
            background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #1f1f35 100%);
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
        .icon {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #f59e0b, #eab308);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse-warning 2s ease-in-out infinite;
            box-shadow: 0 0 50px rgba(245, 158, 11, 0.3);
        }
        .icon svg {
            width: 50px;
            height: 50px;
            stroke: white;
            stroke-width: 2;
            fill: none;
        }
        @keyframes pulse-warning {
            0%, 100% { box-shadow: 0 0 50px rgba(245, 158, 11, 0.3); }
            50% { box-shadow: 0 0 70px rgba(245, 158, 11, 0.5); }
        }
        h1 { 
            font-size: 32px; 
            margin-bottom: 15px; 
            color: #f59e0b; 
            animation: fade-in-up 0.6s ease forwards;
        }
        @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        p { 
            color: #9ca3af; 
            font-size: 18px; 
            margin-bottom: 30px; 
            line-height: 1.6;
            animation: fade-in-up 0.6s ease forwards 0.2s;
            opacity: 0;
            animation-fill-mode: forwards;
        }
        .btn {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: white;
            text-decoration: none;
            border-radius: 14px;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            animation: fade-in-up 0.6s ease forwards 0.4s;
            opacity: 0;
            animation-fill-mode: forwards;
            box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);
        }
        .btn:hover { 
            transform: translateY(-3px); 
            box-shadow: 0 15px 40px rgba(99, 102, 241, 0.5);
        }
        .try-again {
            margin-top: 20px;
            animation: fade-in-up 0.6s ease forwards 0.6s;
            opacity: 0;
            animation-fill-mode: forwards;
        }
        .try-again a {
            color: #6366f1;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
        }
        .try-again a:hover {
            color: #a855f7;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
        </div>
        <h1>Оплата отменена</h1>
        <p>Оплата не была завершена. Ничего страшного - вы можете попробовать снова, когда будете готовы.</p>
        <a href="/" class="btn">🔄 Вернуться на главную</a>
        <div class="try-again">
            <p style="margin-bottom: 0; font-size: 14px;">Планы начинаются от <strong style="color: #4ade80;">$39/мес</strong> - <a href="/#pricing">Посмотреть тарифы</a></p>
        </div>
    </div>
</body>
</html>
    `);
});

// Serve static files from client directory (but not root)
app.use(express.static(path.join(__dirname, '../client'), {
    index: false,
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
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
    const dbModule = require('./database');
    if (dbModule.dbType === 'PostgreSQL') {
        db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'", [], (err, rows) => {
            if (err) {
                res.json({ error: err.message });
            } else {
                res.json({ dbType: 'PostgreSQL', usersSchema: rows });
            }
        });
    } else {
        db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", [], (err, rows) => {
            if (err) {
                res.json({ error: err.message });
            } else {
                res.json({ dbType: 'SQLite', usersSchema: rows[0]?.sql });
            }
        });
    }
});

// Debug: get recent payments
app.get('/api/debug/payments', (req, res) => {
    const db = require('./database');
    db.all('SELECT payment_id, user_id, plan, period, amount, currency, method, status, created_at FROM payments ORDER BY created_at DESC LIMIT 50', [], (err, rows) => {
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

// Debug: set user plan (for testing only)
app.post('/api/debug/set-plan', async (req, res) => {
    const { userId, plan } = req.body;
    const db = require('./database');
    
    if (!userId || !plan) {
        return res.status(400).json({ error: 'userId and plan required' });
    }
    
    if (!['free', 'pro', 'agency'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan. Use: free, pro, agency' });
    }
    
    const subscriptionEnd = plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const scansLeft = plan === 'free' ? 3 : plan === 'pro' ? 50 : 500;
    
    db.run(
        'UPDATE users SET plan = $1, subscription_end = $2, subscription_cancelled = 0, scans_used = 0, scans_left = $3, comparisons_used = 0 WHERE id = $4',
        [plan, subscriptionEnd, scansLeft, userId],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, userId, plan, message: `Plan set to ${plan}` });
            }
        }
    );
});

// Debug: get all users with their plans
app.get('/api/debug/users', async (req, res) => {
    const db = require('./database');
    db.all('SELECT id, email, plan, comparisons_used, scans_used FROM users ORDER BY id DESC LIMIT 50', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, users: rows });
        }
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
        
        db.all('SELECT payment_id, plan, period, amount, currency, method, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC', [decoded.id], (err, rows) => {
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
