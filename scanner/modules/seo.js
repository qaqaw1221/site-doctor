async function seoCheck(page, results, siteType = 'regular') {
    const skipThoroughChecks = ['search_engine', 'large_platform', 'social_network'].includes(siteType);
    const data = await page.evaluate(() => {
        const getMeta = (name) => {
            const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
            return el ? el.content : null;
        };

        const getLink = (rel) => {
            const el = document.querySelector(`link[rel="${rel}"]`);
            return el ? el.href : null;
        };

        const images = Array.from(document.querySelectorAll('img'));
        const visibleImages = images.filter(img => {
            const rect = img.getBoundingClientRect();
            return rect.width > 1 && rect.height > 1 && getComputedStyle(img).display !== 'none';
        });

        const headings = {};
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
            const els = document.querySelectorAll(tag);
            headings[tag] = Array.from(els)
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    const text = el.textContent.trim();
                    return rect.width > 0 && rect.height > 0 && text.length > 0;
                })
                .map(el => el.textContent.trim().substring(0, 100));
        });

        const links = Array.from(document.querySelectorAll('a[href]'));
        const internalLinks = links.filter(a => {
            const href = a.href;
            return href.startsWith(window.location.origin) || href.startsWith('/') || href.startsWith('#');
        });
        const externalLinks = links.length - internalLinks.length;

        return {
            title: document.title,
            description: getMeta('description'),
            keywords: getMeta('keywords'),
            author: getMeta('author'),
            robots: getMeta('robots'),
            canonical: getLink('canonical'),
            viewport: getMeta('viewport'),
            charset: document.querySelector('meta[charset]')?.charset || 
                     document.querySelector('meta[http-equiv="Content-Type"]')?.content,
            
            ogTitle: getMeta('og:title'),
            ogDescription: getMeta('og:description'),
            ogImage: getMeta('og:image'),
            ogType: getMeta('og:type'),
            ogUrl: getMeta('og:url'),
            
            twitterCard: getMeta('twitter:card'),
            twitterTitle: getMeta('twitter:title'),
            twitterDescription: getMeta('twitter:description'),
            twitterImage: getMeta('twitter:image'),
            
            images: {
                total: visibleImages.length,
                withoutAlt: visibleImages.filter(img => !img.alt || img.alt.trim() === '').length,
                withoutSrc: images.filter(img => !img.src || img.src.trim() === '').length
            },
            
            headings,
            headingsCount: {
                h1: headings.h1.length,
                h2: headings.h2.length,
                h3: headings.h3.length
            },
            
            links: {
                total: links.length,
                internal: internalLinks.length,
                external: externalLinks
            }
        };
    });

    const issues = [];
    let score = 100;

    if (!data.title || data.title.trim() === '') {
        issues.push({
            type: 'seo',
            severity: skipThoroughChecks ? 'low' : 'critical',
            title: 'Отсутствует заголовок страницы',
            description: 'Тег <title> отсутствует или пуст. Это критично для SEO.',
            impact: skipThoroughChecks ? 5 : 30,
            autoFixable: true,
            fixTime: '2 мин'
        });
        score -= skipThoroughChecks ? 5 : 30;
    } else if (data.title.length < 10) {
        if (!skipThoroughChecks) {
            issues.push({
                type: 'seo',
                severity: 'medium',
                title: 'Слишком короткий заголовок',
                description: `Длина заголовка ${data.title.length} символов. Рекомендуется 30-60 символов.`,
                impact: 15,
                autoFixable: true,
                fixTime: '5 мин'
            });
            score -= 15;
        }
    } else if (data.title.length > 70 && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'low',
            title: 'Слишком длинный заголовок',
            description: `Длина заголовка ${data.title.length} символов. Будет обрезан в поисковой выдаче.`,
            impact: 5,
            autoFixable: true,
            fixTime: '5 мин'
        });
        score -= 5;
    }

    if (!data.description && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'high',
            title: 'Отсутствует meta description',
            description: 'Мета-тег description отсутствует. Важно для SEO и сниппетов в поиске.',
            impact: 25,
            autoFixable: true,
            fixTime: '5 мин'
        });
        score -= 20;
    } else if (data.description && (data.description.length < 50 || data.description.length > 160)) {
        if (!skipThoroughChecks) {
            issues.push({
                type: 'seo',
                severity: 'low',
                title: 'Некорректная длина description',
                description: `Длина ${data.description.length} символов. Оптимально: 50-160.`,
                impact: 10,
                autoFixable: true,
                fixTime: '5 мин'
            });
            score -= 10;
        }
    }

    if (data.headings.h1.length === 0 && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'high',
            title: 'Отсутствует заголовок H1',
            description: 'На странице нет видимого тега h1. Важно для структуры контента.',
            impact: 20,
            autoFixable: true,
            fixTime: '10 мин'
        });
        score -= 15;
    } else if (data.headings.h1.length > 1 && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'medium',
            title: 'Несколько заголовков H1',
            description: `На странице ${data.headings.h1.length} тегов h1. Рекомендуется один.`,
            impact: 10,
            autoFixable: true,
            fixTime: '15 мин'
        });
        score -= 10;
    }

    if (data.images.total > 0 && data.images.withoutAlt > 0 && !skipThoroughChecks) {
        const percent = Math.round((data.images.withoutAlt / data.images.total) * 100);
        if (percent > 30) {
            issues.push({
                type: 'seo',
                severity: percent > 70 ? 'high' : 'medium',
                title: 'Изображения без alt-тегов',
                description: `${data.images.withoutAlt} из ${data.images.total} изображений (${percent}%) без атрибута alt.`,
                impact: percent > 70 ? 20 : 10,
                autoFixable: true,
                fixTime: '20 мин'
            });
            score -= percent > 70 ? 15 : 5;
        }
    }

    if (data.images.withoutSrc > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'medium',
            title: 'Изображения без src',
            description: `${data.images.withoutSrc} изображений без атрибута src.`,
            impact: 15,
            autoFixable: false,
            fixTime: '30 мин'
        });
        score -= 10;
    }

    if (!data.canonical && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'low',
            title: 'Отсутствует canonical URL',
            description: 'Нет тега canonical. Может привести к дублированию контента.',
            impact: 5,
            autoFixable: true,
            fixTime: '5 мин'
        });
        score -= 5;
    }

    if (!data.viewport) {
        issues.push({
            type: 'seo',
            severity: skipThoroughChecks ? 'medium' : 'high',
            title: 'Отсутствует viewport',
            description: 'Нет meta viewport. Страница некорректно отображается на мобильных.',
            impact: skipThoroughChecks ? 10 : 20,
            autoFixable: true,
            fixTime: '2 мин'
        });
        score -= skipThoroughChecks ? 10 : 15;
    }

    const hasOG = data.ogTitle && data.ogDescription && data.ogImage;
    if (!hasOG && !skipThoroughChecks) {
        issues.push({
            type: 'seo',
            severity: 'low',
            title: 'Отсутствуют Open Graph теги',
            description: 'Нет тегов og:title, og:description или og:image. Страница хуже шарится в соцсетях.',
            impact: 10,
            autoFixable: true,
            fixTime: '10 мин'
        });
        score -= 5;
    }

    results.issues.push(...issues);
    results.seo = {
        score: Math.max(0, score),
        ...data
    };
}

module.exports = seoCheck;
