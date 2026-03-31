const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dbModule = require('../database');
const { PLAN_FEATURES } = dbModule;

router.get('/csv/:scanId', authenticateToken, (req, res) => {
    const { scanId } = req.params;
    const userPlan = req.user.plan || 'free';
    
    if (!PLAN_FEATURES[userPlan]?.csvExport) {
        return res.status(403).json({
            success: false,
            error: 'CSV экспорт доступен только в платных планах'
        });
    }
    
    dbModule.get(`SELECT * FROM scan_history WHERE id = ? AND user_id = ?`, [scanId, req.user.id], (err, row) => {
        if (err || !row) {
            return res.status(404).json({
                success: false,
                error: 'Скан не найден'
            });
        }
        
        const data = JSON.parse(row.results || '{}');
        
        const csv = generateCSV(data, row.url);
        
        const filename = `site-doctor-${new URL(row.url).hostname.replace('www.', '')}-${new Date(row.created_at).toISOString().split('T')[0]}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\ufeff' + csv);
    });
});

router.get('/history', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    
    dbModule.all(
        `SELECT id, url, created_at FROM scan_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [userId, limit],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка базы данных' });
            }
            
            res.json({
                success: true,
                scans: rows.map(row => ({
                    id: row.id,
                    url: row.url,
                    date: row.created_at,
                    canExport: PLAN_FEATURES[req.user.plan || 'free']?.csvExport
                }))
            });
        }
    );
});

function generateCSV(data, url) {
    const lines = [];
    
    lines.push('Site Doctor - Отчёт о сканировании');
    lines.push(`URL,${escapeCSV(url)}`);
    lines.push(`Дата сканирования,${new Date().toLocaleString('ru-RU')}`);
    lines.push('');
    
    lines.push('=== ОБЩИЕ ПОКАЗАТЕЛИ ===');
    lines.push('Метрика,Значение,Оценка');
    lines.push(`Общий балл,${data.overallScore || 0}/100`);
    lines.push(`SEO балл,${data.scores?.seo || 0}/100`);
    lines.push(`Производительность,${data.scores?.performance || 0}/100`);
    lines.push(`Доступность,${data.scores?.accessibility || 0}/100`);
    lines.push(`Ссылки,${data.scores?.links || 0}/100`);
    lines.push(`Мобильные,${data.scores?.mobile || 0}/100`);
    lines.push('');
    
    const seo = data.seo || {};
    lines.push('=== SEO ===');
    lines.push('Параметр,Значение');
    lines.push(`Title,${escapeCSV(seo.title || '')}`);
    lines.push(`Description,${escapeCSV(seo.description || '')}`);
    lines.push(`Viewport,${seo.viewport ? 'Да' : 'Нет'}`);
    lines.push(`Canonical,${seo.canonical ? 'Да' : 'Нет'}`);
    lines.push(`H1,${seo.headingsCount?.h1 || 0}`);
    lines.push(`H2,${seo.headingsCount?.h2 || 0}`);
    lines.push(`Изображений,${seo.images?.total || 0}`);
    lines.push(`Без alt,${seo.images?.withoutAlt || 0}`);
    lines.push(`Open Graph,${seo.ogTitle && seo.ogDescription ? 'Да' : 'Нет'}`);
    lines.push('');
    
    const perf = data.performance || {};
    lines.push('=== ПРОИЗВОДИТЕЛЬНОСТЬ ===');
    lines.push('Параметр,Значение');
    lines.push(`Время загрузки,${perf.loadTime || 0} мс`);
    lines.push(`Размер страницы,${((perf.pageSize || 0) / 1024).toFixed(1)} KB`);
    lines.push(`Запросов,${perf.requestCount || 0}`);
    lines.push(`Блокирующих ресурсов,${perf.renderBlockingResources || 0}`);
    lines.push(`TTFB,${perf.timeToFirstByte || 0} мс`);
    lines.push('');
    
    lines.push('=== НАЙДЕННЫЕ ПРОБЛЕМЫ ===');
    lines.push('Тип,Серьёзность,Описание,Можно исправить автоматически');
    
    const issues = data.issues || [];
    if (issues.length === 0) {
        lines.push('Проблем не обнаружено,,,,');
    } else {
        issues.forEach(issue => {
            const severity = { critical: 'Критическая', high: 'Высокая', medium: 'Средняя', low: 'Низкая' };
            lines.push(`${issue.type || ''},${severity[issue.severity] || issue.severity},${escapeCSV(issue.title || '')},${issue.autoFixable ? 'Да' : 'Нет'}`);
        });
    }
    
    return lines.join('\n');
}

function escapeCSV(str) {
    if (str === null || str === undefined) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

module.exports = router;
