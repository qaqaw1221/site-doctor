async function linksCheck(page, results, url, siteType = 'regular') {
    const skipThoroughChecks = ['search_engine', 'large_platform', 'social_network'].includes(siteType);
    const baseUrl = new URL(url);
    
    const data = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const currentUrl = window.location.href;
        
        const parseUrl = (href) => {
            try {
                if (href.startsWith('#') || href.startsWith('/')) {
                    return { type: 'relative', href };
                }
                return { type: 'absolute', href };
            } catch {
                return { type: 'invalid', href };
            }
        };

        const linksData = links.map(link => {
            const href = link.href;
            const text = link.textContent.trim();
            const rel = link.rel;
            const target = link.target;
            const isDownload = link.hasAttribute('download');
            
            let linkType = 'internal';
            try {
                if (href.startsWith('http')) {
                    const linkUrl = new URL(href);
                    if (linkUrl.origin !== new URL(currentUrl).origin) {
                        linkType = 'external';
                    }
                } else if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
                    linkType = 'special';
                }
            } catch {
                linkType = 'invalid';
            }

            return {
                href,
                text: text.substring(0, 50),
                rel: rel || null,
                target: target || null,
                download: isDownload,
                type: linkType,
                hasClickHandler: !!link.getAttribute('onclick') || link.style.cursor === 'pointer'
            };
        });

        return {
            total: links.length,
            internal: linksData.filter(l => l.type === 'internal').length,
            external: linksData.filter(l => l.type === 'external').length,
            special: linksData.filter(l => l.type === 'special').length,
            invalid: linksData.filter(l => l.type === 'invalid').length,
            nofollow: linksData.filter(l => l.rel === 'nofollow').length,
            blank: linksData.filter(l => l.target === '_blank').length,
            withoutText: linksData.filter(l => !l.text).length,
            download: linksData.filter(l => l.download).length,
            links: linksData.slice(0, 100)
        };
    });

    const checkedLinks = [];
    const brokenLinks = [];
    
    for (const link of data.links.slice(0, 20)) {
        if (link.type === 'external' || link.type === 'internal') {
            try {
                const response = await page.evaluate(async (href) => {
                    try {
                        const result = await fetch(href, { 
                            method: 'HEAD',
                            mode: 'no-cors'
                        });
                        return { status: result.status || 'ok', ok: true };
                    } catch (e) {
                        return { status: 'error', ok: false, error: e.message };
                    }
                }, link.href);
                
                checkedLinks.push({
                    href: link.href,
                    text: link.text,
                    status: response.ok ? 'ok' : 'broken'
                });
            } catch {
                checkedLinks.push({
                    href: link.href,
                    text: link.text,
                    status: 'error'
                });
            }
        }
    }

    const issues = [];
    let score = 100;

    const noTextLinks = data.withoutText;
    if (noTextLinks > 0) {
        issues.push({
            type: 'links',
            severity: 'low',
            title: 'Ссылки без текста',
            description: `${noTextLinks} ссылок без описательного текста.`,
            impact: 5,
            autoFixable: true,
            fixTime: '10 мин'
        });
        score -= 5;
    }

    const noopenerMissing = data.blank - data.nofollow;
    if (noopenerMissing > 0) {
        issues.push({
            type: 'links',
            severity: 'medium',
            title: 'Внешние ссылки без rel="noopener"',
            description: `${noopenerMissing} внешних ссылок открываются без защиты.`,
            impact: 15,
            autoFixable: true,
            fixTime: '10 мин'
        });
        score -= 10;
    }

    if (data.invalid > 0) {
        issues.push({
            type: 'links',
            severity: 'high',
            title: 'Некорректные URL',
            description: `${data.invalid} ссылок с невалидными URL.`,
            impact: 20,
            autoFixable: false,
            fixTime: '20 мин'
        });
        score -= 15;
    }

    results.issues.push(...issues);
    results.links = {
        score: Math.max(0, score),
        ...data,
        checked: checkedLinks,
        baseDomain: baseUrl.origin
    };
}

module.exports = linksCheck;
