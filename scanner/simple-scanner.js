const axios = require('axios');
const cheerio = require('cheerio');

class SimpleScanner {
    constructor() {
        this.cache = new Map();
    }

    isValidUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    async fetchPage(url) {
        const cacheKey = url;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'SiteDoctor/1.0 (+https://sitedoctor.io)',
                    'Accept': 'text/html,application/xhtml+xml',
                },
                maxContentLength: 5 * 1024 * 1024
            });

            const data = {
                html: response.data,
                status: response.status,
                headers: response.headers
            };

            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            return { error: error.message, html: null };
        }
    }

    async scan(url, options = {}) {
        if (!this.isValidUrl(url)) {
            return { error: 'Invalid URL. URL must start with http:// or https://' };
        }

        const results = {
            url,
            timestamp: new Date().toISOString(),
            seo: {},
            performance: {},
            accessibility: {},
            links: {},
            mobile: {},
            score: 0
        };

        const page = await this.fetchPage(url);
        if (page.error) {
            results.error = page.error;
            return results;
        }

        const $ = cheerio.load(page.html);

        results.seo = this.checkSEO($);
        results.performance = this.checkPerformance($);
        results.accessibility = this.checkAccessibility($);
        results.links = this.checkLinks($, url);
        results.mobile = this.checkMobile($);

        const totalScore = (
            results.seo.score +
            results.performance.score +
            results.accessibility.score +
            results.links.score +
            results.mobile.score
        ) / 5;

        results.score = Math.round(totalScore);

        return results;
    }

    checkSEO($) {
        const checks = [];
        let score = 100;

        const title = $('title').text().trim();
        if (!title) {
            checks.push({ item: 'Title', status: 'error', message: 'Отсутствует тег <title>' });
            score -= 20;
        } else {
            checks.push({ item: 'Title', status: 'pass', message: `Title: ${title.substring(0, 50)}...` });
        }

        const metaDesc = $('meta[name="description"]').attr('content');
        if (!metaDesc) {
            checks.push({ item: 'Meta Description', status: 'error', message: 'Отсутствует meta description' });
            score -= 15;
        } else if (metaDesc.length < 120) {
            checks.push({ item: 'Meta Description', status: 'warning', message: `Description слишком короткий (${metaDesc.length} символов)` });
            score -= 5;
        } else {
            checks.push({ item: 'Meta Description', status: 'pass', message: `Description: ${metaDesc.substring(0, 50)}...` });
        }

        const h1 = $('h1').first().text().trim();
        if (!h1) {
            checks.push({ item: 'H1 Tag', status: 'error', message: 'Отсутствует тег H1' });
            score -= 15;
        } else {
            checks.push({ item: 'H1 Tag', status: 'pass', message: `H1: ${h1.substring(0, 50)}...` });
        }

        const h2Count = $('h2').length;
        checks.push({ item: 'H2 Tags', status: h2Count > 0 ? 'pass' : 'warning', message: `Найдено H2: ${h2Count}` });

        const lang = $('html').attr('lang');
        if (!lang) {
            checks.push({ item: 'Language', status: 'error', message: 'Не указан язык страницы' });
            score -= 10;
        } else {
            checks.push({ item: 'Language', status: 'pass', message: `Язык: ${lang}` });
        }

        const canonical = $('link[rel="canonical"]').attr('href');
        checks.push({ item: 'Canonical URL', status: canonical ? 'pass' : 'info', message: canonical || 'Canonical не указан' });

        return { score: Math.max(0, score), checks };
    }

    checkPerformance($) {
        const checks = [];
        let score = 100;

        const htmlLength = $('html').html().length;
        const sizeKB = (htmlLength / 1024).toFixed(1);

        if (htmlLength > 100000) {
            checks.push({ item: 'HTML Size', status: 'error', message: `HTML слишком большой: ${sizeKB}KB` });
            score -= 20;
        } else if (htmlLength > 50000) {
            checks.push({ item: 'HTML Size', status: 'warning', message: `HTML большой: ${sizeKB}KB` });
            score -= 10;
        } else {
            checks.push({ item: 'HTML Size', status: 'pass', message: `HTML размер: ${sizeKB}KB` });
        }

        const scripts = $('script').length;
        checks.push({ item: 'Scripts', status: 'pass', message: `Скриптов на странице: ${scripts}` });

        const images = $('img').length;
        checks.push({ item: 'Images', status: 'pass', message: `Изображений: ${images}` });

        const stylesheets = $('link[rel="stylesheet"]').length;
        checks.push({ item: 'Stylesheets', status: 'pass', message: `CSS файлов: ${stylesheets}` });

        const lazyImages = $('img[loading="lazy"]').length;
        const totalImages = $('img').length;
        if (totalImages > 0 && lazyImages < totalImages / 2) {
            checks.push({ item: 'Lazy Loading', status: 'warning', message: `Только ${lazyImages} из ${totalImages} изображений с lazy loading` });
            score -= 5;
        } else {
            checks.push({ item: 'Lazy Loading', status: 'pass', message: 'Lazy loading настроен' });
        }

        return { score: Math.max(0, score), checks };
    }

    checkAccessibility($) {
        const checks = [];
        let score = 100;

        const imagesWithoutAlt = $('img:not([alt])').length;
        if (imagesWithoutAlt > 0) {
            checks.push({ item: 'Images Alt', status: 'error', message: `${imagesWithoutAlt} изображений без alt текста` });
            score -= 20;
        } else {
            checks.push({ item: 'Images Alt', status: 'pass', message: 'Все изображения с alt текстом' });
        }

        const linksWithoutText = $('a:not(:has(img))').filter(function() {
            return !$(this).text().trim();
        }).length;

        if (linksWithoutText > 0) {
            checks.push({ item: 'Empty Links', status: 'warning', message: `${linksWithoutText} пустых ссылок` });
            score -= 10;
        } else {
            checks.push({ item: 'Empty Links', status: 'pass', message: 'Нет пустых ссылок' });
        }

        const buttons = $('button').length;
        const inputs = $('input').length;
        checks.push({ item: 'Forms', status: 'pass', message: `Кнопок: ${buttons}, полей ввода: ${inputs}` });

        const hasViewport = $('meta[name="viewport"]').length > 0;
        checks.push({
            item: 'Viewport Meta',
            status: hasViewport ? 'pass' : 'warning',
            message: hasViewport ? 'Viewport настроен' : 'Viewport не настроен'
        });

        const hasContrast = $('style').text().includes('color') || $('[style*="color"]').length > 0;
        checks.push({ item: 'Color Contrast', status: 'info', message: 'Проверьте контрастность цветов вручную' });

        return { score: Math.max(0, score), checks };
    }

    checkLinks($, baseUrl) {
        const checks = [];
        let score = 100;

        const internalLinks = [];
        const externalLinks = [];
        const brokenLinks = [];

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

            try {
                if (href.startsWith('http')) {
                    if (href.includes(new URL(baseUrl).hostname)) {
                        internalLinks.push(href);
                    } else {
                        externalLinks.push(href);
                    }
                } else {
                    const absolute = new URL(href, baseUrl).href;
                    internalLinks.push(absolute);
                }
            } catch (e) {}
        });

        checks.push({
            item: 'Internal Links',
            status: 'pass',
            message: `Внутренних ссылок: ${internalLinks.length}`
        });

        checks.push({
            item: 'External Links',
            status: 'pass',
            message: `Внешних ссылок: ${externalLinks.length}`
        });

        const imgWithoutSrc = $('img:not([src])').length;
        if (imgWithoutSrc > 0) {
            checks.push({ item: 'Missing Images', status: 'error', message: `${imgWithoutSrc} изображений без src` });
            score -= 10;
        }

        return { score: Math.max(0, score), checks, internalLinks: internalLinks.slice(0, 10), externalLinks: externalLinks.slice(0, 10) };
    }

    checkMobile($) {
        const checks = [];
        let score = 100;

        const viewport = $('meta[name="viewport"]').attr('content');
        if (!viewport) {
            checks.push({ item: 'Viewport', status: 'error', message: 'Viewport meta тег отсутствует' });
            score -= 30;
        } else {
            checks.push({ item: 'Viewport', status: 'pass', message: `Viewport: ${viewport}` });
        }

        const touchElements = $('[ontouchstart]').length;
        checks.push({ item: 'Touch Elements', status: 'info', message: `Touch элементов: ${touchElements}` });

        const fontSizeSmall = $('[style*="font-size"]').filter(function() {
            const style = $(this).attr('style');
            const match = style.match(/font-size:\s*(\d+)px/);
            return match && parseInt(match[1]) < 12;
        }).length;

        if (fontSizeSmall > 0) {
            checks.push({ item: 'Small Font', status: 'warning', message: `${fontSizeSmall} элементов с мелким шрифтом` });
            score -= 10;
        }

        const hasResponsive = $('link[rel="stylesheet"]').length > 0;
        checks.push({ item: 'Stylesheets', status: hasResponsive ? 'pass' : 'warning', message: 'CSS подключён' });

        return { score: Math.max(0, score), checks };
    }
}

module.exports = SimpleScanner;
