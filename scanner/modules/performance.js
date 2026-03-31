async function performanceCheck(page, results, url, siteType = 'regular') {
    const startTime = Date.now();
    const skipThoroughChecks = ['search_engine', 'large_platform', 'social_network'].includes(siteType);
    
    const thresholds = skipThoroughChecks ? {
        loadComplete: { good: 5000, poor: 10000 },
        ttfb: { good: 500, poor: 2000 },
        domContentLoaded: { good: 2000, poor: 5000 },
        fcp: { good: 3000, poor: 5000 },
        lcp: { good: 4000, poor: 6000 }
    } : {
        loadComplete: { good: 2000, poor: 5000 },
        ttfb: { good: 200, poor: 800 },
        domContentLoaded: { good: 1000, poor: 2500 },
        fcp: { good: 1800, poor: 3000 },
        lcp: { good: 2500, poor: 4000 }
    };
    
    await page.evaluate(() => {
        performance.clearResourceTimings();
    });

    const data = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');
        
        const fcp = paint.find(p => p.name === 'first-contentful-paint');
        const fp = paint.find(p => p.name === 'first-paint');
        const lcp = performance.getEntriesByType('resource')
            .filter(r => r.initiatorType === 'img' || r.initiatorType === 'css')
            .sort((a, b) => b.responseEnd - a.responseEnd)[0];

        const getResourceStats = (type) => {
            const filtered = resources.filter(r => r.initiatorType === type);
            return {
                count: filtered.length,
                totalSize: filtered.reduce((sum, r) => sum + (r.transferSize || 0), 0),
                totalDuration: filtered.reduce((sum, r) => sum + r.duration, 0)
            };
        };

        const resourceStats = {
            total: resources.length,
            byType: {
                document: getResourceStats('document'),
                script: getResourceStats('script'),
                stylesheet: getResourceStats('stylesheet'),
                image: getResourceStats('image'),
                font: getResourceStats('font'),
                fetch: getResourceStats('fetch'),
                xhr: getResourceStats('xmlhttprequest')
            },
            totalSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
            totalDuration: resources.reduce((sum, r) => sum + r.duration, 0)
        };

        const blockingResources = resources.filter(r => 
            (r.initiatorType === 'script' || r.initiatorType === 'stylesheet') && 
            r.duration > 50
        );

        return {
            timing: nav ? {
                dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
                tcp: Math.round(nav.connectEnd - nav.connectStart),
                ssl: nav.secureConnectionStart > 0 ? 
                    Math.round(nav.connectEnd - nav.secureConnectionStart) : 0,
                ttfb: Math.round(nav.responseStart - nav.requestStart),
                download: Math.round(nav.responseEnd - nav.responseStart),
                domInteractive: Math.round(nav.domInteractive - nav.requestStart),
                domComplete: Math.round(nav.domComplete - nav.requestStart),
                loadComplete: Math.round(nav.loadEventEnd - nav.requestStart),
                domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.requestStart)
            } : null,
            
            paint: {
                firstPaint: Math.round(fp?.startTime || 0),
                firstContentfulPaint: Math.round(fcp?.startTime || 0),
                largestContentfulPaint: Math.round(lcp?.responseEnd - lcp?.startTime || 0)
            },
            
            resources: resourceStats,
            blockingResources: blockingResources.length,
            renderBlocking: blockingResources.map(r => ({
                url: r.name,
                type: r.initiatorType,
                duration: Math.round(r.duration)
            }))
        };
    });

    await page.evaluate(() => {
        return new Promise(resolve => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
    });

    const metrics = await page.metrics();
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });

    const issues = [];
    let score = 100;

    if (data.timing) {
        if (data.timing.loadComplete > thresholds.loadComplete.poor) {
            issues.push({
                type: 'performance',
                severity: 'high',
                title: 'Медленная загрузка страницы',
                description: `Полная загрузка: ${(data.timing.loadComplete / 1000).toFixed(1)}с. Рекомендуется < ${(thresholds.loadComplete.good/1000).toFixed(0)}с.`,
                impact: 25,
                autoFixable: false,
                fixTime: '1-2 часа'
            });
            score -= 25;
        } else if (data.timing.loadComplete > thresholds.loadComplete.good) {
            issues.push({
                type: 'performance',
                severity: 'medium',
                title: 'Средняя скорость загрузки',
                description: `Загрузка: ${(data.timing.loadComplete / 1000).toFixed(1)}с. Рекомендуется < ${(thresholds.loadComplete.good/1000).toFixed(0)}с.`,
                impact: 15,
                autoFixable: false,
                fixTime: '45 мин'
            });
            score -= 15;
        }

        if (data.timing.ttfb > thresholds.ttfb.poor) {
            issues.push({
                type: 'performance',
                severity: skipThoroughChecks ? 'medium' : 'high',
                title: 'Медленный TTFB',
                description: `TTFB: ${data.timing.ttfb}мс. Влияет на время ответа сервера.`,
                impact: skipThoroughChecks ? 10 : 20,
                autoFixable: false,
                fixTime: '30 мин'
            });
            score -= skipThoroughChecks ? 10 : 15;
        }
    }

    if (data.paint.firstContentfulPaint > thresholds.fcp.poor && !skipThoroughChecks) {
        issues.push({
            type: 'performance',
            severity: 'medium',
            title: 'Медленный First Contentful Paint',
            description: `FCP: ${data.paint.firstContentfulPaint}мс. Рекомендуется < ${thresholds.fcp.good}мс.`,
            impact: 15,
            autoFixable: false,
            fixTime: '30 мин'
        });
        score -= 10;
    }

    if (data.blockingResources > 5 && !skipThoroughChecks) {
        issues.push({
            type: 'performance',
            severity: 'high',
            title: 'Много блокирующих ресурсов',
            description: `${data.blockingResources} скриптов/стилей блокируют рендеринг.`,
            impact: 20,
            autoFixable: true,
            fixTime: '1 час'
        });
        score -= 15;
    } else if (data.blockingResources > 2) {
        issues.push({
            type: 'performance',
            severity: 'medium',
            title: 'Есть блокирующие ресурсы',
            description: `${data.blockingResources} ресурса задерживают рендеринг.`,
            impact: 10,
            autoFixable: true,
            fixTime: '30 мин'
        });
        score -= 5;
    }

    if (data.resources.total > 100) {
        issues.push({
            type: 'performance',
            severity: 'medium',
            title: 'Слишком много запросов',
            description: `${data.resources.total} HTTP-запросов. Рекомендуется < 50.`,
            impact: 15,
            autoFixable: true,
            fixTime: '45 мин'
        });
        score -= 10;
    }

    const totalKB = Math.round(data.resources.totalSize / 1024);
    if (totalKB > 5000) {
        issues.push({
            type: 'performance',
            severity: 'high',
            title: 'Слишком большой размер страницы',
            description: `Общий размер: ${(totalKB / 1024).toFixed(1)} МБ. Рекомендуется < 2 МБ.`,
            impact: 20,
            autoFixable: true,
            fixTime: '1 час'
        });
        score -= 15;
    } else if (totalKB > 2000) {
        issues.push({
            type: 'performance',
            severity: 'medium',
            title: 'Большой размер страницы',
            description: `Размер: ${(totalKB / 1024).toFixed(1)} МБ. Рекомендуется < 2 МБ.`,
            impact: 10,
            autoFixable: true,
            fixTime: '30 мин'
        });
        score -= 5;
    }

    results.issues.push(...issues);
    results.performance = {
        score: Math.max(0, score),
        ...data,
        memory: {
            jsHeapSize: Math.round(metrics.JSHeapUsedSize / 1024 / 1024),
            jsHeapTotal: Math.round(metrics.JSHeapTotalSize / 1024 / 1024)
        },
        timestamp: Date.now() - startTime
    };
}

module.exports = performanceCheck;
