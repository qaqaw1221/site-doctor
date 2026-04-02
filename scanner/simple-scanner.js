const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

class SimpleScanner {
    constructor() {
        this.cache = new Map();
        this.issues = [];
        this.fixes = [];
        this.stats = { critical: 0, high: 0, medium: 0, low: 0, totalFixes: 0 };
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
        if (this.cache.has(url)) return this.cache.get(url);
        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: { 'User-Agent': 'SiteDoctor/1.0', 'Accept': 'text/html' },
                maxContentLength: 5 * 1024 * 1024,
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });
            const data = { html: response.data, status: response.status, headers: response.headers };
            this.cache.set(url, data);
            return data;
        } catch (error) {
            return { error: error.message, html: null };
        }
    }

    addIssue(category, severity, message) {
        this.issues.push({ category, severity, message });
        if (severity === 'critical') this.stats.critical++;
        else if (severity === 'high') this.stats.high++;
        else if (severity === 'medium') this.stats.medium++;
        else this.stats.low++;
    }

    addFix(category, description, impact, code) {
        this.fixes.push({ category, description, impact, code });
        this.stats.totalFixes++;
    }

    async scan(url) {
        if (!this.isValidUrl(url)) return { error: 'Invalid URL' };

        const page = await this.fetchPage(url);
        if (page.error) return { url, error: page.error, score: 0, issues: [], fixes: { fixes: [], totalFixes: 0, potentialScoreIncrease: 0 }, stats: { critical: 0, high: 0, medium: 0, low: 0, totalFixes: 0 }, seo: { score: 0, checks: [] }, performance: { score: 0, checks: [] }, accessibility: { score: 0, checks: [] }, links: { score: 0, checks: [] }, mobile: { score: 0, checks: [] }, scores: { seo: 0, performance: 0, accessibility: 0, links: 0, mobile: 0 }, overallScore: 0 };

        const $ = cheerio.load(page.html);

        const seo = this.checkSEO($, url);
        const perf = this.checkPerformance($, page.html);
        const a11y = this.checkAccessibility($);
        const links = this.checkLinks($, url);
        const mobile = this.checkMobile($);

        const score = Math.round((seo.score + perf.score + a11y.score + links.score + mobile.score) / 5);

        return {
            url,
            timestamp: new Date().toISOString(),
            overallScore: score,
            score: score,
            scores: {
                seo: seo.score,
                performance: perf.score,
                accessibility: a11y.score,
                links: links.score,
                mobile: mobile.score
            },
            seo,
            performance: perf,
            accessibility: a11y,
            links,
            mobile,
            issues: this.issues,
            fixes: {
                fixes: this.fixes,
                totalFixes: this.stats.totalFixes,
                potentialScoreIncrease: Math.min(30, this.stats.totalFixes * 5)
            },
            stats: { ...this.stats }
        };
    }

    checkSEO($, url) {
        const checks = [];
        let score = 100;

        const title = $('title').text().trim();
        if (!title) {
            checks.push({ item: 'Title', status: 'error', message: 'Отсутствует тег <title>' });
            score -= 20;
            this.addIssue('seo', 'critical', 'Отсутствует тег <title>');
            this.addFix('seo', 'Добавить тег <title>', 'Высокий', '<title>Заголовок страницы</title>');
        } else if (title.length > 60) {
            checks.push({ item: 'Title', status: 'warning', message: `Title слишком длинный (${title.length} символов)` });
            score -= 5;
            this.addIssue('seo', 'medium', `Title слишком длинный: ${title.length} символов`);
        } else {
            checks.push({ item: 'Title', status: 'pass', message: `Title: ${title}` });
        }

        const metaDesc = $('meta[name="description"]').attr('content');
        if (!metaDesc) {
            checks.push({ item: 'Meta Description', status: 'error', message: 'Отсутствует meta description' });
            score -= 15;
            this.addIssue('seo', 'high', 'Отсутствует meta description');
            this.addFix('seo', 'Добавить meta description', 'Высокий', '<meta name="description" content="Описание страницы">');
        } else if (metaDesc.length < 120) {
            checks.push({ item: 'Meta Description', status: 'warning', message: `Description короткий (${metaDesc.length} символов)` });
            score -= 5;
        } else if (metaDesc.length > 160) {
            checks.push({ item: 'Meta Description', status: 'warning', message: `Description длинный (${metaDesc.length} символов)` });
            score -= 3;
        } else {
            checks.push({ item: 'Meta Description', status: 'pass', message: `Description: ${metaDesc.substring(0, 60)}...` });
        }

        const h1Count = $('h1').length;
        const h1 = $('h1').first().text().trim();
        if (h1Count === 0) {
            checks.push({ item: 'H1 Tag', status: 'error', message: 'Отсутствует тег H1' });
            score -= 15;
            this.addIssue('seo', 'critical', 'Отсутствует тег H1');
            this.addFix('seo', 'Добавить тег H1', 'Высокий', '<h1>Главный заголовок</h1>');
        } else if (h1Count > 1) {
            checks.push({ item: 'H1 Tag', status: 'warning', message: `Найдено ${h1Count} тегов H1` });
            score -= 5;
        } else {
            checks.push({ item: 'H1 Tag', status: 'pass', message: `H1: ${h1}` });
        }

        const h2Count = $('h2').length;
        checks.push({ item: 'H2 Tags', status: h2Count > 0 ? 'pass' : 'warning', message: `H2: ${h2Count}` });
        if (h2Count === 0) this.addIssue('seo', 'low', 'Отсутствуют теги H2');

        const h3Count = $('h3').length;
        checks.push({ item: 'H3 Tags', status: 'pass', message: `H3: ${h3Count}` });

        const lang = $('html').attr('lang');
        if (!lang) {
            checks.push({ item: 'Language', status: 'error', message: 'Не указан язык' });
            score -= 10;
            this.addIssue('seo', 'medium', 'Не указан язык страницы');
            this.addFix('seo', 'Добавить lang атрибут', 'Средний', '<html lang="ru">');
        } else {
            checks.push({ item: 'Language', status: 'pass', message: `Язык: ${lang}` });
        }

        const canonical = $('link[rel="canonical"]').attr('href');
        if (!canonical) {
            checks.push({ item: 'Canonical', status: 'warning', message: 'Canonical не указан' });
            score -= 5;
            this.addIssue('seo', 'low', 'Отсутствует canonical URL');
            this.addFix('seo', 'Добавить canonical URL', 'Низкий', `<link rel="canonical" href="${url}">`);
        } else {
            checks.push({ item: 'Canonical', status: 'pass', message: `Canonical: ${canonical}` });
        }

        const metaRobots = $('meta[name="robots"]').attr('content');
        if (metaRobots && metaRobots.includes('noindex')) {
            checks.push({ item: 'Robots', status: 'error', message: 'Страница запрещена к индексации' });
            score -= 20;
            this.addIssue('seo', 'critical', 'Страница запрещена к индексации');
        } else {
            checks.push({ item: 'Robots', status: 'pass', message: 'Страница индексируется' });
        }

        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (!ogTitle || !ogImage) {
            checks.push({ item: 'Open Graph', status: 'warning', message: 'Open Graph теги неполные' });
            score -= 5;
            this.addIssue('seo', 'low', 'Отсутствуют Open Graph теги');
            this.addFix('seo', 'Добавить Open Graph теги', 'Низкий', '<meta property="og:title" content="...">');
        } else {
            checks.push({ item: 'Open Graph', status: 'pass', message: 'Open Graph настроен' });
        }

        const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');
        checks.push({ item: 'Favicon', status: favicon ? 'pass' : 'warning', message: favicon ? 'Favicon найден' : 'Favicon не найден' });
        if (!favicon) this.addIssue('seo', 'low', 'Favicon не найден');

        const httpsUrl = url.startsWith('https://');
        checks.push({ item: 'HTTPS', status: httpsUrl ? 'pass' : 'error', message: httpsUrl ? 'HTTPS используется' : 'HTTPS не используется' });
        if (!httpsUrl) {
            score -= 10;
            this.addIssue('seo', 'high', 'HTTPS не используется');
            this.addFix('seo', 'Перейти на HTTPS', 'Высокий', '');
        }

        return { score: Math.max(0, score), checks };
    }

    checkPerformance($, html) {
        const checks = [];
        let score = 100;
        const htmlSize = Buffer.byteLength(html, 'utf8');
        const sizeKB = (htmlSize / 1024).toFixed(1);

        if (htmlSize > 150000) {
            checks.push({ item: 'HTML Size', status: 'error', message: `HTML слишком большой: ${sizeKB}KB` });
            score -= 20;
            this.addIssue('performance', 'high', `HTML размер: ${sizeKB}KB`);
            this.addFix('performance', 'Уменьшить размер HTML', 'Высокий', 'Удалите лишние пробелы и комментарии');
        } else if (htmlSize > 50000) {
            checks.push({ item: 'HTML Size', status: 'warning', message: `HTML большой: ${sizeKB}KB` });
            score -= 10;
        } else {
            checks.push({ item: 'HTML Size', status: 'pass', message: `HTML: ${sizeKB}KB` });
        }

        const scripts = $('script').length;
        const externalScripts = $('script[src]').length;
        if (externalScripts > 10) {
            checks.push({ item: 'Scripts', status: 'error', message: `Слишком много скриптов: ${externalScripts}` });
            score -= 15;
            this.addIssue('performance', 'high', `Много внешних скриптов: ${externalScripts}`);
            this.addFix('performance', 'Объединить скрипты', 'Высокий', '');
        } else {
            checks.push({ item: 'Scripts', status: 'pass', message: `Скриптов: ${scripts} (внешних: ${externalScripts})` });
        }

        const stylesheets = $('link[rel="stylesheet"]').length;
        if (stylesheets > 5) {
            checks.push({ item: 'Stylesheets', status: 'warning', message: `Много CSS файлов: ${stylesheets}` });
            score -= 5;
            this.addFix('performance', 'Объединить CSS файлы', 'Средний', '');
        } else {
            checks.push({ item: 'Stylesheets', status: 'pass', message: `CSS файлов: ${stylesheets}` });
        }

        const images = $('img').length;
        const lazyImages = $('img[loading="lazy"]').length;
        if (images > 0 && lazyImages < images / 2) {
            checks.push({ item: 'Lazy Loading', status: 'warning', message: `Lazy loading: ${lazyImages}/${images}` });
            score -= 10;
            this.addIssue('performance', 'medium', 'Не все изображения используют lazy loading');
            this.addFix('performance', 'Добавить loading="lazy"', 'Средний', '');
        } else {
            checks.push({ item: 'Lazy Loading', status: 'pass', message: images > 0 ? `Lazy loading: ${lazyImages}/${images}` : 'Нет изображений' });
        }

        const inlineStyles = $('[style]').length;
        if (inlineStyles > 20) {
            checks.push({ item: 'Inline Styles', status: 'warning', message: `Inline стилей: ${inlineStyles}` });
            score -= 5;
        } else {
            checks.push({ item: 'Inline Styles', status: 'pass', message: `Inline стилей: ${inlineStyles}` });
        }

        const iframes = $('iframe').length;
        checks.push({ item: 'iFrames', status: iframes > 3 ? 'warning' : 'pass', message: `iFrames: ${iframes}` });
        if (iframes > 3) score -= 5;

        const totalElements = $('*').length;
        checks.push({ item: 'DOM Size', status: totalElements > 1500 ? 'warning' : 'pass', message: `DOM элементов: ${totalElements}` });
        if (totalElements > 1500) {
            score -= 5;
            this.addIssue('performance', 'medium', `Большой DOM: ${totalElements} элементов`);
        }

        return { score: Math.max(0, score), checks };
    }

    checkAccessibility($) {
        const checks = [];
        let score = 100;

        const imagesWithoutAlt = $('img:not([alt])').length;
        if (imagesWithoutAlt > 0) {
            checks.push({ item: 'Images Alt', status: 'error', message: `${imagesWithoutAlt} изображений без alt` });
            score -= 20;
            this.addIssue('accessibility', 'high', `${imagesWithoutAlt} изображений без alt текста`);
            this.addFix('accessibility', 'Добавить alt ко всем изображениям', 'Высокий', '');
        } else {
            checks.push({ item: 'Images Alt', status: 'pass', message: 'Все изображения с alt' });
        }

        const emptyLinks = $('a').filter(function() {
            return !$(this).text().trim() && !$(this).find('img').length && !$(this).attr('aria-label');
        }).length;
        if (emptyLinks > 0) {
            checks.push({ item: 'Empty Links', status: 'error', message: `${emptyLinks} пустых ссылок` });
            score -= 10;
            this.addIssue('accessibility', 'medium', `${emptyLinks} пустых ссылок`);
        } else {
            checks.push({ item: 'Empty Links', status: 'pass', message: 'Нет пустых ссылок' });
        }

        const formInputs = $('input:not([type="hidden"])').length;
        const labeledInputs = $('input[aria-label], input[id]').length;
        if (formInputs > 0 && labeledInputs < formInputs) {
            checks.push({ item: 'Form Labels', status: 'warning', message: 'Не все поля имеют labels' });
            score -= 10;
            this.addIssue('accessibility', 'medium', 'Поля формы без labels');
            this.addFix('accessibility', 'Добавить labels к полям', 'Средний', '');
        } else {
            checks.push({ item: 'Form Labels', status: 'pass', message: formInputs > 0 ? 'Поля формы имеют labels' : 'Нет полей формы' });
        }

        const hasViewport = $('meta[name="viewport"]').length > 0;
        checks.push({ item: 'Viewport', status: hasViewport ? 'pass' : 'error', message: hasViewport ? 'Viewport настроен' : 'Viewport отсутствует' });
        if (!hasViewport) {
            score -= 15;
            this.addIssue('accessibility', 'high', 'Viewport meta тег отсутствует');
        }

        const lang = $('html').attr('lang');
        if (!lang) {
            checks.push({ item: 'Language', status: 'error', message: 'Язык не указан' });
            score -= 10;
        } else {
            checks.push({ item: 'Language', status: 'pass', message: `Язык: ${lang}` });
        }

        const headings = $('h1, h2, h3, h4, h5, h6').length;
        checks.push({ item: 'Headings', status: 'pass', message: `Заголовков: ${headings}` });

        const buttons = $('button').length;
        const inputs = $('input').length;
        checks.push({ item: 'Interactive', status: 'pass', message: `Кнопок: ${buttons}, полей: ${inputs}` });

        const ariaElements = $('[aria-label], [aria-describedby], [role]').length;
        checks.push({ item: 'ARIA', status: ariaElements > 0 ? 'pass' : 'info', message: `ARIA атрибутов: ${ariaElements}` });

        return { score: Math.max(0, score), checks };
    }

    checkLinks($, baseUrl) {
        const checks = [];
        let score = 100;
        const internalLinks = [];
        const externalLinks = [];
        const anchors = [];
        const mailtos = [];
        const telLinks = [];

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            if (href.startsWith('#')) { anchors.push(href); return; }
            if (href.startsWith('mailto:')) { mailtos.push(href); return; }
            if (href.startsWith('tel:')) { telLinks.push(href); return; }
            try {
                if (href.startsWith('http')) {
                    if (href.includes(new URL(baseUrl).hostname)) internalLinks.push(href);
                    else externalLinks.push(href);
                } else {
                    internalLinks.push(new URL(href, baseUrl).href);
                }
            } catch (e) {}
        });

        checks.push({ item: 'Internal Links', status: 'pass', message: `Внутренних: ${internalLinks.length}` });
        checks.push({ item: 'External Links', status: 'pass', message: `Внешних: ${externalLinks.length}` });
        checks.push({ item: 'Anchors', status: 'pass', message: `Якорей: ${anchors.length}` });
        checks.push({ item: 'Email Links', status: 'pass', message: `Email: ${mailtos.length}` });
        checks.push({ item: 'Phone Links', status: 'pass', message: `Телефон: ${telLinks.length}` });

        const imgWithoutSrc = $('img:not([src])').length;
        if (imgWithoutSrc > 0) {
            checks.push({ item: 'Broken Images', status: 'error', message: `${imgWithoutSrc} изображений без src` });
            score -= 10;
            this.addIssue('links', 'high', `${imgWithoutSrc} изображений без src`);
        }

        const nofollowLinks = $('a[rel*="nofollow"]').length;
        checks.push({ item: 'Nofollow', status: 'info', message: `Nofollow ссылок: ${nofollowLinks}` });

        return { score: Math.max(0, score), checks, internalLinks: internalLinks.slice(0, 20), externalLinks: externalLinks.slice(0, 20) };
    }

    checkMobile($) {
        const checks = [];
        let score = 100;

        const viewport = $('meta[name="viewport"]').attr('content');
        if (!viewport) {
            checks.push({ item: 'Viewport', status: 'error', message: 'Viewport отсутствует' });
            score -= 30;
            this.addIssue('mobile', 'critical', 'Viewport meta тег отсутствует');
            this.addFix('mobile', 'Добавить viewport meta', 'Высокий', '<meta name="viewport" content="width=device-width, initial-scale=1">');
        } else {
            checks.push({ item: 'Viewport', status: 'pass', message: viewport });
        }

        const hasMediaQuery = $('style').text().includes('@media') || $('link[rel="stylesheet"]').length > 0;
        checks.push({ item: 'Responsive CSS', status: hasMediaQuery ? 'pass' : 'warning', message: hasMediaQuery ? 'CSS подключён' : 'Возможно нет адаптивности' });
        if (!hasMediaQuery) {
            score -= 10;
            this.addIssue('mobile', 'medium', 'Возможно отсутствует адаптивный дизайн');
        }

        const tapTargets = $('a, button, input, select, textarea').length;
        checks.push({ item: 'Tap Targets', status: 'pass', message: `Интерактивных элементов: ${tapTargets}` });

        const hasTouch = $('[ontouchstart], [onclick]').length;
        checks.push({ item: 'Touch Events', status: 'pass', message: `Touch элементов: ${hasTouch}` });

        if (viewport && viewport.includes('user-scalable=no')) {
            checks.push({ item: 'Zoom', status: 'warning', message: 'Масштабирование отключено' });
            score -= 10;
            this.addIssue('mobile', 'medium', 'Масштабирование отключено');
        } else {
            checks.push({ item: 'Zoom', status: 'pass', message: 'Масштабирование разрешено' });
        }

        return { score: Math.max(0, score), checks };
    }
}

module.exports = SimpleScanner;
