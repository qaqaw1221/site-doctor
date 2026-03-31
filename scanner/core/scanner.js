const { BrowserPool } = require('./browser');

class EventEmitter {
    constructor() {
        this._events = {};
    }
    on(event, listener) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(listener);
        return this;
    }
    emit(event, ...args) {
        if (this._events[event]) {
            this._events[event].forEach(fn => fn(...args));
        }
        return this;
    }
    removeAllListeners(event) {
        if (event) {
            delete this._events[event];
        } else {
            this._events = {};
        }
        return this;
    }
}

const seoCheck = require('../modules/seo');
const performanceCheck = require('../modules/performance');
const accessibilityCheck = require('../modules/accessibility');
const linksCheck = require('../modules/links');
const mobileCheck = require('../modules/mobile');
const { generateFixes } = require('../modules/fixes');

class SiteScanner extends EventEmitter {
    constructor(options = {}) {
        super();
        this.browserPool = new BrowserPool({
            maxInstances: options.maxInstances || 3
        });
        this.cache = new Map();
        this.cacheTTL = options.cacheTTL || 3600000;
    }

    isValidUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    detectSiteType(url) {
        const domain = url.toLowerCase();
        
        if (domain.includes('google.') || domain.includes('yandex.') || 
            domain.includes('bing.') || domain.includes('duckduckgo.')) {
            return 'search_engine';
        }
        if (domain.includes('facebook.') || domain.includes('instagram.') ||
            domain.includes('twitter.') || domain.includes('vk.') || domain.includes('telegram.')) {
            return 'social_network';
        }
        if (domain.includes('amazon.') || domain.includes('shopify.') ||
            domain.includes('ebay.') || domain.includes('aliexpress.')) {
            return 'ecommerce';
        }
        if (domain.includes('github.') || domain.includes('youtube.') ||
            domain.includes('stackoverflow.') || domain.includes('medium.')) {
            return 'large_platform';
        }
        if (domain.includes('localhost') || domain.includes('127.0.0.1') ||
            domain.includes('staging') || domain.includes('.dev')) {
            return 'development';
        }
        return 'regular';
    }

    async scan(url, options = {}) {
        const startTime = Date.now();
        
        if (!this.isValidUrl(url)) {
            throw new Error('Invalid URL provided');
        }

        const cacheKey = `${url}:${JSON.stringify(options.modules || 'all')}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            this.emit('progress', { stage: 'cache', percent: 100 });
            return { ...cached.data, fromCache: true };
        }

        const modules = options.modules || ['seo', 'performance', 'accessibility', 'links', 'mobile'];
        const siteType = this.detectSiteType(url);

        this.emit('progress', { stage: 'init', percent: 5 });
        this.emit('scan:start', { url, siteType });

        const results = {
            url,
            siteType,
            timestamp: new Date().toISOString(),
            scores: {},
            issues: [],
            seo: {},
            performance: {},
            accessibility: {},
            links: {},
            mobile: {},
            overallScore: 0
        };

        let context = null;
        
        try {
            context = await this.browserPool.getPage();
            const { browser, page } = context;

            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.emit('progress', { stage: 'navigate', percent: 15 });
            
            try {
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });
            } catch (navError) {
                await page.goto(url, { 
                    waitUntil: 'load', 
                    timeout: 60000 
                }).catch(() => {});
            }
            
            await page.waitForTimeout(500);

            const totalModules = modules.length;
            let completedModules = 0;
            const moduleProgress = (moduleIndex) => {
                completedModules++;
                const percent = 20 + Math.round((completedModules / totalModules) * 70);
                this.emit('progress', { stage: modules[moduleIndex], percent });
            };

            const checkPromises = [];

            if (modules.includes('seo')) {
                checkPromises.push(
                    seoCheck(page, results, siteType)
                        .then(() => moduleProgress(0))
                );
            }

            if (modules.includes('performance')) {
                checkPromises.push(
                    performanceCheck(page, results, url, siteType)
                        .then(() => moduleProgress(1))
                );
            }

            if (modules.includes('accessibility')) {
                checkPromises.push(
                    accessibilityCheck(page, results, siteType)
                        .then(() => moduleProgress(2))
                );
            }

            if (modules.includes('links')) {
                checkPromises.push(
                    linksCheck(page, results, url, siteType)
                        .then(() => moduleProgress(3))
                );
            }

            if (modules.includes('mobile')) {
                checkPromises.push(
                    mobileCheck(page, results, siteType)
                        .then(() => moduleProgress(4))
                );
            }

            await Promise.all(checkPromises);

            this.emit('progress', { stage: 'fixes', percent: 85 });
            
            const fixesData = await generateFixes(page, { url, seo: results.seo });
            results.fixes = fixesData;
            
            this.emit('progress', { stage: 'aggregating', percent: 90 });

            results.scores = {
                seo: results.seo.score || 0,
                performance: results.performance.score || 0,
                accessibility: results.accessibility.score || 0,
                links: results.links.score || 0,
                mobile: results.mobile.score || 0
            };

            const scoreWeights = { seo: 0.25, performance: 0.30, accessibility: 0.20, links: 0.10, mobile: 0.15 };
            let totalWeight = 0;
            let weightedSum = 0;

            for (const module of modules) {
                if (results.scores[module] !== undefined) {
                    weightedSum += results.scores[module] * (scoreWeights[module] || 0.2);
                    totalWeight += scoreWeights[module] || 0.2;
                }
            }

            results.overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

            results.issues.sort((a, b) => {
                const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });

            results.stats = {
                totalIssues: results.issues.length,
                critical: results.issues.filter(i => i.severity === 'critical').length,
                high: results.issues.filter(i => i.severity === 'high').length,
                medium: results.issues.filter(i => i.severity === 'medium').length,
                low: results.issues.filter(i => i.severity === 'low').length,
                autoFixable: results.issues.filter(i => i.autoFixable).length,
                totalFixes: results.fixes?.totalFixes || 0,
                potentialScoreIncrease: results.fixes?.potentialScoreIncrease || 0,
                scanDuration: Date.now() - startTime
            };

            results.meta = {
                scannedAt: new Date().toISOString(),
                scannerVersion: '2.0.0',
                modules: modules,
                siteType: siteType
            };

            this.emit('progress', { stage: 'complete', percent: 100 });
            this.emit('scan:complete', results);

            this.cache.set(cacheKey, {
                data: results,
                timestamp: Date.now()
            });

            return results;

        } catch (error) {
            this.emit('scan:error', { url, error: error.message });
            throw error;

        } finally {
            if (context) {
                await this.browserPool.releasePage(context);
            }
        }
    }

    async scanMultiple(urls, options = {}) {
        const results = [];
        for (const url of urls) {
            try {
                const result = await this.scan(url, options);
                results.push({ url, success: true, data: result });
            } catch (error) {
                results.push({ url, success: false, error: error.message });
            }
        }
        return results;
    }

    clearCache() {
        this.cache.clear();
    }

    async close() {
        await this.browserPool.close();
        this.removeAllListeners();
    }
}

module.exports = SiteScanner;
