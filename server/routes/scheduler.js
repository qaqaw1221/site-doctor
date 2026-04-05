const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dbModule = require('../database');
const db = dbModule;
const { PLAN_FEATURES, getScanLimit } = dbModule;
const SimpleScanner = require('../../scanner/simple-scanner');

router.post('/create', authenticateToken, (req, res) => {
    const { url, name, frequency } = req.body;
    const userPlan = req.user.plan || 'free';
    
    if (!PLAN_FEATURES[userPlan]?.scheduledScans) {
        return res.status(403).json({
            success: false,
            error: 'Запланированные сканы доступны только в тарифе Business'
        });
    }
    
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL обязателен'
        });
    }
    
    try {
        new URL(url);
    } catch {
        return res.status(400).json({
            success: false,
            error: 'Некорректный URL'
        });
    }
    
    const frequencies = ['hourly', 'daily', 'weekly'];
    const freq = frequencies.includes(frequency) ? frequency : 'daily';
    
    const nextScanAt = calculateNextScan(freq);
    
    db.runWithReturn(
        `INSERT INTO scheduled_scans (user_id, url, name, frequency, next_scan_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, url, name || '', freq, nextScanAt],
        function(err, result) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Ошибка при создании расписания'
                });
            }
            
            res.json({
                success: true,
                id: result?.id || 0,
                message: 'Скан добавлен в расписание'
            });
        }
    );
});

router.get('/list', authenticateToken, (req, res) => {
    db.all(
        `SELECT * FROM scheduled_scans WHERE user_id = ? ORDER BY created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Ошибка базы данных'
                });
            }
            
            res.json({
                success: true,
                schedules: rows.map(row => ({
                    id: row.id,
                    url: row.url,
                    name: row.name,
                    frequency: row.frequency,
                    frequencyText: getFrequencyText(row.frequency),
                    lastScanAt: row.last_scan_at,
                    nextScanAt: row.next_scan_at,
                    isActive: !!row.is_active,
                    createdAt: row.created_at
                }))
            });
        }
    );
});

router.put('/:id/toggle', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;
    
    db.run(
        `UPDATE scheduled_scans SET is_active = ? WHERE id = ? AND user_id = ?`,
        [isActive ? 1 : 0, id, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Ошибка обновления'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Расписание не найдено'
                });
            }
            
            res.json({
                success: true,
                message: isActive ? 'Скан активирован' : 'Скан приостановлен'
            });
        }
    );
});

router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    
    db.run(
        `DELETE FROM scheduled_scans WHERE id = ? AND user_id = ?`,
        [id, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Ошибка удаления'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Расписание не найдено'
                });
            }
            
            res.json({
                success: true,
                message: 'Расписание удалено'
            });
        }
    );
});

router.post('/:id/scan-now', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    db.get(
        `SELECT * FROM scheduled_scans WHERE id = ? AND user_id = ?`,
        [id, req.user.id],
        async (err, row) => {
            if (err || !row) {
                return res.status(404).json({
                    success: false,
                    error: 'Расписание не найдено'
                });
            }
            
            try {
                const scanner = new SimpleScanner();
                const result = await scanner.scan(row.url, { modules: ['seo', 'performance', 'accessibility', 'links', 'mobile'] });
                
                const nextScanAt = calculateNextScan(row.frequency);
                
                db.run(
                    `UPDATE scheduled_scans SET last_scan_at = datetime('now'), next_scan_at = ? WHERE id = ?`,
                    [nextScanAt, id],
                    (err) => {
                        if (err) console.error('Error updating scan time:', err);
                    }
                );
                
                db.run(
                    `INSERT INTO scan_history (user_id, url, results) VALUES (?, ?, ?)`,
                    [req.user.id, row.url, JSON.stringify(result)],
                    (err) => {
                        if (err) console.error('Error saving scan history:', err);
                    }
                );
                
                res.json({
                    success: true,
                    score: result.overallScore,
                    issues: result.issues?.length || 0,
                    message: 'Скан выполнен'
                });
                
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Ошибка сканирования: ' + error.message
                });
            }
        }
    );
});

function calculateNextScan(frequency) {
    const now = new Date();
    let next;
    
    switch (frequency) {
        case 'hourly':
            next = new Date(now.getTime() + 60 * 60 * 1000);
            break;
        case 'daily':
            next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            break;
        case 'weekly':
            next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
        default:
            next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
    
    return next.toISOString();
}

function getFrequencyText(frequency) {
    const texts = {
        hourly: 'Каждый час',
        daily: 'Раз в день',
        weekly: 'Раз в неделю'
    };
    return texts[frequency] || 'Раз в день';
}

module.exports = router;
