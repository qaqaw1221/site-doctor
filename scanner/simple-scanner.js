const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

class SimpleScanner {
    constructor() {
        this.cache = new Map();
        this.issues = [];
        this.fixes = [];
        this.stats = { critical: 0, high: 0, medium: 0, low: 0, totalIssues: 0 };
        this.detailedChecks = {
            seo: [],
            performance: [],
            accessibility: [],
            links: [],
            mobile: [],
            security: []
        };
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
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                },
                maxContentLength: 10 * 1024 * 1024,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                validateStatus: () => true
            });
            const data = { html: response.data, status: response.status, headers: response.headers };
            this.cache.set(url, data);
            return data;
        } catch (error) {
            return { error: error.message, html: null, status: 0 };
        }
    }

    addCheck(category, item, status, message, details = null) {
        const check = { item, status, message };
        if (details) check.details = details;
        if (this.detailedChecks[category]) {
            this.detailedChecks[category].push(check);
        }
    }

    addIssue(type, severity, title, description, impact, autoFixable, fixTime, recommendation = null) {
        const issue = { type, severity, title, description, impact, autoFixable, fixTime };
        if (recommendation) issue.recommendation = recommendation;
        this.issues.push(issue);
        
        switch(severity) {
            case 'critical': this.stats.critical++; break;
            case 'high': this.stats.high++; break;
            case 'medium': this.stats.medium++; break;
            case 'low': this.stats.low++; break;
        }
        this.stats.totalIssues++;
    }

    addFix(category, title, description, impact, code = null) {
        this.fixes.push({ category, title, description, impact, code });
    }

    async scan(url, options = {}) {
        const startTime = Date.now();
        if (!this.isValidUrl(url)) {
            return { error: 'Invalid URL', url, overallScore: 0 };
        }

        const page = await this.fetchPage(url);
        if (page.error || !page.html) {
            return {
                url,
                error: page.error || 'Failed to fetch page',
                overallScore: 0,
                scores: { seo: 0, performance: 0, accessibility: 0, links: 0, mobile: 0, security: 0 },
                seo: { score: 0, checks: [] },
                performance: { score: 0, checks: [] },
                accessibility: { score: 0, checks: [] },
                links: { score: 0, checks: [] },
                mobile: { score: 0, checks: [] },
                security: { score: 0, checks: [] },
                issues: [],
                fixes: { fixes: [], totalFixes: 0 },
                stats: { ...this.stats, duration: Date.now() - startTime }
            };
        }

        const $ = cheerio.load(page.html);
        const htmlSize = Buffer.byteLength(page.html, 'utf8');
        const sizeKB = (htmlSize / 1024).toFixed(1);

        // Reset for this scan
        this.issues = [];
        this.fixes = [];
        this.stats = { critical: 0, high: 0, medium: 0, low: 0, totalIssues: 0 };
        this.detailedChecks = { seo: [], performance: [], accessibility: [], links: [], mobile: [], security: [] };

        // Run all checks
        const seoScore = this.checkSEO($);
        const perfScore = this.checkPerformance($, page.html, htmlSize, sizeKB);
        const a11yScore = this.checkAccessibility($);
        const linksScore = this.checkLinks($, url);
        const mobileScore = this.checkMobile($);
        const securityScore = this.checkSecurity($);

        const overallScore = Math.round((seoScore + perfScore + a11yScore + linksScore + mobileScore + securityScore) / 6);

        return {
            url,
            timestamp: new Date().toISOString(),
            overallScore,
            scores: {
                seo: seoScore,
                performance: perfScore,
                accessibility: a11yScore,
                links: linksScore,
                mobile: mobileScore,
                security: securityScore
            },
            seo: { score: seoScore, checks: this.detailedChecks.seo },
            performance: { score: perfScore, checks: this.detailedChecks.performance },
            accessibility: { score: a11yScore, checks: this.detailedChecks.accessibility },
            links: { score: linksScore, checks: this.detailedChecks.links },
            mobile: { score: mobileScore, checks: this.detailedChecks.mobile },
            security: { score: securityScore, checks: this.detailedChecks.security },
            issues: this.issues,
            fixes: {
                fixes: this.fixes,
                totalFixes: this.fixes.length,
                potentialScoreIncrease: Math.min(40, Math.round(this.issues.length * 2))
            },
            stats: {
                ...this.stats,
                duration: Date.now() - startTime,
                htmlSize: `${sizeKB}KB`,
                totalElements: $('*').length,
                totalImages: $('img').length,
                totalLinks: $('a[href]').length,
                totalScripts: $('script').length,
                totalStyles: $('link[rel="stylesheet"]').length,
                pageStatus: page.status
            }
        };
    }

    checkSEO($) {
        let score = 100;
        const title = $('title').text().trim();
        const metaDesc = $('meta[name="description"]').attr('content');
        const metaKeywords = $('meta[name="keywords"]').attr('content');
        const metaAuthor = $('meta[name="author"]').attr('content');
        const metaRobots = $('meta[name="robots"]').attr('content');
        const lang = $('html').attr('lang');
        const canonical = $('link[rel="canonical"]').attr('href');
        const charset = $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content');

        // Title checks
        if (!title) {
            this.addCheck('seo', 'Title Tag', 'error', 'Тег <title> отсутствует или пуст');
            this.addIssue('seo', 'critical', 'Отсутствует заголовок страницы', 'Тег <title> отсутствует или пуст. Это критично для SEO и влияет на CTR в поисковой выдаче.', 30, true, '2 мин', 'Добавьте уникальный <title> с ключевыми словами (30-60 символов)');
            this.addFix('seo', 'Добавить тег <title>', 'Добавьте уникальный заголовок страницы', 'Критично', '<title>Ваш заголовок - Ключевое слово</title>');
            score -= 30;
        } else if (title.length < 10) {
            this.addCheck('seo', 'Title Tag', 'warning', `Слишком короткий (${title.length} символов). Рекомендуется 30-60`);
            this.addIssue('seo', 'medium', 'Слишком короткий заголовок', `Длина заголовка ${title.length} символов. Короткие заголовки не содержат достаточно информации.`, 15, true, '5 мин', 'Расширьте заголовок до 30-60 символов с ключевыми словами');
            score -= 15;
        } else if (title.length > 70) {
            this.addCheck('seo', 'Title Tag', 'warning', `Слишком длинный (${title.length} символов). Будет обрезан в поиске`);
            this.addIssue('seo', 'low', 'Слишком длинный заголовок', `Длина заголовка ${title.length} символов. В поисковой выдаче он будет обрезан.`, 5, true, '5 мин', 'Сократите заголовок до 60 символов');
            score -= 5;
        } else {
            this.addCheck('seo', 'Title Tag', 'pass', `✓ ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`);
        }

        // Meta description checks
        if (!metaDesc) {
            this.addCheck('seo', 'Meta Description', 'error', 'Meta description отсутствует');
            this.addIssue('seo', 'high', 'Отсутствует meta description', 'Meta description отсутствует. Важно для SEO и отображения сниппетов в поиске.', 25, true, '5 мин', 'Добавьте <meta name="description" content="описание 50-160 символов">');
            this.addFix('seo', 'Добавить meta description', 'Добавьте описание страницы для поисковых систем', 'Важно', '<meta name="description" content="Уникальное описание страницы 50-160 символов">');
            score -= 20;
        } else if (metaDesc.length < 50) {
            this.addCheck('seo', 'Meta Description', 'warning', `Слишком короткое (${metaDesc.length} символов). Оптимально 50-160`);
            this.addIssue('seo', 'medium', 'Слишком короткое описание', `Длина ${metaDesc.length} символов. Описание слишком короткое для привлечения кликов.`, 10, true, '5 мин', 'Расширьте описание до 50-160 символов');
            score -= 10;
        } else if (metaDesc.length > 160) {
            this.addCheck('seo', 'Meta Description', 'warning', `Слишком длинное (${metaDesc.length} символов). Будет обрезано`);
            this.addIssue('seo', 'low', 'Слишком длинное описание', `Длина ${metaDesc.length} символов. Описание будет обрезано в поиске.`, 5, true, '5 мин', 'Сократите до 150-160 символов');
            score -= 5;
        } else {
            this.addCheck('seo', 'Meta Description', 'pass', `✓ ${metaDesc.substring(0, 60)}...`);
        }

        // H1 checks
        const h1Count = $('h1').length;
        const h1 = $('h1').first().text().trim();
        if (h1Count === 0) {
            this.addCheck('seo', 'H1 Heading', 'error', 'Тег H1 отсутствует');
            this.addIssue('seo', 'high', 'Отсутствует заголовок H1', 'На странице нет видимого тега h1. Заголовок H1 важен для структуры контента.', 20, true, '10 мин', 'Добавьте один главный заголовок <h1> с ключевым словом');
            this.addFix('seo', 'Добавить тег H1', 'Добавьте главный заголовок страницы', 'Важно', '<h1>Главный заголовок с ключевым словом</h1>');
            score -= 15;
        } else if (h1Count > 1) {
            this.addCheck('seo', 'H1 Heading', 'warning', `Несколько H1 тегов (${h1Count}). Рекомендуется один`);
            this.addIssue('seo', 'medium', 'Несколько заголовков H1', `На странице ${h1Count} тегов h1. Рекомендуется использовать только один H1.`, 10, true, '15 мин', 'Оставьте только один H1, остальные замените на H2');
            score -= 10;
        } else {
            this.addCheck('seo', 'H1 Heading', 'pass', `✓ ${h1.substring(0, 50)}${h1.length > 50 ? '...' : ''}`);
        }

        // H2-H6 structure
        const h2Count = $('h2').length;
        const h3Count = $('h3').length;
        this.addCheck('seo', 'H2 Tags', h2Count > 0 ? 'pass' : 'info', `Найдено: ${h2Count}`);
        this.addCheck('seo', 'H3 Tags', h3Count > 0 ? 'pass' : 'info', `Найдено: ${h3Count}`);

        if (h2Count === 0) {
            this.addIssue('seo', 'low', 'Отсутствуют теги H2', 'Рекомендуется использовать H2 для структурирования контента.', 5, true, '10 мин', 'Добавьте подзаголовки H2 для разделения контента');
        }

        // Language
        if (!lang) {
            this.addCheck('seo', 'Language Attribute', 'error', 'Атрибут lang отсутствует на <html>');
            this.addIssue('seo', 'medium', 'Не указан язык страницы', 'Атрибут lang отсутствует на теге html. Важно для поисковых систем.', 10, true, '2 мин', 'Добавьте <html lang="ru">');
            this.addFix('seo', 'Добавить lang атрибут', 'Укажите язык страницы', 'Среднее', '<html lang="ru">');
            score -= 10;
        } else {
            this.addCheck('seo', 'Language Attribute', 'pass', `✓ Язык: ${lang}`);
        }

        // Canonical
        if (!canonical) {
            this.addCheck('seo', 'Canonical URL', 'warning', 'Canonical не указан');
            this.addIssue('seo', 'low', 'Отсутствует canonical URL', 'Canonical URL помогает избежать дублирования контента.', 5, true, '5 мин', 'Добавьте <link rel="canonical" href="https://example.com/page">');
            this.addFix('seo', 'Добавить canonical', 'Укажите канонический URL', 'Низкое', `<link rel="canonical" href="${$('meta[property="og:url"]').attr('content') || 'https://example.com'}">`);
            score -= 5;
        } else {
            this.addCheck('seo', 'Canonical URL', 'pass', `✓ ${canonical}`);
        }

        // Robots
        if (metaRobots && metaRobots.includes('noindex')) {
            this.addCheck('seo', 'Robots Meta', 'error', 'Страница запрещена к индексации (noindex)');
            this.addIssue('seo', 'critical', 'Страница запрещена к индексации', 'Meta robots содержит noindex. Страница не будет проиндексирована.', 20, false, '30 мин', 'Удалите noindex из meta robots');
            score -= 20;
        } else {
            this.addCheck('seo', 'Robots Meta', 'pass', '✓ Страница индексируется');
        }

        // Open Graph
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogDesc = $('meta[property="og:description"]').attr('content');
        const ogImage = $('meta[property="og:image"]').attr('content');
        const ogType = $('meta[property="og:type"]').attr('content');
        const ogUrl = $('meta[property="og:url"]').attr('content');

        if (!ogTitle || !ogImage) {
            this.addCheck('seo', 'Open Graph Tags', 'warning', 'Open Graph теги неполные или отсутствуют');
            this.addIssue('seo', 'low', 'Отсутствуют Open Graph теги', 'Open Graph теги важны для красивого отображения ссылок в соцсетях.', 5, true, '10 мин', 'Добавьте og:title, og:description, og:image');
            this.addFix('seo', 'Добавить Open Graph', 'Настройте Open Graph для соцсетей', 'Низкое', '<meta property="og:title" content="Заголовок"><meta property="og:description" content="Описание"><meta property="og:image" content="image.jpg">');
        } else {
            this.addCheck('seo', 'Open Graph Tags', 'pass', '✓ Open Graph настроен');
        }

        // Twitter Card
        const twitterCard = $('meta[name="twitter:card"]').attr('content');
        this.addCheck('seo', 'Twitter Card', twitterCard ? 'pass' : 'info', twitterCard || 'Не настроен');

        // Favicon
        const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');
        if (!favicon) {
            this.addCheck('seo', 'Favicon', 'warning', 'Favicon не найден');
            this.addIssue('seo', 'low', 'Favicon не найден', 'Favicon улучшает узнаваемость сайта в браузере.', 3, true, '5 мин', 'Добавьте <link rel="icon" href="/favicon.ico">');
        } else {
            this.addCheck('seo', 'Favicon', 'pass', '✓ Favicon найден');
        }

        // HTTPS
        const isHttps = $('meta[property="og:url"]').attr('content')?.startsWith('https') || 
                        $('link[rel="canonical"]').attr('href')?.startsWith('https');
        this.addCheck('seo', 'HTTPS', isHttps ? 'pass' : 'info', isHttps ? '✓ HTTPS используется' : 'HTTP (рекомендуется HTTPS)');

        // Keywords
        this.addCheck('seo', 'Meta Keywords', metaKeywords ? 'info' : 'info', metaKeywords ? `✓ ${metaKeywords.substring(0, 50)}...` : 'Не указаны (не критично)');

        // Author
        this.addCheck('seo', 'Meta Author', metaAuthor ? 'pass' : 'info', metaAuthor || 'Не указан');

        // Charset
        if (!charset) {
            this.addCheck('seo', 'Character Encoding', 'warning', 'Charset не указан');
        } else {
            this.addCheck('seo', 'Character Encoding', 'pass', `✓ ${charset}`);
        }

        return Math.max(0, score);
    }

    checkPerformance($, html, htmlSize, sizeKB) {
        let score = 100;
        const scripts = $('script').length;
        const externalScripts = $('script[src]').length;
        const inlineScripts = $('script:not([src])').length;
        const stylesheets = $('link[rel="stylesheet"]').length;
        const inlineStyles = $('[style]').length;
        const images = $('img').length;
        const lazyImages = $('img[loading="lazy"]').length;
        const imagesWithoutAlt = $('img:not([alt])').length;
        const imagesWithoutSrc = $('img:not([src])').length;
        const iframes = $('iframe').length;
        const totalElements = $('*').length;
        const forms = $('form').length;
        const buttons = $('button').length;
        const links = $('a').length;
        const preloads = $('link[rel="preload"]').length;
        const preconnects = $('link[rel="preconnect"]').length;
        const deferScripts = $('script[defer]').length;
        const asyncScripts = $('script[async]').length;

        // HTML Size
        if (htmlSize > 500000) {
            this.addCheck('performance', 'HTML Size', 'error', `${sizeKB}KB - Слишком большой (рекомендуется <500KB)`);
            this.addIssue('performance', 'high', 'HTML слишком большой', `Размер HTML: ${sizeKB}. Это замедляет загрузку страницы.`, 20, true, '30 мин', 'Минимизируйте HTML, удалите лишние комментарии и пробелы');
            this.addFix('performance', 'Уменьшить размер HTML', 'Оптимизируйте HTML код', 'Высокое', 'Удалите комментарии, лишние пробелы, неиспользуемый CSS/JS');
            score -= 20;
        } else if (htmlSize > 150000) {
            this.addCheck('performance', 'HTML Size', 'warning', `${sizeKB}KB - Большой (рекомендуется <150KB)`);
            this.addIssue('performance', 'medium', 'HTML большой', `Размер HTML: ${sizeKB}. Рекомендуется менее 150KB.`, 10, true, '20 мин', 'Минимизируйте HTML код');
            score -= 10;
        } else if (htmlSize > 50000) {
            this.addCheck('performance', 'HTML Size', 'info', `${sizeKB}KB - Средний (можно оптимизировать)`);
            score -= 3;
        } else {
            this.addCheck('performance', 'HTML Size', 'pass', `✓ ${sizeKB}KB - Хороший размер`);
        }

        // Scripts
        if (externalScripts > 15) {
            this.addCheck('performance', 'External Scripts', 'error', `${externalScripts} внешних скриптов - Много (рекомендуется <10)`);
            this.addIssue('performance', 'high', 'Слишком много внешних скриптов', `${externalScripts} внешних скриптов замедляют загрузку.`, 15, true, '30 мин', 'Объедините скрипты, используйте defer/async');
            this.addFix('performance', 'Оптимизировать скрипты', 'Объедините JS файлы, используйте lazy loading', 'Высокое', 'Добавьте defer или async к скриптам');
            score -= 15;
        } else if (externalScripts > 10) {
            this.addCheck('performance', 'External Scripts', 'warning', `${externalScripts} скриптов - Можно оптимизировать`);
            this.addIssue('performance', 'medium', 'Много внешних скриптов', `Найдено ${externalScripts} скриптов.`, 8, true, '20 мин', 'Объедините скрипты');
            score -= 8;
        } else {
            this.addCheck('performance', 'External Scripts', 'pass', `✓ ${externalScripts} внешних скриптов`);
        }

        // Script loading optimization
        if (externalScripts > 0) {
            const optimizedRatio = (deferScripts + asyncScripts) / externalScripts;
            if (optimizedRatio < 0.5) {
                this.addCheck('performance', 'Script Loading', 'warning', `Defer: ${deferScripts}, Async: ${asyncScripts} из ${externalScripts} - Можно лучше`);
                this.addIssue('performance', 'low', 'Скрипты блокируют загрузку', `Только ${Math.round(optimizedRatio * 100)}% оптимизированы.`, 5, true, '15 мин', 'Добавьте defer/async к скриптам');
            } else {
                this.addCheck('performance', 'Script Loading', 'pass', `✓ ${Math.round(optimizedRatio * 100)}% оптимизированы (defer/async)`);
            }
        }

        // Stylesheets
        if (stylesheets > 10) {
            this.addCheck('performance', 'CSS Files', 'warning', `${stylesheets} файлов - Много (рекомендуется <6)`);
            this.addIssue('performance', 'medium', 'Много CSS файлов', `${stylesheets} CSS файлов создают дополнительные запросы.`, 8, true, '20 мин', 'Объедините CSS файлы в один');
            this.addFix('performance', 'Объединить CSS', 'Объедините все CSS в один файл', 'Среднее', '<link rel="stylesheet" href="combined.min.css">');
            score -= 8;
        } else if (stylesheets > 5) {
            this.addCheck('performance', 'CSS Files', 'info', `${stylesheets} файлов - Можно объединить`);
            score -= 3;
        } else {
            this.addCheck('performance', 'CSS Files', 'pass', `✓ ${stylesheets} CSS файлов`);
        }

        // Images
        if (images > 0) {
            if (lazyImages < images * 0.5) {
                this.addCheck('performance', 'Lazy Loading', 'warning', `Только ${lazyImages} из ${images} изображений с lazy loading`);
                this.addIssue('performance', 'medium', 'Изображения загружаются сразу', `${lazyImages} из ${images} изображений используют lazy loading. Остальные замедляют загрузку.`, 10, true, '15 мин', 'Добавьте loading="lazy" ко всем img ниже первого экрана');
                this.addFix('performance', 'Добавить lazy loading', 'Добавьте loading="lazy" к изображениям', 'Среднее', '<img src="image.jpg" loading="lazy" alt="описание">');
                score -= 10;
            } else {
                this.addCheck('performance', 'Lazy Loading', 'pass', `✓ ${lazyImages}/${images} с lazy loading`);
            }
        } else {
            this.addCheck('performance', 'Images', 'info', 'Нет изображений на странице');
        }

        // Images without alt
        if (imagesWithoutAlt > 0) {
            this.addCheck('performance', 'Images without Alt', 'error', `${imagesWithoutAlt} изображений без alt атрибута`);
            this.addIssue('performance', 'high', 'Изображения без alt', `${imagesWithoutAlt} изображений без атрибута alt.`, 15, true, '20 мин', 'Добавьте alt ко всем изображениям');
            score -= 10;
        }

        // Images without src
        if (imagesWithoutSrc > 0) {
            this.addCheck('performance', 'Images without Src', 'warning', `${imagesWithoutSrc} изображений без src`);
            this.addIssue('performance', 'medium', 'Изображения без src', `${imagesWithoutSrc} изображений без атрибута src.`, 8, false, '15 мин', 'Удалите или добавьте src к img тегам');
            score -= 5;
        }

        // iFrames
        if (iframes > 5) {
            this.addCheck('performance', 'iFrames', 'warning', `${iframes} iFrames - Много (рекомендуется <3)`);
            this.addIssue('performance', 'medium', 'Много iFrames', `${iframes} iFrames замедляют загрузку.`, 5, true, '20 мин', 'Удалите ненужные iFrames');
            score -= 5;
        } else {
            this.addCheck('performance', 'iFrames', iframes > 0 ? 'info' : 'pass', `${iframes > 0 ? iframes + ' iFrames' : '✓ Нет iFrames'}`);
        }

        // DOM Size
        if (totalElements > 2000) {
            this.addCheck('performance', 'DOM Size', 'warning', `${totalElements} элементов - Много (рекомендуется <1500)`);
            this.addIssue('performance', 'medium', 'Слишком большой DOM', `${totalElements} DOM элементов замедляют рендеринг.`, 5, true, '60 мин', 'Упростите структуру DOM');
            score -= 5;
        } else if (totalElements > 1500) {
            this.addCheck('performance', 'DOM Size', 'info', `${totalElements} элементов - Средний`);
            score -= 2;
        } else {
            this.addCheck('performance', 'DOM Size', 'pass', `✓ ${totalElements} элементов`);
        }

        // Preconnect/Preload
        if (preconnects > 0 || preloads > 0) {
            this.addCheck('performance', 'Resource Hints', 'pass', `✓ Preconnect: ${preconnects}, Preload: ${preloads}`);
        } else {
            this.addCheck('performance', 'Resource Hints', 'info', 'Preconnect/Preload не используются');
        }

        // Inline styles
        if (inlineStyles > 50) {
            this.addCheck('performance', 'Inline Styles', 'warning', `${inlineStyles} inline стилей - Много`);
            this.addIssue('performance', 'low', 'Много inline стилей', `${inlineStyles} inline стилей. Это увеличивает размер HTML.`, 3, true, '30 мин', 'Вынесите стили в CSS файл');
            score -= 3;
        } else {
            this.addCheck('performance', 'Inline Styles', inlineStyles > 20 ? 'info' : 'pass', `${inlineStyles} inline стилей`);
        }

        return Math.max(0, score);
    }

    checkAccessibility($) {
        let score = 100;
        const imagesWithoutAlt = $('img:not([alt])').length;
        const images = $('img').length;
        const emptyLinks = $('a').filter(function() {
            return !$(this).text().trim() && !$(this).find('img').length && !$(this).attr('aria-label');
        }).length;
        const inputs = $('input:not([type="hidden"])').length;
        const labeledInputs = $('input[aria-label], input[id], input[aria-labelledby]').length;
        const buttons = $('button').length;
        const buttonsWithoutText = $('button').filter(function() {
            return !$(this).text().trim() && !$(this).find('img').length && !$(this).attr('aria-label');
        }).length;
        const lang = $('html').attr('lang');
        const viewport = $('meta[name="viewport"]').attr('content');
        const headings = $('h1, h2, h3, h4, h5, h6').length;
        const ariaElements = $('[aria-label], [aria-describedby], [role], [aria-hidden]').length;
        const hasSkipLink = $('a[href^="#"]').filter(function() {
            return $(this).text().toLowerCase().includes('skip') || $(this).attr('href') === '#main' || $(this).attr('href') === '#content';
        }).length > 0;
        const hasMainLandmark = $('main, [role="main"]').length > 0;
        const hasHeader = $('header, [role="banner"]').length > 0;
        const hasFooter = $('footer, [role="contentinfo"]').length > 0;

        // Images Alt
        if (imagesWithoutAlt > 0) {
            this.addCheck('accessibility', 'Images Alt Text', 'error', `${imagesWithoutAlt} из ${images} изображений без alt`);
            this.addIssue('accessibility', 'high', 'Изображения без alt-тегов', `${imagesWithoutAlt} изображений без атрибута alt. Скринридеры не могут их прочитать.`, 20, true, '20 мин', 'Добавьте alt ко всем изображениям');
            this.addFix('accessibility', 'Добавить alt к изображениям', 'Добавьте описательный alt к каждому изображению', 'Высокое', '<img src="photo.jpg" alt="Описание изображения">');
            score -= 20;
        } else if (images > 0) {
            this.addCheck('accessibility', 'Images Alt Text', 'pass', `✓ Все ${images} изображений с alt`);
        }

        // Empty Links
        if (emptyLinks > 0) {
            this.addCheck('accessibility', 'Empty Links', 'error', `${emptyLinks} пустых ссылок`);
            this.addIssue('accessibility', 'high', 'Пустые ссылки', `${emptyLinks} ссылок без текста. Скринридеры не могут их прочитать.`, 15, true, '15 мин', 'Добавьте текст или aria-label к ссылкам');
            this.addFix('accessibility', 'Добавить текст к ссылкам', 'Заполните пустые ссылки текстом', 'Высокое', '<a href="/page">Текст ссылки</a>');
            score -= 15;
        } else {
            this.addCheck('accessibility', 'Empty Links', 'pass', '✓ Нет пустых ссылок');
        }

        // Form Labels
        if (inputs > 0) {
            if (labeledInputs < inputs) {
                const unlabeled = inputs - labeledInputs;
                this.addCheck('accessibility', 'Form Labels', 'warning', `${unlabeled} из ${inputs} полей без labels`);
                this.addIssue('accessibility', 'medium', 'Поля формы без labels', `${unlabeled} полей формы без связанного label. Скринридеры не смогут их прочитать.`, 10, true, '15 мин', 'Добавьте <label for="id"> или aria-label к полям');
                this.addFix('accessibility', 'Добавить labels', 'Свяжите label с input через for/id', 'Среднее', '<label for="email">Email</label><input id="email" type="email">');
                score -= 10;
            } else {
                this.addCheck('accessibility', 'Form Labels', 'pass', `✓ Все ${inputs} полей с labels`);
            }
        }

        // Buttons
        if (buttonsWithoutText > 0) {
            this.addCheck('accessibility', 'Button Text', 'warning', `${buttonsWithoutText} из ${buttons} кнопок без текста`);
            this.addIssue('accessibility', 'low', 'Кнопки без текста', `${buttonsWithoutText} кнопок без текста. Добавьте текст или aria-label.`, 5, true, '10 мин', 'Добавьте текст или aria-label к кнопкам');
            score -= 5;
        } else if (buttons > 0) {
            this.addCheck('accessibility', 'Buttons', 'pass', `✓ ${buttons} кнопок с текстом`);
        }

        // Language
        if (!lang) {
            this.addCheck('accessibility', 'Page Language', 'error', 'Язык страницы не указан');
            this.addIssue('accessibility', 'high', 'Не указан язык страницы', 'Скринридеры не знают на каком языке читать страницу.', 15, true, '2 мин', 'Добавьте <html lang="ru">');
            this.addFix('accessibility', 'Указать язык', 'Добавьте атрибут lang', 'Высокое', '<html lang="ru">');
            score -= 15;
        } else {
            this.addCheck('accessibility', 'Page Language', 'pass', `✓ Язык: ${lang}`);
        }

        // Viewport
        if (!viewport) {
            this.addCheck('accessibility', 'Viewport Meta', 'error', 'Viewport не настроен');
            this.addIssue('accessibility', 'high', 'Viewport meta тег отсутствует', 'Без viewport страница не адаптируется для мобильных устройств.', 15, true, '2 мин', 'Добавьте <meta name="viewport" content="width=device-width, initial-scale=1">');
            this.addFix('accessibility', 'Добавить viewport', 'Настройте viewport для мобильных', 'Высокое', '<meta name="viewport" content="width=device-width, initial-scale=1">');
            score -= 15;
        } else {
            this.addCheck('accessibility', 'Viewport Meta', 'pass', `✓ ${viewport}`);
        }

        // Headings Structure
        const h1Count = $('h1').length;
        const h2Count = $('h2').length;
        const h3Count = $('h3').length;
        if (h1Count === 0) {
            this.addCheck('accessibility', 'Heading Structure', 'warning', 'H1 не найден');
        } else if (h1Count > 1) {
            this.addCheck('accessibility', 'Heading Structure', 'warning', `${h1Count} заголовков H1 - должно быть 1`);
        } else {
            this.addCheck('accessibility', 'Heading Structure', 'pass', `✓ H1: ${h1Count}, H2: ${h2Count}, H3: ${h3Count}`);
        }

        // ARIA
        this.addCheck('accessibility', 'ARIA Attributes', ariaElements > 0 ? 'pass' : 'info', `${ariaElements} ARIA атрибутов`);

        // Landmarks
        if (hasMainLandmark && hasHeader && hasFooter) {
            this.addCheck('accessibility', 'Landmarks', 'pass', '✓ Основные landmarks (header, main, footer) найдены');
        } else {
            this.addCheck('accessibility', 'Landmarks', 'info', 'Используйте семантические теги: header, main, footer, nav');
        }

        // Skip Link
        this.addCheck('accessibility', 'Skip Link', hasSkipLink ? 'pass' : 'info', hasSkipLink ? '✓ Skip link найден' : 'Skip link не найден');

        return Math.max(0, score);
    }

    checkLinks($, baseUrl) {
        let score = 100;
        let internalLinks = 0;
        let externalLinks = 0;
        let brokenLinks = 0;
        let mailtoLinks = 0;
        let telLinks = 0;
        let nofollowLinks = 0;
        let targetBlankLinks = 0;
        let hashLinks = 0;

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            
            if (href.startsWith('mailto:')) mailtoLinks++;
            else if (href.startsWith('tel:')) telLinks++;
            else if (href.startsWith('#')) hashLinks++;
            else if (href.startsWith('http') && !href.includes(new URL(baseUrl).hostname)) {
                externalLinks++;
                if ($(el).attr('rel')?.includes('nofollow')) nofollowLinks++;
                if ($(el).attr('target') === '_blank') targetBlankLinks++;
            } else {
                internalLinks++;
            }
        });

        const totalLinks = internalLinks + externalLinks;
        const imagesWithoutSrc = $('img:not([src]), img[src=""]').length;

        // Internal vs External
        if (totalLinks > 0) {
            this.addCheck('links', 'Internal Links', internalLinks > 0 ? 'pass' : 'info', `${internalLinks} внутренних ссылок`);
            this.addCheck('links', 'External Links', externalLinks > 0 ? 'info' : 'pass', `${externalLinks} внешних ссылок`);
        } else {
            this.addCheck('links', 'Links', 'info', 'Ссылок не найдено');
        }

        // Broken images
        if (imagesWithoutSrc > 0) {
            this.addCheck('links', 'Broken Images', 'error', `${imagesWithoutSrc} изображений без src`);
            this.addIssue('links', 'high', 'Изображения без src', `${imagesWithoutSrc} изображений без атрибута src.`, 15, false, '15 мин', 'Удалите или заполните img теги');
            score -= 10;
        } else {
            this.addCheck('links', 'Broken Images', 'pass', '✓ Все изображения с src');
        }

        // Email and Phone links
        this.addCheck('links', 'Email Links', mailtoLinks > 0 ? 'pass' : 'info', `${mailtoLinks} mailto ссылок`);
        this.addCheck('links', 'Phone Links', telLinks > 0 ? 'pass' : 'info', `${telLinks} tel ссылок`);

        // Nofollow on external links
        if (externalLinks > 0 && nofollowLinks < externalLinks * 0.5) {
            this.addCheck('links', 'External Link SEO', 'warning', `Только ${nofollowLinks} из ${externalLinks} с nofollow`);
            this.addIssue('links', 'low', 'Внешние ссылки без nofollow', `Только ${nofollowLinks} из ${externalLinks} внешних ссылок имеют nofollow.`, 5, true, '10 мин', 'Добавьте rel="nofollow" к внешним ссылкам');
            score -= 5;
        }

        // Target blank without noopener
        if (targetBlankLinks > 0 && !($('a[target="_blank"]').toArray().some(el => $(el).attr('rel')?.includes('noopener')))) {
            this.addCheck('links', 'Security: Target Blank', 'warning', `${targetBlankLinks} ссылок с target="_blank" без rel="noopener"`);
            this.addIssue('links', 'medium', 'Уязвимость security', ' Ссылки с target="_blank" без rel="noopener" могут быть угрозой безопасности.', 8, true, '5 мин', 'Добавьте rel="noopener noreferrer" к ссылкам с target="_blank"');
            this.addFix('links', 'Исправить target="_blank"', 'Добавьте rel="noopener"', 'Среднее', '<a href="url" target="_blank" rel="noopener noreferrer">');
            score -= 8;
        } else if (targetBlankLinks > 0) {
            this.addCheck('links', 'Security: Target Blank', 'pass', `✓ ${targetBlankLinks} ссылок с правильным rel="noopener"`);
        }

        return Math.max(0, score);
    }

    checkMobile($) {
        let score = 100;
        const viewport = $('meta[name="viewport"]').attr('content');
        const hasMediaQuery = $('style').text().includes('@media') || $('link[rel="stylesheet"]').length > 0;
        const hasFlexibleWidth = $('*').filter(function() {
            const style = $(this).attr('style') || '';
            return style.includes('width') && (style.includes('%') || style.includes('vw'));
        }).length > 0;
        const tapTargets = $('a, button, input, select, textarea').length;
        const fontSizeSmall = $('[style*="font-size"], style').filter(function() {
            const text = $(this).text() || '';
            return /font-size\s*:\s*[0-9]+px/.test(text) && /font-size\s*:\s*1[0-4]px/.test(text);
        }).length;

        // Viewport
        if (!viewport) {
            this.addCheck('mobile', 'Viewport Meta', 'error', 'Viewport отсутствует');
            this.addIssue('mobile', 'critical', 'Viewport не настроен', 'Без viewport страница не адаптируется под мобильные. Это критично.', 30, true, '2 мин', 'Добавьте <meta name="viewport" content="width=device-width, initial-scale=1">');
            this.addFix('mobile', 'Добавить viewport', 'Настройте viewport', 'Критично', '<meta name="viewport" content="width=device-width, initial-scale=1">');
            score -= 30;
        } else {
            this.addCheck('mobile', 'Viewport Meta', 'pass', `✓ ${viewport}`);
        }

        // Responsive CSS
        if (hasMediaQuery) {
            this.addCheck('mobile', 'Responsive CSS', 'pass', '✓ Media queries найдены');
        } else {
            this.addCheck('mobile', 'Responsive CSS', 'warning', 'Media queries не найдены');
            this.addIssue('mobile', 'medium', 'Возможно нет адаптивного дизайна', 'Не найдены @media запросы. Страница может не адаптироваться.', 10, true, '60 мин', 'Добавьте @media запросы в CSS');
            score -= 10;
        }

        // Touch-friendly
        this.addCheck('mobile', 'Tap Targets', 'info', `${tapTargets} интерактивных элементов`);

        // Viewport zoom
        if (viewport && viewport.includes('user-scalable=no')) {
            this.addCheck('mobile', 'User Scalable', 'warning', 'Масштабирование отключено пользователем');
            this.addIssue('mobile', 'medium', 'Масштабирование отключено', 'Пользователи не могут масштабировать страницу. Это нарушает accessibility.', 10, true, '2 мин', 'Удалите user-scalable=no из viewport');
            score -= 10;
        } else if (viewport) {
            this.addCheck('mobile', 'User Scalable', 'pass', '✓ Масштабирование разрешено');
        }

        // Mobile Web App
        const mobileWebApp = $('meta[name="mobile-web-app-capable"]').attr('content');
        const appleMobileWebApp = $('meta[name="apple-mobile-web-app-capable"]').attr('content');
        this.addCheck('mobile', 'PWA Meta', (mobileWebApp || appleMobileWebApp) ? 'info' : 'info', (mobileWebApp || appleMobileWebApp) ? '✓ PWA настроен' : 'PWA мета не найдены');

        return Math.max(0, score);
    }

    checkSecurity($) {
        let score = 100;

        // HTTPS check
        const ogUrl = $('meta[property="og:url"]').attr('content');
        const canonical = $('link[rel="canonical"]').attr('href');
        const isHttps = (ogUrl && ogUrl.startsWith('https://')) || (canonical && canonical.startsWith('https://'));

        if (!isHttps) {
            this.addCheck('security', 'HTTPS', 'warning', 'HTTPS не используется');
            this.addIssue('security', 'high', 'Сайт не использует HTTPS', 'HTTPS важен для безопасности и SEO.', 20, false, '60 мин', 'Установите SSL сертификат');
            score -= 20;
        } else {
            this.addCheck('security', 'HTTPS', 'pass', '✓ HTTPS используется');
        }

        // X-Frame-Options
        const xFrameOptions = $('meta[http-equiv="X-Frame-Options"]').attr('content');
        this.addCheck('security', 'X-Frame-Options', xFrameOptions ? 'pass' : 'info', xFrameOptions ? '✓ Настроен' : 'Не настроен (ренкомендуется для защиты от clickjacking)');

        // Content Security Policy
        const csp = $('meta[http-equiv="Content-Security-Policy"]').attr('content');
        this.addCheck('security', 'CSP', csp ? 'pass' : 'info', csp ? '✓ CSP настроена' : 'CSP не найдена');

        // Mixed content
        const httpResources = $('script[src^="http://"], link[href^="http://"], img[src^="http://"]').filter(function() {
            const src = $(this).attr('src') || $(this).attr('href') || '';
            return !src.startsWith('https://') && (src.startsWith('http://'));
        }).length;

        if (httpResources > 0) {
            this.addCheck('security', 'Mixed Content', 'warning', `${httpResources} HTTP ресурсов на HTTPS странице`);
            this.addIssue('security', 'medium', 'Mixed Content обнаружен', `${httpResources} ресурсов загружаются по HTTP. Это угроза безопасности.`, 10, true, '30 мин', 'Замените http:// на https:// для всех ресурсов');
            score -= 10;
        } else {
            this.addCheck('security', 'Mixed Content', 'pass', '✓ Нет mixed content');
        }

        return Math.max(0, score);
    }

    close() {
        this.cache.clear();
    }
}

module.exports = SimpleScanner;
