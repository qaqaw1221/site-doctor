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
    const userPlan = req.user.plan || 'free';
    
    // Check comparison limits
    const limit = getComparisonLimit(userPlan);
    const comparisonsUsed = req.user.comparisons_used || 0;
    
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
    
    try {
        const results = [];
        
        for (const url of allUrls) {
            try {
                console.log(`[Compare] Scanning: ${url}`);
                const scanner = new SimpleScanner();
                const data = await scanner.scan(url, { modules: ['seo', 'performance', 'accessibility'] });
                await scanner.close();
                
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
        db.run(
            'INSERT INTO comparison_history (user_id, main_url, competitors, results) VALUES (?, ?, ?, ?)',
            [userId, mainUrl, JSON.stringify(competitors), JSON.stringify({ comparison, summary })],
            (err) => {
                if (err) console.error('Error saving comparison:', err);
            }
        );
        
        // Update comparisons used counter
        db.run(
            'UPDATE users SET comparisons_used = comparisons_used + 1 WHERE id = ?',
            [userId],
            (err) => {
                if (err) console.error('Error updating comparisons counter:', err);
            }
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
    const seo = data.modules?.seo || data.seo || {};
    const images = seo.images || {};
    const links = seo.links || {};
    const headingsCount = seo.headingsCount || {};
    const imagesWithAlt = (images.total || 0) - (images.withoutAlt || 0);
    const imageAltRatio = (images.total || 0) > 0 ? Math.round((imagesWithAlt / images.total) * 100) : 100;
    
    return {
        title: seo.title || '',
        titleLength: (seo.title || '').length,
        description: seo.description || '',
        descriptionLength: (seo.description || '').length,
        hasViewport: !!seo.viewport,
        hasCharset: !!seo.charset,
        h1Count: headingsCount.h1 || seo.h1Count || 0,
        h2Count: headingsCount.h2 || seo.h2Count || 0,
        h3Count: headingsCount.h3 || 0,
        imageAltRatio: imageAltRatio,
        totalImages: images.total || 0,
        imagesWithoutAlt: images.withoutAlt || 0,
        canonicalUrl: seo.canonical || '',
        ogTags: {
            hasTitle: !!seo.ogTitle,
            hasDescription: !!seo.ogDescription,
            hasImage: !!seo.ogImage,
            hasUrl: !!seo.ogUrl
        },
        twitterTags: {
            hasCard: !!seo.twitterCard,
            hasTitle: !!seo.twitterTitle,
            hasDescription: !!seo.twitterDescription
        },
        keywords: seo.keywords || '',
        robots: seo.robots || '',
        totalLinks: links.total || 0,
        internalLinks: links.internal || 0,
        externalLinks: links.external || 0
    };
}

function extractPerformanceDetails(data) {
    const perf = data.modules?.performance || data.performance || {};
    return {
        loadTime: perf.loadTime || 0,
        pageSize: perf.pageSize || 0,
        requestCount: perf.requestCount || 0,
        renderBlocking: perf.renderBlockingResources || 0,
        imageOptimization: perf.unoptimizedImages || 0,
        compression: perf.compressionRatio || 0,
        cacheEnabled: perf.cacheEnabled || false,
        fcp: perf.firstContentfulPaint || perf.fcp || 0,
        lcp: perf.largestContentfulPaint || perf.lcp || 0,
        cls: perf.cumulativeLayoutShift || perf.cls || 0,
        ttfb: perf.timeToFirstByte || perf.ttfb || 0,
        domSize: perf.domSize || 0,
        unusedCss: perf.unusedCss || 0,
        unusedJs: perf.unusedJs || 0,
        renderBlockingResources: perf.renderBlockingResources || 0,
        mainThreadWork: perf.mainThreadWork || 0
    };
}

function extractAccessibilityDetails(data) {
    const a11y = data.modules?.accessibility || data.accessibility || {};
    return {
        contrastRatio: a11y.contrastRatio || 0,
        hasAriaLabels: a11y.hasAriaLabels || false,
        hasLangAttribute: a11y.hasLangAttribute || false,
        hasSkipLink: a11y.hasSkipLink || false,
        headingHierarchy: a11y.headingHierarchy || 'ok',
        imageAlts: a11y.missingAlts || 0,
        linkTexts: a11y.genericLinkTexts || 0
    };
}

function extractMetaInfo(data) {
    return {
        statusCode: data.statusCode || 200,
        contentType: data.contentType || '',
        server: data.server || '',
        domainAge: data.domainAge || '',
        ssl: data.ssl || false,
        mobileFriendly: data.mobileFriendly || false,
        language: data.language || ''
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
    const userPlan = req.user.plan || 'free';
    const limit = getComparisonLimit(userPlan);
    const used = req.user.comparisons_used || 0;
    
    res.json({
        success: true,
        plan: userPlan,
        limit: limit,
        used: used,
        remaining: Math.max(0, limit - used)
    });
});

// Get comparison history
router.get('/history', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    
    db.all(
        'SELECT * FROM comparison_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
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
