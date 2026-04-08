const express = require('express');
const router = express.Router();
const dns = require('dns');
const https = require('https');
const SimpleScanner = require('../../scanner/simple-scanner');
const { authenticateToken } = require('../middleware/auth');
const dbModule = require('../database');
const db = dbModule;
const { PLAN_LIMITS, getComparisonLimit } = dbModule;

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function checkSiteExists(url) {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            
            dns.lookup(hostname, (err, address) => {
                if (err || !address) {
                    return resolve({ exists: false, error: 'DNS не найден' });
                }
                
                const req = https.get(url, { 
                    timeout: 10000,
                    rejectUnauthorized: false
                }, (res) => {
                    if (res.statusCode >= 400 && res.statusCode !== 401 && res.statusCode !== 403) {
                        return resolve({ exists: false, error: `Сайт недоступен (${res.statusCode})` });
                    }
                    resolve({ exists: true, statusCode: res.statusCode });
                });
                
                req.on('timeout', () => { req.destroy(); resolve({ exists: false, error: 'Таймаут' }); });
                req.on('error', () => resolve({ exists: false, error: 'Ошибка подключения' }));
            });
        } catch {
            resolve({ exists: false, error: 'Некорректный URL' });
        }
    });
}

router.post('/compare', authenticateToken, async (req, res) => {
    const { mainUrl, competitors } = req.body;
    const userId = req.user.id;
    
    // Get user data from database (not JWT) for accurate limits
    const getUser = () => new Promise((resolve, reject) => {
        db.get('SELECT plan, comparisons_used FROM users WHERE id = $1', [userId], (err, user) => {
            if (err) reject(err);
            else resolve(user);
        });
    });
    
    const runQuery = (sql, params) => new Promise((resolve, reject) => {
        db.run(sql, params, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    
    try {
        const user = await getUser();
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const userPlan = user.plan || 'free';
        const limit = getComparisonLimit(userPlan);
        const comparisonsUsed = user.comparisons_used || 0;
        
        if (comparisonsUsed >= limit) {
            return res.status(403).json({
                success: false,
                error: 'Лимит сравнений исчерпан',
                upgrade: true,
                required: 'comparisons',
                limit: limit,
                used: comparisonsUsed
            });
        }
        
        if (!mainUrl || !competitors || !Array.isArray(competitors) || competitors.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Укажите основной URL и минимум 1 конкурент'
            });
        }
        
        if (competitors.length > 5) {
            return res.status(400).json({
                success: false,
                error: 'Максимум 5 конкурентов'
            });
        }
        
        if (!isValidUrl(mainUrl)) {
            return res.status(400).json({
                success: false,
                error: 'Некорректный URL основного сайта'
            });
        }
        
        for (const comp of competitors) {
            if (!isValidUrl(comp)) {
                return res.status(400).json({
                    success: false,
                    error: `Некорректный URL конкурента: ${comp}`
                });
            }
        }
        
        const mainCheck = await checkSiteExists(mainUrl);
        if (!mainCheck.exists) {
            return res.status(400).json({
                success: false,
                error: `Основной сайт: ${mainCheck.error}`
            });
        }
        
        const allUrls = [mainUrl, ...competitors];
        const results = [];
        
        for (const url of allUrls) {
            try {
                console.log(`[Compare] Scanning: ${url}`);
                const scanner = new SimpleScanner();
                const data = await scanner.scan(url, { modules: ['seo', 'performance', 'accessibility'] });
                
                results.push({
                    url,
                    isMain: url === mainUrl,
                    scores: data.scores || {},
                    overallScore: data.overallScore || 0,
                    seoDetails: extractSeoDetails(data),
                    performanceDetails: extractPerformanceDetails(data),
                    accessibilityDetails: extractAccessibilityDetails(data),
                    metaInfo: extractMetaInfo(data)
                });
            } catch (error) {
                console.error(`[Compare] Error scanning ${url}:`, error.message);
                results.push({
                    url,
                    isMain: url === mainUrl,
                    error: error.message,
                    scores: {},
                    overallScore: 0
                });
            }
        }
        
        const comparison = generateComparison(results, mainUrl);
        const summary = generateSummary(results, mainUrl);
        
        // Save to history and update counter
        await runQuery(
            'INSERT INTO comparison_history (user_id, main_url, competitors, results) VALUES ($1, $2, $3, $4)',
            [userId, mainUrl, JSON.stringify(competitors), JSON.stringify({ comparison, summary })]
        );
        
        // Update comparisons used counter
        await runQuery(
            'UPDATE users SET comparisons_used = comparisons_used + 1 WHERE id = $1',
            [userId]
        );
        
        res.json({
            success: true,
            results,
            comparison,
            summary,
            remaining: limit - comparisonsUsed - 1,
            limit: limit
        });
        
    } catch (error) {
        console.error('[Compare] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

function extractSeoDetails(data) {
    const seo = data.seo || {};
    const checks = seo.checks || [];
    
    const getCheck = (item) => checks.find(c => c.item === item);
    const titleCheck = getCheck('Title Tag');
    const descCheck = getCheck('Meta Description');
    const h1Check = getCheck('H1 Heading');
    const viewportCheck = getCheck('Viewport Meta');
    const canonicalCheck = getCheck('Canonical URL');
    const ogCheck = getCheck('Open Graph Tags');
    const langCheck = getCheck('Language Attribute');
    const faviconCheck = getCheck('Favicon');
    
    return {
        title: titleCheck?.message?.replace('✓ ', '').replace('...', '') || '',
        titleLength: titleCheck?.message ? (titleCheck.message.match(/\d+/)?.[0] || 0) : 0,
        titleStatus: titleCheck?.status || 'pass',
        description: descCheck?.message || '',
        descriptionLength: descCheck?.message ? (descCheck.message.match(/\d+/)?.[0] || 0) : 0,
        hasViewport: viewportCheck?.status === 'pass',
        hasCharset: !!data.seo?.charset,
        h1Count: h1Check?.status === 'pass' ? 1 : (h1Check?.message?.match(/\d+/)?.[0] || 0),
        h2Count: 0,
        h3Count: 0,
        imageAltRatio: 100,
        totalImages: data.stats?.totalImages || 0,
        imagesWithoutAlt: 0,
        canonicalUrl: canonicalCheck?.message?.replace('✓ ', '') || '',
        ogTags: {
            hasTitle: ogCheck?.status === 'pass',
            hasDescription: !!ogCheck,
            hasImage: ogCheck?.status === 'pass',
            hasUrl: !!ogCheck
        },
        twitterTags: {
            hasCard: !!getCheck('Twitter Card'),
            hasTitle: false,
            hasDescription: false
        },
        keywords: '',
        robots: getCheck('Robots Meta')?.message || '',
        totalLinks: data.stats?.totalLinks || 0,
        internalLinks: 0,
        externalLinks: 0
    };
}

function extractPerformanceDetails(data) {
    const perf = data.performance || {};
    const checks = perf.checks || [];
    const stats = data.stats || {};
    
    const getCheck = (item) => checks.find(c => c.item === item);
    const htmlSizeCheck = getCheck('HTML Size');
    const scriptsCheck = getCheck('External Scripts');
    const cssCheck = getCheck('CSS Files');
    const lazyCheck = getCheck('Lazy Loading');
    const domCheck = getCheck('DOM Size');
    
    return {
        loadTime: stats.duration ? (stats.duration / 1000).toFixed(2) : 0,
        pageSize: stats.htmlSize || '0KB',
        requestCount: (stats.totalScripts || 0) + (stats.totalStyles || 0),
        renderBlocking: scriptsCheck?.status === 'error' ? (scriptsCheck.message.match(/\d+/)?.[0] || 0) : 0,
        imageOptimization: lazyCheck?.status === 'warning' ? 1 : 0,
        compression: 0,
        cacheEnabled: false,
        fcp: data.lighthouse?.metrics?.fcp || 0,
        lcp: data.lighthouse?.metrics?.lcp || 0,
        cls: data.lighthouse?.metrics?.cls || 0,
        ttfb: data.lighthouse?.metrics?.ttfb || 0,
        domSize: stats.totalElements || 0,
        unusedCss: cssCheck?.status === 'warning' ? 1 : 0,
        unusedJs: scriptsCheck?.status === 'error' ? 1 : 0,
        renderBlockingResources: scriptsCheck?.status === 'error' ? 1 : 0,
        mainThreadWork: 0
    };
}

function extractAccessibilityDetails(data) {
    const a11y = data.accessibility || {};
    const checks = a11y.checks || [];
    
    const getCheck = (item) => checks.find(c => c.item === item);
    const imagesAltCheck = getCheck('Images Alt Text');
    const langCheck = getCheck('Page Language');
    const viewportCheck = getCheck('Viewport Meta');
    const headingsCheck = getCheck('Heading Structure');
    const landmarksCheck = getCheck('Landmarks');
    
    return {
        contrastRatio: 0,
        hasAriaLabels: !!getCheck('ARIA Attributes'),
        hasLangAttribute: langCheck?.status === 'pass',
        hasSkipLink: getCheck('Skip Link')?.status === 'pass',
        headingHierarchy: headingsCheck?.status === 'pass' ? 'ok' : 'needs-review',
        imageAlts: imagesAltCheck?.status === 'error' ? (imagesAltCheck.message.match(/\d+/)?.[0] || 0) : 0,
        linkTexts: 0
    };
}

function extractMetaInfo(data) {
    const seo = data.seo || {};
    const security = data.security || {};
    const mobile = data.mobile || {};
    const checks = seo.checks || [];
    const securityChecks = security.checks || [];
    
    const langCheck = checks.find(c => c.item === 'Language Attribute');
    const httpsCheck = securityChecks.find(c => c.item === 'HTTPS');
    
    return {
        statusCode: data.stats?.pageStatus || 200,
        contentType: 'text/html',
        server: '',
        domainAge: '',
        ssl: httpsCheck?.status === 'pass',
        mobileFriendly: mobile.score > 70,
        language: langCheck?.message?.replace('✓ Язык: ', '') || ''
    };
}

function generateComparison(results, mainUrl) {
    const mainResult = results.find(r => r.url === mainUrl && !r.error);
    if (!mainResult) return null;
    
    const competitors = results.filter(r => r.url !== mainUrl && !r.error);
    
    const categories = ['seo', 'performance', 'accessibility'];
    const comparison = {};
    
    for (const category of categories) {
        const mainScore = mainResult.scores[category] || 0;
        const competitorScores = competitors.map(c => ({
            url: c.url,
            score: c.scores[category] || 0,
            diff: (c.scores[category] || 0) - mainScore
        }));
        
        const bestCompetitor = competitorScores.reduce((best, c) => 
            c.score > (best?.score || 0) ? c : best, null);
        
        const avgCompetitor = competitorScores.length > 0
            ? Math.round(competitorScores.reduce((sum, c) => sum + c.score, 0) / competitorScores.length)
            : 0;
        
        comparison[category] = {
            mainScore,
            avgCompetitor,
            bestCompetitor,
            competitors: competitorScores.sort((a, b) => b.score - a.score),
            advantage: mainScore > avgCompetitor,
            gapToBest: bestCompetitor ? bestCompetitor.score - mainScore : 0
        };
    }
    
    return comparison;
}

function generateSummary(results, mainUrl) {
    const mainResult = results.find(r => r.url === mainUrl && !r.error);
    const competitors = results.filter(r => r.url !== mainUrl && !r.error);
    
    if (!mainResult) {
        return {
            position: null,
            wins: 0,
            losses: 0,
            total: 0
        };
    }
    
    const mainScore = mainResult.overallScore;
    const competitorScores = competitors.map(c => c.overallScore).filter(s => s > 0);
    
    if (competitorScores.length === 0) {
        return {
            position: 1,
            wins: 0,
            losses: 0,
            total: 0
        };
    }
    
    const better = competitorScores.filter(s => s > mainScore).length;
    const worse = competitorScores.filter(s => s < mainScore).length;
    const position = better + 1;
    
    return {
        position,
        total: competitorScores.length + 1,
        wins: worse,
        losses: better,
        mainScore,
        avgCompetitor: Math.round(competitorScores.reduce((a, b) => a + b, 0) / competitorScores.length),
        bestScore: Math.max(...competitorScores),
        recommendation: generateRecommendation(mainResult, competitors)
    };
}

function generateRecommendation(main, competitors) {
    const recommendations = [];
    
    if (!main.seoDetails?.title || main.seoDetails.titleLength < 30) {
        recommendations.push({
            category: 'seo',
            priority: 'high',
            text: 'Добавьте или улучшите title (30-60 символов)'
        });
    }
    
    if (!main.seoDetails?.description || main.seoDetails.descriptionLength < 70) {
        recommendations.push({
            category: 'seo',
            priority: 'high',
            text: 'Добавьте meta description (70-160 символов)'
        });
    }
    
    if (!main.seoDetails?.hasViewport) {
        recommendations.push({
            category: 'mobile',
            priority: 'high',
            text: 'Добавьте meta viewport для корректного отображения на мобильных'
        });
    }
    
    if (main.seoDetails?.imageAltRatio < 80) {
        recommendations.push({
            category: 'seo',
            priority: 'medium',
            text: `Добавьте alt-тексты к изображениям (сейчас: ${main.seoDetails.imageAltRatio}%)`
        });
    }
    
    if (!main.seoDetails?.ogTags?.hasTitle || !main.seoDetails?.ogTags?.hasDescription) {
        recommendations.push({
            category: 'social',
            priority: 'medium',
            text: 'Добавьте Open Graph теги для соцсетей'
        });
    }
    
    if (main.seoDetails?.h1Count === 0) {
        recommendations.push({
            category: 'seo',
            priority: 'medium',
            text: 'Добавьте заголовок H1 на страницу'
        });
    }
    
    if (main.seoDetails?.h1Count > 1) {
        recommendations.push({
            category: 'seo',
            priority: 'medium',
            text: 'На странице несколько H1 - используйте только один'
        });
    }
    
    const mainPerf = main.performanceDetails || {};
    const validCompetitors = competitors.filter(c => c.performanceDetails && c.performanceDetails.loadTime > 0);
    
    if (validCompetitors.length > 0) {
        const bestPerf = validCompetitors.reduce((best, c) => 
            c.performanceDetails.loadTime < (best?.performanceDetails?.loadTime || Infinity) ? c : best, null);
        
        if (bestPerf && mainPerf.loadTime > bestPerf.performanceDetails.loadTime * 1.5) {
            recommendations.push({
                category: 'performance',
                priority: 'high',
                text: `Улучшите скорость загрузки (${Math.round(mainPerf.loadTime / 1000)}с vs конкурент ${Math.round(bestPerf.performanceDetails.loadTime / 1000)}с)`
            });
        }
        
        if (mainPerf.renderBlocking > 3) {
            recommendations.push({
                category: 'performance',
                priority: 'medium',
                text: `Уменьшите количество блокирующих ресурсов (${mainPerf.renderBlocking})`
            });
        }
    }
    
    if (main.accessibilityDetails?.missingAlts > 5) {
        recommendations.push({
            category: 'accessibility',
            priority: 'medium',
            text: `Добавьте alt к ${main.accessibilityDetails.missingAlts} изображениям`
        });
    }
    
    return recommendations.slice(0, 8);
}

router.get('/features', (req, res) => {
    res.json({
        success: true,
        features: [
            {
                key: 'basic',
                name: 'Базовое сравнение',
                description: 'Сравнение с 3 конкурентами',
                competitors: 3,
                price: null
            },
            {
                key: 'pro',
                name: 'Расширенное сравнение',
                description: 'Сравнение с 5 конкурентами + детальный анализ',
                competitors: 5,
                price: 'Pro'
            }
        ]
    });
});

// Get comparison limits status
router.get('/limits', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.get('SELECT plan, comparisons_used FROM users WHERE id = $1', [userId], (err, user) => {
        if (err || !user) {
            const userPlan = req.user.plan || 'free';
            const limit = getComparisonLimit(userPlan);
            return res.json({
                success: true,
                plan: userPlan,
                limit: limit,
                used: 0,
                remaining: limit
            });
        }
        
        const userPlan = user.plan || 'free';
        const limit = getComparisonLimit(userPlan);
        const used = user.comparisons_used || 0;
        
        res.json({
            success: true,
            plan: userPlan,
            limit: limit,
            used: used,
            remaining: Math.max(0, limit - used)
        });
    });
});

// Get comparison history
router.get('/history', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    
    db.all(
        'SELECT * FROM comparison_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, limit],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка базы данных' });
            }
            
            res.json({
                success: true,
                history: rows.map(row => ({
                    id: row.id,
                    mainUrl: row.main_url,
                    competitors: JSON.parse(row.competitors || '[]'),
                    createdAt: row.created_at
                }))
            });
        }
    );
});

module.exports = router;
