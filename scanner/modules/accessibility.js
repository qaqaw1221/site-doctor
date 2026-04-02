async function accessibilityCheck(page, results, siteType = 'regular') {
    const skipThoroughChecks = ['search_engine', 'large_platform', 'social_network'].includes(siteType);
    const data = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        
        const getContrast = (el) => {
            const style = getComputedStyle(el);
            const bg = style.backgroundColor;
            const color = style.color;
            
            const parseRGB = (rgb) => {
                const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    return {
                        r: parseInt(match[1]),
                        g: parseInt(match[2]),
                        b: parseInt(match[3])
                    };
                }
                return { r: 255, g: 255, b: 255 };
            };

            const luminance = (c) => {
                const [r, g, b] = [c.r, c.g, c.b].map(v => {
                    v /= 255;
                    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };

            const bgColor = parseRGB(bg);
            const fgColor = parseRGB(color);
            
            const l1 = luminance(bgColor);
            const l2 = luminance(fgColor);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            
            return Math.round(ratio * 10) / 10;
        };

        const buttons = Array.from(document.querySelectorAll('button'));
        const links = Array.from(document.querySelectorAll('a'));
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        const images = Array.from(document.querySelectorAll('img'));
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));

        const lowContrastElements = [];
        
        document.querySelectorAll('p, span, a, button, h1, h2, h3, h4, h5, h6, li').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && el.textContent.trim()) {
                const contrast = getContrast(el);
                if (contrast < 4.5) {
                    lowContrastElements.push({
                        tag: el.tagName.toLowerCase(),
                        text: el.textContent.trim().substring(0, 50),
                        contrast,
                        selectors: el.className ? `.${el.className.split(' ').join('.')}` : ''
                    });
                }
            }
        });

        const buttonsWithoutText = buttons.filter(btn => {
            const hasText = btn.textContent.trim().length > 0;
            const hasAriaLabel = btn.getAttribute('aria-label') || btn.getAttribute('aria-labelledby');
            const hasIcon = btn.querySelector('img, svg, [role="img"]');
            return !hasText && !hasAriaLabel && !hasIcon;
        });

        const linksWithoutText = links.filter(a => {
            const hasText = a.textContent.trim().length > 0;
            const hasAriaLabel = a.getAttribute('aria-label') || a.getAttribute('aria-labelledby');
            return !hasText && !hasAriaLabel;
        });

        const inputsWithoutLabel = inputs.filter(input => {
            if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return false;
            const hasLabel = input.id && document.querySelector(`label[for="${input.id}"]`);
            const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            const hasPlaceholder = input.placeholder && !hasLabel;
            return !hasLabel && !hasAriaLabel;
        });

        const imagesWithoutAlt = images.filter(img => {
            const rect = img.getBoundingClientRect();
            return rect.width > 1 && rect.height > 1 && (!img.alt || img.alt.trim() === '');
        });

        const tabIndexIssues = Array.from(document.querySelectorAll('[tabindex="-1"]'));
        
        const skipLink = document.querySelector('a[href="#main"], a[href="#content"], .skip-link');

        return {
            buttons: {
                total: buttons.length,
                withoutText: buttonsWithoutText.length,
                list: buttonsWithoutText.map(b => b.className || b.id || 'unnamed')
            },
            links: {
                total: links.length,
                withoutText: linksWithoutText.length
            },
            inputs: {
                total: inputs.length,
                withoutLabel: inputsWithoutLabel.length,
                list: inputsWithoutLabel.map(i => i.id || i.name || i.type || 'unnamed')
            },
            images: {
                total: images.length,
                withoutAlt: imagesWithoutAlt.length
            },
            lowContrast: {
                total: lowContrastElements.length,
                issues: lowContrastElements.slice(0, 10)
            },
            skipLink: !!skipLink,
            headings: {
                total: headings.length,
                hierarchy: headings.map(h => h.tagName)
            },
            lang: document.documentElement.lang || null,
            metaViewport: !!document.querySelector('meta[name="viewport"]')
        };
    });

    const issues = [];
    let score = 100;

    if (data.images.withoutAlt > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'accessibility',
            severity: 'medium',
            title: 'Изображения без alt-текста',
            description: `${data.images.withoutAlt} изображений без атрибута alt. Недоступно для скринридеров.`,
            impact: 10,
            autoFixable: true,
            fixTime: '20 мин'
        });
        score -= 10;
    }

    if (data.buttons.withoutText > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'accessibility',
            severity: 'low',
            title: 'Кнопки без текста',
            description: `${data.buttons.withoutText} кнопок без текста или aria-label.`,
            impact: 10,
            autoFixable: true,
            fixTime: '15 мин'
        });
        score -= 5;
    }

    if (data.inputs.withoutLabel > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'accessibility',
            severity: 'medium',
            title: 'Поля без подписей',
            description: `${data.inputs.withoutLabel} полей ввода без label или aria-label.`,
            impact: 10,
            autoFixable: true,
            fixTime: '20 мин'
        });
        score -= 10;
    }

    if (data.lowContrast.total > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'accessibility',
            severity: 'low',
            title: 'Низкий контраст текста',
            description: `${data.lowContrast.total} элементов с контрастом менее 4.5:1.`,
            impact: 10,
            autoFixable: true,
            fixTime: '30 мин'
        });
        score -= 5;
        score -= 10;
    }

    if (data.links.withoutText > 0) {
        issues.push({
            type: 'accessibility',
            severity: 'low',
            title: 'Ссылки без текста',
            description: `${data.links.withoutText} ссылок без текста.`,
            impact: 10,
            autoFixable: true,
            fixTime: '10 мин'
        });
        score -= 5;
    }

    if (!data.lang) {
        issues.push({
            type: 'accessibility',
            severity: 'medium',
            title: 'Не указан язык страницы',
            description: 'Отсутствует атрибут lang у <html>.',
            impact: 15,
            autoFixable: true,
            fixTime: '2 мин'
        });
        score -= 10;
    }

    if (!data.skipLink) {
        issues.push({
            type: 'accessibility',
            severity: 'low',
            title: 'Нет скип-ссылки',
            description: 'Отсутствует ссылка для пропуска навигации.',
            impact: 5,
            autoFixable: true,
            fixTime: '10 мин'
        });
        score -= 5;
    }

    results.issues.push(...issues);
    results.accessibility = {
        score: Math.max(0, score),
        ...data
    };
}

module.exports = accessibilityCheck;
