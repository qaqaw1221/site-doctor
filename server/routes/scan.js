const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { SiteScanner } = require('../../scanner');

const router = express.Router();

// Scan website - protected route
router.post('/scan', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const userId = req.user.id;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Check if user has scans left
    db.get('SELECT plan, scans_left FROM users WHERE id = ?', [userId], async (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Business plan has unlimited scans
        if (user.plan !== 'business' && user.scans_left <= 0) {
            return res.status(403).json({ 
                success: false, 
                error: 'No scans left. Please upgrade your plan.',
                upgradeRequired: true
            });
        }

        try {
            // Perform scan
            const scanner = new SiteScanner();
            const results = await scanner.scan(url);

            // Save scan to history
            db.run(
                'INSERT INTO scan_history (user_id, url, results) VALUES (?, ?, ?)',
                [userId, url, JSON.stringify(results)],
                function(err) {
                    if (err) {
                        console.error('Error saving scan history:', err);
                    }
                }
            );

            // Decrement scans_left if not business
            if (user.plan !== 'business') {
                db.run('UPDATE users SET scans_left = scans_left - 1 WHERE id = ?', [userId]);
            }

            // Get updated scans_left
            db.get('SELECT scans_left FROM users WHERE id = ?', [userId], (err, updatedUser) => {
                res.json({
                    success: true,
                    data: results,
                    scansLeft: updatedUser?.scans_left || 0,
                    plan: user.plan
                });
            });

        } catch (error) {
            console.error('Scan error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// Get scan history - protected route
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

// Get user stats
router.get('/stats', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT plan, scans_left FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        db.get('SELECT COUNT(*) as total FROM scan_history WHERE user_id = ?', [userId], (err, count) => {
            res.json({
                success: true,
                plan: user.plan,
                scansLeft: user.scans_left,
                totalScans: count?.total || 0
            });
        });
    });
});

module.exports = router;
