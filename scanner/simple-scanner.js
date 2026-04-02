const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

class SimpleScanner {
    constructor() {
        this.cache = new Map();
        this.issues = [];
        this.fixes = [];
        this.stats = { critical: 0, high: 0, medium: 0, low: 0, totalIssues: 0 };
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

    addIssue(type, severity, title, description, impact, autoFixable, fixTime) {
        this.issues.push({ type, severity, title, description, impact, autoFixable, fixTime });
        if (severity === 'critical') this.stats.critical++;
        else if (severity === 'high') this.stats.high++;
        else if (severity === 'medium') this.stats.medium++;
        else this.stats.low++;
        this.stats.totalIssues++;
    }

    addFix(category, description, preview, impact) {
        this.fixes.push({ category, description, preview, impact });
    }

    async scan(url) {
        const startTime = Date.now();
        if (!this.isValidUrl(url)) return { error: 'Invalid URL' };

        const page = await this.fetchPage(url);
        if (page.error) return { url, error: page.error, overallScore: 0, issues: [], fixes: { fixes: [], totalFixes: 0, potentialScoreIncrease: 0 }, stats: { critical: 0, high: 0, medium: 0, low: 0, totalIssues: 0, duration: 0 }, seo: { score: 0, checks: [] }, performance: { score: 0, checks: [] }, accessibility: { score: 0, checks: [] }, links: { score: 0, checks: [] }, mobile: { score: 0, checks: [] }, scores: { seo: 0, performance: 0, accessibility: 0, links: 0, mobile: 0 } };

        const $ = cheerio.load(page.html);

        const seo = this.checkSEO($, url);
        const perf = this.checkPerformance($, page.html);
        const a11y = this.checkAccessibility($);
        const links = this.checkLinks($, url);
        const mobile = this.checkMobile($);

        const overallScore = Math.round((seo.score + perf.score + a11y.score + links.score + mobile.score) / 5);

        return {
            url,
            timestamp: new Date().toISOString(),
            overallScore,
            score: overallScore,
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
                totalFixes: this.fixes.length,
                potentialScoreIncrease: Math.min(30, this.fixes.length * 5)
            },
            stats: {
                ...this.stats,
                duration: Date.now() - startTime,
                totalElements: $('*').length,
                htmlSize: Buffer.byteLength(page.html, 'utf8')
            }
        };
    }

    checkSEO($, url) {
        const checks = [];
        let score = 100;

        const title = $('title').text().trim();
        if (!title) {
            checks.push({ item: 'Title', status: 'error', message: 'Отсутствует тег <title>' });
            score -= 30;
            this.addIssue('seo', 'critical', 'Отсутствует заголовок страницы', 'Тег <title> отсутствует или пуст. Это критично для SEO.', 30, true, '2 мин');
            this.addFix('seo', 'Добавить тег <title>', '<title>Заголовок страницы</title>', 'Высокий');
        } else if (title.length < 10) {
            checks.push({ item: 'Title', status: 'warning', message: `Title слишком короткий (${title.length} символов)` });
            score -= 15;
            this.addIssue('seo', 'medium', 'Слишком короткий заголовок', `Длина заголовка ${title.length} символов. Рекомендуется 30-60 символов.`, 15, true, '5 мин');
        } else if (title.length > 70) {
            checks.push({ item: 'Title', status: 'warning', message: `Title слишком длинный (${title.length} символов)` });
            score -= 5;
            this.addIssue('seo', 'low', 'Слишком длинный заголовок', `Длина заголовка ${title.length} символов. Будет обрезан в поисковой выдаче.`, 5, true, '5 мин');
        } else {
            checks.push({ item: 'Title', status: 'pass', message: `Title: ${title}` });
        }

        const metaDesc = $('meta[name="description"]').attr('content');
        if (!metaDesc) {
            checks.push({ item: 'Meta Description', status: 'error', message: 'Отсутствует meta description' });
            score -= 20;
            this.addIssue('seo', 'high', 'Отсутствует meta description', 'Мета-тег description отсутствует. Важно для SEO и сниппетов в поиске.', 25, true, '5 мин');
            this.addFix('seo', 'Добавить meta description', '<meta name="description" content="Описание страницы">', 'Высокий');
        } else if (metaDesc.length < 50 || metaDesc.length > 160) {
            checks.push({ item: 'Meta Description', status: 'warning', message: `Некорректная длина description (${metaDesc.length} символов)` });
            score -= 10;
            this.addIssue('seo', 'low', 'Некорректная длина description', `Длина ${metaDesc.length} символов. Оптимально: 50-160.`, 10, true, '5 мин');
        } else {
            checks.push({ item: 'Meta Description', status: 'pass', message: `Description: ${metaDesc.substring(0, 60)}...` });
        }

        const h1Count = $('h1').length;
        const h1 = $('h1').first().text().trim();
        if (h1Count === 0) {
            checks.push({ item: 'H1 Tag', status: 'error', message: 'Отсутствует тег H1' });
            score -= 15;
            this.addIssue('seo', 'high', 'Отсутствует заголовок H1', 'На странице нет видимого тега h1. Важно для структуры контента.', 20, true, '10 мин');
            this.addFix('seo', 'Добавить тег H1', '<h1>Главный заголовок</h1>', 'Высокий');
        } else if (h1Count > 1) {
            checks.push({ item: 'H1 Tag', status: 'warning', message: `Несколько заголовков H1 (${h1Count})` });
            score -= 10;
            this.addIssue('seo', 'medium', 'Несколько заголовков H1', `На странице ${h1Count} тегов h1. Рекомендуется один.`, 10, true, '15 мин');
        } else {
            checks.push({ item: 'H1 Tag', status: 'pass', message: `H1: ${h1}` });
        }

        const h2Count = $('h2').length;
        const h3Count = $('h3').length;
        checks.push({ item: 'H2 Tags', status: h2Count > 0 ? 'pass' : 'warning', message: `H2: ${h2Count}` });
        checks.push({ item: 'H3 Tags', status: 'pass', message: `H3: ${h3Count}` });
        if (h2Count === 0) this.addIssue('seo', 'low', 'Отсутствуют теги H2', 'Рекомендуется использовать H2 для структурирования контента.', 5, true, '10 мин');

        const lang = $('html').attr('lang');
        if (!lang) {
            checks.push({ item: 'Language', status: 'error', message: 'Не указан язык' });
            score -= 10;
            this.addIssue('seo', 'medium', 'Не указан язык страницы', 'Атрибут lang отсутствует на теге html.', 10, true, '2 мин');
            this.addFix('seo', 'Добавить lang атрибут', '<html lang="ru">', 'Средний');
        } else {
            checks.push({ item: 'Language', status: 'pass', message: `Язык: ${lang}` });
        }

        const canonical = $('link[rel="canonical"]').attr('href');
        if (!canonical) {
            checks.push({ item: 'Canonical', status: 'warning', message: 'Canonical не указан' });
            score -= 5;
            this.addIssue('seo', 'low', 'Отсутствует canonical URL', 'Canonical URL помогает избежать дублирования контента.', 5, true, '5 мин');
            this.addFix('seo', 'Добавить canonical URL', `<link rel="canonical" href="${url}">`, 'Низкий');
        } else {
            checks.push({ item: 'Canonical', status: 'pass', message: `Canonical: ${canonical}` });
        }

        const metaRobots = $('meta[name="robots"]').attr('content');
        if (metaRobots && metaRobots.includes('noindex')) {
            checks.push({ item: 'Robots', status: 'error', message: 'Страница запрещена к индексации' });
            score -= 20;
            this.addIssue('seo', 'critical', 'Страница запрещена к индексации', 'Meta robots содержит noindex. Страница не будет проиндексирована.', 20, false, '30 мин');
        } else {
            checks.push({ item: 'Robots', status: 'pass', message: 'Страница индексируется' });
        }

        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogDesc = $('meta[property="og:description"]').attr('content');
        const ogImage = $('meta[property="og:image"]').attr('content');
        const ogType = $('meta[property="og:type"]').attr('content');
        if (!ogTitle || !ogImage) {
            checks.push({ item: 'Open Graph', status: 'warning', message: 'Open Graph теги неполные' });
            score -= 5;
            this.addIssue('seo', 'low', 'Отсутствуют Open Graph теги', 'Open Graph теги важны для красивого отображения ссылок в соцсетях.', 5, true, '10 мин');
            this.addFix('seo', 'Добавить Open Graph теги', '<meta property="og:title" content="...">', 'Низкий');
        } else {
            checks.push({ item: 'Open Graph', status: 'pass', message: 'Open Graph настроен' });
        }

        const twitterCard = $('meta[name="twitter:card"]').attr('content');
        checks.push({ item: 'Twitter Card', status: twitterCard ? 'pass' : 'info', message: twitterCard ? 'Twitter Cards настроены' : 'Twitter Cards не настроены' });

        const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');
        checks.push({ item: 'Favicon', status: favicon ? 'pass' : 'warning', message: favicon ? 'Favicon найден' : 'Favicon не найден' });
        if (!favicon) this.addIssue('seo', 'low', 'Favicon не найден', 'Favicon улучшает узнаваемость бренда.', 3, true, '5 мин');

        const httpsUrl = url.startsWith('https://');
        checks.push({ item: 'HTTPS', status: httpsUrl ? 'pass' : 'error', message: httpsUrl ? 'HTTPS используется' : 'HTTPS не используется' });
        if (!httpsUrl) {
            score -= 10;
            this.addIssue('seo', 'high', 'HTTPS не используется', 'HTTPS важен для безопасности и SEO.', 15, false, '60 мин');
            this.addFix('seo', 'Перейти на HTTPS', 'Установите SSL сертификат', 'Высокий');
        }

        const keywords = $('meta[name="keywords"]').attr('content');
        checks.push({ item: 'Keywords', status: keywords ? 'info' : 'info', message: keywords ? `Keywords: ${keywords.substring(0, 50)}...` : 'Keywords не указаны (не критично)' });

        const author = $('meta[name="author"]').attr('content');
        checks.push({ item: 'Author', status: author ? 'pass' : 'info', message: author || 'Author не указан' });

        const charset = $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content');
        checks.push({ item: 'Charset', status: charset ? 'pass' : 'warning', message: charset || 'Charset не указан' });

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
            this.addIssue('performance', 'high', 'HTML слишком большой', `Размер HTML: ${sizeKB}KB. Рекомендуется менее 150KB.`, 20, true, '30 мин');
            this.addFix('performance', 'Уменьшить размер HTML', 'Удалите лишние пробелы, комментарии и неиспользуемый код', 'Высокий');
        } else if (htmlSize > 50000) {
            checks.push({ item: 'HTML Size', status: 'warning', message: `HTML большой: ${sizeKB}KB` });
            score -= 10;
        } else {
            checks.push({ item: 'HTML Size', status: 'pass', message: `HTML: ${sizeKB}KB` });
        }

        const scripts = $('script').length;
        const externalScripts = $('script[src]').length;
        const inlineScripts = $('script:not([src])').length;
        if (externalScripts > 10) {
            checks.push({ item: 'Scripts', status: 'error', message: `Слишком много внешних скриптов: ${externalScripts}` });
            score -= 15;
            this.addIssue('performance', 'high', 'Много внешних скриптов', `Найдено ${externalScripts} внешних скриптов. Каждый скрипт — дополнительный HTTP запрос.`, 15, true, '30 мин');
            this.addFix('performance', 'Объединить скрипты', 'Объедините все JS файлы в один', 'Высокий');
        } else {
            checks.push({ item: 'Scripts', status: 'pass', message: `Скриптов: ${scripts} (внешних: ${externalScripts}, inline: ${inlineScripts})` });
        }

        const stylesheets = $('link[rel="stylesheet"]').length;
        const inlineStyles = $('[style]').length;
        if (stylesheets > 5) {
            checks.push({ item: 'Stylesheets', status: 'warning', message: `Много CSS файлов: ${stylesheets}` });
            score -= 5;
            this.addFix('performance', 'Объединить CSS файлы', 'Объедините все CSS файлы в один', 'Средний');
        } else {
            checks.push({ item: 'Stylesheets', status: 'pass', message: `CSS файлов: ${stylesheets}` });
        }

        const images = $('img').length;
        const lazyImages = $('img[loading="lazy"]').length;
        const imagesWithSrc = $('img[src]').length;
        const imagesWithoutSrc = $('img:not([src])').length;
        if (images > 0 && lazyImages < images / 2) {
            checks.push({ item: 'Lazy Loading', status: 'warning', message: `Lazy loading: ${lazyImages}/${images}` });
            score -= 10;
            this.addIssue('performance', 'medium', 'Не все изображения используют lazy loading', `Только ${lazyImages} из ${images} изображений загружаются лениво.`, 10, true, '15 мин');
            this.addFix('performance', 'Добавить loading="lazy"', 'Добавьте атрибут loading="lazy" ко всем img', 'Средний');
        } else {
            checks.push({ item: 'Lazy Loading', status: 'pass', message: images > 0 ? `Lazy loading: ${lazyImages}/${images}` : 'Нет изображений' });
        }

        if (imagesWithoutSrc > 0) {
            checks.push({ item: 'Images without src', status: 'error', message: `${imagesWithoutSrc} изображений без src` });
            score -= 10;
            this.addIssue('performance', 'medium', 'Изображения без src', `${imagesWithoutSrc} изображений без атрибута src.`, 15, false, '30 мин');
        }

        if (inlineStyles > 20) {
            checks.push({ item: 'Inline Styles', status: 'warning', message: `Inline стилей: ${inlineStyles}` });
            score -= 5;
        } else {
            checks.push({ item: 'Inline Styles', status: 'pass', message: `Inline стилей: ${inlineStyles}` });
        }

        const iframes = $('iframe').length;
        checks.push({ item: 'iFrames', status: iframes > 3 ? 'warning' : 'pass', message: `iFrames: ${iframes}` });
        if (iframes > 3) {
            score -= 5;
            this.addIssue('performance', 'medium', 'Много iFrames', `Найдено ${iframes} iFrames. Они замедляют загрузку страницы.`, 5, true, '20 мин');
        }

        const totalElements = $('*').length;
        checks.push({ item: 'DOM Size', status: totalElements > 1500 ? 'warning' : 'pass', message: `DOM элементов: ${totalElements}` });
        if (totalElements > 1500) {
            score -= 5;
            this.addIssue('performance', 'medium', 'Большой DOM', `${totalElements} DOM элементов. Рекомендуется менее 1500.`, 5, true, '60 мин');
        }

        const forms = $('form').length;
        const inputs = $('input, select, textarea').length;
        checks.push({ item: 'Forms', status: 'pass', message: `Форм: ${forms}, полей: ${inputs}` });

        const buttons = $('button').length;
        const links = $('a').length;
        checks.push({ item: 'Interactive', status: 'pass', message: `Кнопок: ${buttons}, ссылок: ${links}` });

        return { score: Math.max(0, score), checks };
    }

    checkAccessibility($) {
        const checks = [];
        let score = 100;

        const imagesWithoutAlt = $('img:not([alt])').length;
        if (imagesWithoutAlt > 0) {
            checks.push({ item: 'Images Alt', status: 'error', message: `${imagesWithoutAlt} изображений без alt` });
            score -= 20;
            this.addIssue('accessibility', 'high', 'Изображения без alt-тегов', `${imagesWithoutAlt} изображений без атрибута alt. Это важно для скринридеров и SEO.`, 20, true, '20 мин');
            this.addFix('accessibility', 'Добавить alt ко всем изображениям', 'Добавьте описательный alt к каждому img', 'Высокий');
        } else {
            checks.push({ item: 'Images Alt', status: 'pass', message: 'Все изображения с alt' });
        }

        const emptyLinks = $('a').filter(function() {
            return !$(this).text().trim() && !$(this).find('img').length && !$(this).attr('aria-label');
        }).length;
        if (emptyLinks > 0) {
            checks.push({ item: 'Empty Links', status: 'error', message: `${emptyLinks} пустых ссылок` });
            score -= 10;
            this.addIssue('accessibility', 'medium', 'Пустые ссылки', `${emptyLinks} ссылок без текста. Скринридеры не могут их прочитать.`, 10, true, '15 мин');
        } else {
            checks.push({ item: 'Empty Links', status: 'pass', message: 'Нет пустых ссылок' });
        }

        const formInputs = $('input:not([type="hidden"])').length;
        const labeledInputs = $('input[aria-label], input[id]').length;
        if (formInputs > 0 && labeledInputs < formInputs) {
            checks.push({ item: 'Form Labels', status: 'warning', message: 'Не все поля имеют labels' });
            score -= 10;
            this.addIssue('accessibility', 'medium', 'Поля формы без labels', 'Некоторые поля формы не связаны с label.', 10, true, '15 мин');
            this.addFix('accessibility', 'Добавить labels к полям', 'Добавьте <label> или aria-label к каждому полю', 'Средний');
        } else {
            checks.push({ item: 'Form Labels', status: 'pass', message: formInputs > 0 ? 'Поля формы имеют labels' : 'Нет полей формы' });
        }

        const hasViewport = $('meta[name="viewport"]').length > 0;
        checks.push({ item: 'Viewport', status: hasViewport ? 'pass' : 'error', message: hasViewport ? 'Viewport настроен' : 'Viewport отсутствует' });
        if (!hasViewport) {
            score -= 15;
            this.addIssue('accessibility', 'high', 'Viewport meta тег отсутствует', 'Без viewport страница не адаптируется под мобильные устройства.', 15, true, '2 мин');
        }

        const lang = $('html').attr('lang');
        if (!lang) {
            checks.push({ item: 'Language', status: 'error', message: 'Язык не указан' });
            score -= 10;
            this.addIssue('accessibility', 'medium', 'Язык не указан', 'Скринридеры не знают на каком языке читать страницу.', 10, true, '2 мин');
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
        if (ariaElements === 0) this.addIssue('accessibility', 'low', 'Нет ARIA атрибутов', 'ARIA атрибуты улучшают доступность для скринридеров.', 5, true, '30 мин');

        const tabOrder = $('[tabindex]').length;
        checks.push({ item: 'Tab Order', status: tabOrder > 0 ? 'info' : 'pass', message: tabOrder > 0 ? `Tabindex: ${tabOrder}` : 'Нет tabindex' });

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
        const nofollowLinks = [];
        const targetBlankLinks = [];

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            const rel = $(el).attr('rel') || '';
            const target = $(el).attr('target');
            if (!href) return;
            if (href.startsWith('#')) { anchors.push(href); return; }
            if (href.startsWith('mailto:')) { mailtos.push(href); return; }
            if (href.startsWith('tel:')) { telLinks.push(href); return; }
            if (rel.includes('nofollow')) nofollowLinks.push(href);
            if (target === '_blank') targetBlankLinks.push(href);
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
        checks.push({ item: 'Nofollow', status: 'info', message: `Nofollow ссылок: ${nofollowLinks.length}` });
        checks.push({ item: 'Target Blank', status: targetBlankLinks.length > 0 ? 'info' : 'pass', message: `Ссылок с target="_blank": ${targetBlankLinks.length}` });

        if (targetBlankLinks.length > 0 && !nofollowLinks.length) {
            checks.push({ item: 'Security', status: 'warning', message: 'Ссылки с target="_blank" без rel="noopener"' });
            score -= 5;
            this.addIssue('links', 'medium', 'Ссылки с target="_blank" без rel="noopener"', 'Это может быть угрозой безопасности.', 5, true, '10 мин');
        }

        const imgWithoutSrc = $('img:not([src])').length;
        if (imgWithoutSrc > 0) {
            checks.push({ item: 'Broken Images', status: 'error', message: `${imgWithoutSrc} изображений без src` });
            score -= 10;
            this.addIssue('links', 'high', 'Изображения без src', `${imgWithoutSrc} изображений без атрибута src.`, 15, false, '30 мин');
        }

        return { score: Math.max(0, score), checks, internalLinks: internalLinks.slice(0, 20), externalLinks: externalLinks.slice(0, 20) };
    }

    checkMobile($) {
        const checks = [];
        let score = 100;

        const viewport = $('meta[name="viewport"]').attr('content');
        if (!viewport) {
            checks.push({ item: 'Viewport', status: 'error', message: 'Viewport отсутствует' });
            score -= 30;
            this.addIssue('mobile', 'critical', 'Viewport meta тег отсутствует', 'Без viewport страница не адаптируется под мобильные устройства.', 30, true, '2 мин');
            this.addFix('mobile', 'Добавить viewport meta', '<meta name="viewport" content="width=device-width, initial-scale=1">', 'Высокий');
        } else {
            checks.push({ item: 'Viewport', status: 'pass', message: viewport });
        }

        const hasMediaQuery = $('style').text().includes('@media') || $('link[rel="stylesheet"]').length > 0;
        checks.push({ item: 'Responsive CSS', status: hasMediaQuery ? 'pass' : 'warning', message: hasMediaQuery ? 'CSS подключён' : 'Возможно нет адаптивности' });
        if (!hasMediaQuery) {
            score -= 10;
            this.addIssue('mobile', 'medium', 'Возможно отсутствует адаптивный дизайн', 'Не найдены @media запросы в CSS.', 10, true, '60 мин');
        }

        const tapTargets = $('a, button, input, select, textarea').length;
        checks.push({ item: 'Tap Targets', status: 'pass', message: `Интерактивных элементов: ${tapTargets}` });

        const hasTouch = $('[ontouchstart], [onclick]').length;
        checks.push({ item: 'Touch Events', status: 'pass', message: `Touch элементов: ${hasTouch}` });

        if (viewport && viewport.includes('user-scalable=no')) {
            checks.push({ item: 'Zoom', status: 'warning', message: 'Масштабирование отключено' });
            score -= 10;
            this.addIssue('mobile', 'medium', 'Масштабирование отключено', 'Пользователи не могут масштабировать страницу.', 10, true, '2 мин');
        } else {
            checks.push({ item: 'Zoom', status: 'pass', message: 'Масштабирование разрешено' });
        }

        const hasMobileMeta = $('meta[name="mobile-web-app-capable"]').length > 0;
        checks.push({ item: 'Mobile Web App', status: hasMobileMeta ? 'pass' : 'info', message: hasMobileMeta ? 'Mobile Web App настроен' : 'Mobile Web App не настроен' });

        return { score: Math.max(0, score), checks };
    }

    close() {
        this.cache.clear();
    }
}

module.exports = SimpleScanner;
