const express = require('express');
const cors = require('cors');
const path = require('path');
const dns = require('dns');
const https = require('https');
const SimpleScanner = require('../../scanner/simple-scanner');
const dbModule = require('../database');
const db = dbModule;
const { authenticateToken } = require('../middleware/auth');
const { PLAN_LIMITS } = dbModule;

const router = express.Router();

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function checkSiteExists(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        dns.lookup(hostname, (err, address) => {
            if (err || !address) {
                return resolve({ exists: false, error: 'DNS не найден. Проверьте правильность адреса.' });
            }
            
            const req = https.get(url, { 
                timeout: 10000,
                rejectUnauthorized: false
            }, (res) => {
                if (res.statusCode >= 400 && res.statusCode !== 401 && res.statusCode !== 403) {
                    return resolve({ exists: false, error: `Сайт недоступен (статус: ${res.statusCode})` });
                }
                resolve({ exists: true, statusCode: res.statusCode });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({ exists: false, error: 'Превышено время ожидания ответа' });
            });
            
            req.on('error', (e) => {
                resolve({ exists: false, error: 'Не удалось подключиться к сайту' });
            });
        });
    });
}

router.post('/', authenticateToken, async (req, res) => {
    const { url, modules } = req.body;

    if (!url) {
        return res.status(400).json({ 
            success: false, 
            error: 'URL required' 
        });
    }

    if (!isValidUrl(url)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Некорректный URL. Пример: https://example.com' 
        });
    }

    const siteCheck = await checkSiteExists(url);
    if (!siteCheck.exists) {
        return res.status(400).json({ 
            success: false, 
            error: siteCheck.error 
        });
    }

    const userId = req.user.id;
    const plan = req.user.plan || 'free';

    // Check and update scan limits
    db.get('SELECT scans_used, scans_reset_at, plan FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const now = new Date();
        const resetDate = new Date(user.scans_reset_at);
        const monthDiff = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

        let scansUsed = user.scans_used || 0;
        
        // Reset if new month
        if (monthDiff) {
            scansUsed = 0;
            db.run('UPDATE users SET scans_used = 0, scans_reset_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
        }

        const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
        const limit = planLimits.scans;

        if (scansUsed >= limit) {
            return res.status(403).json({ 
                success: false, 
                error: `Лимит сканирований исчерпан. Доступно ${limit} в месяц. Обновите план для большего количества.`,
                scansUsed: scansUsed,
                scansLimit: limit
            });
        }

        // Perform scan
        try {
            const scanner = new SimpleScanner();

            scanner.scan(url, { modules }).then(result => {
                // Increment scan count
                db.run('UPDATE users SET scans_used = scans_used + 1 WHERE id = ?', [userId]);

                res.json({
                    success: true,
                    data: result,
                    scansLeft: limit - scansUsed - 1,
                    scansLimit: limit,
                    plan: plan
                });

            }).catch(error => {
                console.error('Scan error:', error);
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            });

        } catch (error) {
            console.error('Scanner error:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });
});

router.get('/limits', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const plan = req.user.plan || 'free';
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const limit = planLimits.scans;

    db.get('SELECT scans_used, scans_reset_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const now = new Date();
        const resetDate = new Date(user.scans_reset_at);
        const monthDiff = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

        if (monthDiff) {
            return res.json({
                success: true,
                scansUsed: 0,
                scansLeft: limit,
                scansLimit: limit,
                plan: plan,
                resetsAt: now.toISOString()
            });
        }

        res.json({
            success: true,
            scansUsed: user.scans_used || 0,
            scansLeft: Math.max(0, limit - (user.scans_used || 0)),
            scansLimit: limit,
            plan: plan,
            resetsAt: user.scans_reset_at
        });
    });
});

router.get('/test', async (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'Scanner v2 ready'
    });
});

module.exports = router;
