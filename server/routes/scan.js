const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

let SiteScanner = null;
try {
    const scannerModule = require('../../scanner');
    SiteScanner = scannerModule.SiteScanner;
} catch (err) {
    console.error('Warning: Could not load SiteScanner:', err.message);
}

async function performScan(url) {
    if (!SiteScanner) {
        throw new Error('Scanner not available');
    }
    
    const scanner = new SiteScanner({ maxInstances: 2 });
    try {
        const results = await scanner.scan(url);
        return results;
    } finally {
        try {
            await scanner.close();
        } catch (e) {}
    }
}

router.post('/scan', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const userId = req.user.id;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    if (!SiteScanner) {
        return res.status(503).json({ 
            success: false, 
            error: 'Scanner is not available. Please try again later.' 
        });
    }

    db.get('SELECT plan, scans_left FROM users WHERE id = ?', [userId], async (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const plan = user.plan || 'free';
        const scansLeft = user.scans_left ?? (plan === 'free' ? 3 : plan === 'pro' ? 50 : 500);

        if (plan !== 'business' && scansLeft <= 0) {
            return res.status(403).json({ 
                success: false, 
                error: 'No scans left. Please upgrade your plan.',
                upgradeRequired: true
            });
        }

        try {
            const results = await performScan(url);

            db.run(
                'INSERT INTO scan_history (user_id, url, results) VALUES (?, ?, ?)',
                [userId, url, JSON.stringify(results)]
            );

            if (plan !== 'business') {
                db.run('UPDATE users SET scans_left = scans_left - 1 WHERE id = ?', [userId]);
            }

            res.json({
                success: true,
                data: results,
                scansLeft: scansLeft - 1,
                plan: plan
            });

        } catch (error) {
            console.error('Scan error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

router.get('/history', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.all(
        'SELECT id, url, results, created_at FROM scan_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Database error' });
            }

            const history = rows.map(row => ({
                id: row.id,
                url: row.url,
                results: JSON.parse(row.results || '{}'),
                createdAt: row.created_at
            }));

            res.json({ success: true, history });
        }
    );
});

router.get('/stats', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT plan, scans_left FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const plan = user.plan || 'free';
        const scansLeft = user.scans_left ?? (plan === 'free' ? 3 : plan === 'pro' ? 50 : 500);

        db.get('SELECT COUNT(*) as total FROM scan_history WHERE user_id = ?', [userId], (err, count) => {
            res.json({
                success: true,
                plan: plan,
                scansLeft: scansLeft,
                totalScans: count?.total || 0
            });
        });
    });
});

module.exports = router;
