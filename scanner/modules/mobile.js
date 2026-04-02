async function mobileCheck(page, results, siteType = 'regular') {
    const skipThoroughChecks = ['search_engine', 'large_platform', 'social_network'].includes(siteType);
    const desktopData = await page.evaluate(() => {
        return {
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
            viewportContent: document.querySelector('meta[name="viewport"]')?.content || null
        };
    });

    await page.setViewport({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    const mobileData = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        
        const getOverflow = (el) => getComputedStyle(el).overflow;
        
        let horizontalOverflow = false;
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const rect = el.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                horizontalOverflow = true;
                break;
            }
        }

        const fonts = new Set();
        document.querySelectorAll('*').forEach(el => {
            const font = getComputedStyle(el).fontFamily;
            if (font) fonts.add(font);
        });

        const touchTargets = Array.from(document.querySelectorAll('a, button, input, select, textarea, [onclick], [tabindex]'));
        const smallTouchTargets = touchTargets.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && (rect.width < 48 || rect.height < 48);
        });

        const fixedElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const style = getComputedStyle(el);
            return style.position === 'fixed' || style.position === 'sticky';
        });

        const interactive = Array.from(document.querySelectorAll('button, a, input, select, textarea'));
        const withoutZoomBlock = interactive.filter(el => {
            const style = getComputedStyle(el);
            return style.fontSize && parseFloat(style.fontSize) < 16;
        });

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
        const manifest = document.querySelector('link[rel="manifest"]');

        return {
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            horizontalOverflow,
            fonts: Array.from(fonts).slice(0, 10),
            touchTargets: {
                total: touchTargets.length,
                small: smallTouchTargets.length,
                smallTargets: smallTouchTargets.slice(0, 5).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    width: Math.round(el.getBoundingClientRect().width),
                    height: Math.round(el.getBoundingClientRect().height)
                }))
            },
            fixedElements: fixedElements.length,
            withoutZoomBlock: withoutZoomBlock.length,
            pwa: {
                themeColor: !!metaThemeColor,
                appleTouchIcon: !!appleTouchIcon,
                manifest: !!manifest
            }
        };
    });

    await page.setViewport({ width: 1920, height: 1080 });

    const issues = [];
    let score = 100;

    if (!desktopData.hasViewportMeta && !skipThoroughChecks) {
        issues.push({
            type: 'mobile',
            severity: 'high',
            title: 'Отсутствует viewport meta',
            description: 'Нет мета-тега viewport. Страница не адаптируется под мобильные.',
            impact: 20,
            autoFixable: true,
            fixTime: '2 мин'
        });
        score -= 20;
    }

    if (mobileData.horizontalOverflow && !skipThoroughChecks) {
        issues.push({
            type: 'mobile',
            severity: 'medium',
            title: 'Горизонтальная прокрутка',
            description: 'На мобильных появляется горизонтальная прокрутка. Проблема с адаптивностью.',
            impact: 15,
            autoFixable: false,
            fixTime: '1 час'
        });
        score -= 10;
    }

    if (mobileData.touchTargets.small > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'mobile',
            severity: 'low',
            title: 'Маленькие touch-элементы',
            description: `${mobileData.touchTargets.small} элементов меньше 48x48px. Сложно нажимать пальцем.`,
            impact: 10,
            autoFixable: true,
            fixTime: '20 мин'
        });
        score -= 5;
    }

    if (mobileData.withoutZoomBlock > 0 && !skipThoroughChecks) {
        issues.push({
            type: 'mobile',
            severity: 'low',
            title: 'Мелкий шрифт в инпутах',
            description: `${mobileData.withoutZoomBlock} инпутов с шрифтом < 16px. Браузер может зумить.`,
            impact: 5,
            autoFixable: true,
            fixTime: '5 мин'
        });
        score -= 5;
    }

    if (mobileData.fixedElements > 5 && !skipThoroughChecks) {
        issues.push({
            type: 'mobile',
            severity: 'low',
            title: 'Много fixed/sticky элементов',
            description: `${mobileData.fixedElements} fixed/sticky элементов. Может перекрывать контент.`,
            impact: 5,
            autoFixable: false,
            fixTime: '30 мин'
        });
        score -= 5;
    }

    const pwaScore = (mobileData.pwa.themeColor ? 1 : 0) + 
                     (mobileData.pwa.appleTouchIcon ? 1 : 0) + 
                     (mobileData.pwa.manifest ? 1 : 0);
    
    if (pwaScore === 0 && !skipThoroughChecks) {
        issues.push({
            type: 'mobile',
            severity: 'low',
            title: 'Недостаточно PWA-мета-тегов',
            description: 'Рекомендуется добавить theme-color, apple-touch-icon, manifest.',
            impact: 5,
            autoFixable: true,
            fixTime: '15 мин'
        });
        score -= 5;
    }

    results.issues.push(...issues);
    results.mobile = {
        score: Math.max(0, score),
        desktop: desktopData,
        mobile: mobileData,
        recommendations: [
            'Используйте media-запросы для адаптивной вёрстки',
            'Убедитесь, что touch-элементы >= 48x48px',
            'Добавьте PWA-манифест для установки на устройства'
        ]
    };
}

module.exports = mobileCheck;
