async function generateFixes(page, data) {
    const fixes = [];
    
    const url = data?.url || await page.url();
    
    const fixRules = [
        {
            id: 'add_meta_viewport',
            check: () => !data?.seo?.viewport,
            generate: async () => ({
                type: 'add',
                tag: 'meta',
                attributes: {
                    name: 'viewport',
                    content: 'width=device-width, initial-scale=1'
                },
                location: 'head',
                description: 'Добавить meta viewport для мобильных устройств',
                impact: 'Высокое',
                category: 'mobile'
            })
        },
        {
            id: 'add_meta_description',
            check: () => !data?.seo?.description,
            generate: async () => {
                const description = data?.seo?.title || 'Описание страницы';
                return {
                    type: 'add',
                    tag: 'meta',
                    attributes: {
                        name: 'description',
                        content: description.substring(0, 160)
                    },
                    location: 'head',
                    description: 'Добавить meta description для поисковых систем',
                    impact: 'Высокое',
                    category: 'seo'
                };
            }
        },
        {
            id: 'add_canonical',
            check: () => !data?.seo?.hasCanonical,
            generate: async () => ({
                type: 'add',
                tag: 'link',
                attributes: {
                    rel: 'canonical',
                    href: url
                },
                location: 'head',
                description: 'Добавить canonical URL для предотвращения дублирования контента',
                impact: 'Среднее',
                category: 'seo'
            })
        },
        {
            id: 'add_og_tags',
            check: () => !data?.seo?.ogTitle && !data?.seo?.ogDescription,
            generate: async () => {
                const title = data?.seo?.title || 'Заголовок страницы';
                return [
                    {
                        type: 'add',
                        tag: 'meta',
                        attributes: { property: 'og:title', content: title },
                        location: 'head',
                        description: 'Добавить Open Graph тег og:title',
                        impact: 'Среднее',
                        category: 'social'
                    },
                    {
                        type: 'add',
                        tag: 'meta',
                        attributes: { property: 'og:description', content: title.substring(0, 200) },
                        location: 'head',
                        description: 'Добавить Open Graph тег og:description',
                        impact: 'Среднее',
                        category: 'social'
                    },
                    {
                        type: 'add',
                        tag: 'meta',
                        attributes: { property: 'og:type', content: 'website' },
                        location: 'head',
                        description: 'Добавить Open Graph тег og:type',
                        impact: 'Низкое',
                        category: 'social'
                    }
                ];
            }
        },
        {
            id: 'add_twitter_tags',
            check: () => !data?.seo?.twitterCard,
            generate: async () => {
                const title = data?.seo?.title || 'Заголовок страницы';
                return {
                    type: 'add',
                    tag: 'meta',
                    attributes: { name: 'twitter:card', content: 'summary_large_image' },
                    location: 'head',
                    description: 'Добавить Twitter Card тег',
                    impact: 'Низкое',
                    category: 'social'
                };
            }
        },
        {
            id: 'add_schema_basic',
            check: () => true,
            generate: async () => {
                const title = data?.seo?.title || 'Страница';
                return {
                    type: 'add',
                    tag: 'script',
                    attributes: { type: 'application/ld+json' },
                    location: 'head',
                    content: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        "name": title,
                        "description": data?.seo?.description || '',
                        "url": url
                    }),
                    description: 'Добавить базовый Schema.org markup',
                    impact: 'Среднее',
                    category: 'seo'
                };
            }
        }
    ];
    
    const pageData = await page.evaluate(() => {
        const getMeta = (name) => {
            const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
            return el ? el.content : null;
        };
        
        const getFirstParagraph = () => {
            const p = document.querySelector('p');
            return p ? p.textContent.trim().substring(0, 200) : null;
        };
        
        const getH1 = () => {
            const h1 = document.querySelector('h1');
            return h1 ? h1.textContent.trim() : null;
        };
        
        const images = Array.from(document.querySelectorAll('img'));
        const imagesWithoutAlt = images
            .filter(img => !img.alt || img.alt.trim() === '')
            .slice(0, 10);
        
        const imagesWithoutLazy = images
            .filter(img => !img.loading || img.loading !== 'lazy')
            .slice(0, 10);
        
        return {
            title: document.title,
            description: getMeta('description'),
            h1: getH1(),
            firstParagraph: getFirstParagraph(),
            viewport: getMeta('viewport'),
            canonical: document.querySelector('link[rel="canonical"]')?.href,
            ogTitle: getMeta('og:title'),
            ogDescription: getMeta('og:description'),
            twitterCard: getMeta('twitter:card'),
            imagesWithoutAlt: imagesWithoutAlt.map((img, i) => ({
                selector: i === 0 ? 'img:first-of-type' : `img:nth-of-type(${i + 1})`,
                src: img.src,
                suggestedAlt: img.src.split('/').pop().replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '') || `Изображение ${i + 1}`
            })),
            imagesWithoutLazy: imagesWithoutLazy.map((img, i) => ({
                selector: i === 0 ? 'img:first-of-type' : `img:nth-of-type(${i + 1})`,
                src: img.src
            }))
        };
    });
    
    for (const rule of fixRules) {
        if (rule.check()) {
            try {
                const result = await rule.generate();
                if (Array.isArray(result)) {
                    fixes.push(...result);
                } else if (result) {
                    fixes.push(result);
                }
            } catch (e) {
                console.error(`Error generating fix for rule ${rule.id}:`, e);
            }
        }
    }
    
    if (pageData.imagesWithoutAlt.length > 0) {
        for (const img of pageData.imagesWithoutAlt) {
            fixes.push({
                type: 'add',
                attribute: 'alt',
                selector: img.selector,
                value: img.suggestedAlt,
                description: `Добавить alt="${img.suggestedAlt}" к изображению`,
                impact: 'Высокое',
                category: 'accessibility',
                preview: `alt="${img.suggestedAlt}"`
            });
        }
    }
    
    if (pageData.imagesWithoutLazy.length > 0) {
        for (const img of pageData.imagesWithoutLazy) {
            fixes.push({
                type: 'add',
                attribute: 'loading',
                selector: img.selector,
                value: 'lazy',
                description: 'Добавить loading="lazy" для отложенной загрузки',
                impact: 'Среднее',
                category: 'performance',
                preview: `loading="lazy"`
            });
        }
    }
    
    if (pageData.title && pageData.title.length > 70) {
        fixes.push({
            type: 'trim',
            tag: 'title',
            currentValue: pageData.title,
            newValue: pageData.title.substring(0, 60) + '...',
            description: 'Обрезать title до 60 символов для корректного отображения в поиске',
            impact: 'Среднее',
            category: 'seo',
            preview: pageData.title.substring(0, 60) + '...'
        });
    }
    
    const scoreByCategory = {};
    for (const fix of fixes) {
        if (!scoreByCategory[fix.category]) {
            scoreByCategory[fix.category] = { count: 0, impact: 0 };
        }
        scoreByCategory[fix.category].count++;
        const impactMap = { 'Высокое': 3, 'Среднее': 2, 'Низкое': 1 };
        scoreByCategory[fix.category].impact += impactMap[fix.impact] || 1;
    }
    
    const totalImpact = fixes.reduce((sum, f) => {
        const impactMap = { 'Высокое': 3, 'Среднее': 2, 'Низкое': 1 };
        return sum + (impactMap[f.impact] || 0);
    }, 0);
    
    return {
        canFix: fixes.length > 0,
        totalFixes: fixes.length,
        fixesByCategory: scoreByCategory,
        potentialScoreIncrease: Math.min(totalImpact * 3, 25),
        fixes: fixes.map((fix, index) => ({
            id: `fix_${index}`,
            ...fix
        })),
        recommendations: generateRecommendations(fixes, pageData)
    };
}

function generateRecommendations(fixes, pageData) {
    const recommendations = [];
    
    const hasSeoFixes = fixes.some(f => f.category === 'seo');
    if (hasSeoFixes) {
        recommendations.push({
            priority: 'high',
            title: 'SEO оптимизация',
            description: 'Добавление мета-тегов улучшит индексацию сайта поисковыми системами и повысит CTR в выдаче.'
        });
    }
    
    const hasAccessibilityFixes = fixes.some(f => f.category === 'accessibility');
    if (hasAccessibilityFixes) {
        recommendations.push({
            priority: 'medium',
            title: 'Доступность (a11y)',
            description: 'Alt-теги делают сайт доступным для пользователей с ограниченными возможностями и улучшают SEO.'
        });
    }
    
    const hasPerformanceFixes = fixes.some(f => f.category === 'performance');
    if (hasPerformanceFixes) {
        recommendations.push({
            priority: 'medium',
            title: 'Производительность',
            description: 'Отложенная загрузка изображений ускорит первую отрисовку страницы.'
        });
    }
    
    return recommendations;
}

function applyFixes(code, selectedFixes) {
    let modifiedCode = code;
    
    for (const fix of selectedFixes) {
        if (fix.type === 'add') {
            if (fix.tag) {
                const tag = fix.tag;
                const attrs = Object.entries(fix.attributes || {})
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(' ');
                
                const newTag = `<${tag} ${attrs}${fix.content ? `>${fix.content}</${tag}>` : ' />'}`;
                
                if (fix.location === 'head') {
                    const headMatch = modifiedCode.match(/<head[^>]*>([\s\S]*)<\/head>/i);
                    if (headMatch) {
                        modifiedCode = modifiedCode.replace(
                            headMatch[0],
                            headMatch[0].replace('</head>', `${newTag}\n</head>`)
                        );
                    }
                }
            } else if (fix.attribute && fix.selector && fix.value) {
                const selectorParts = fix.selector.split(':');
                const tagName = selectorParts[0];
                
                const regex = new RegExp(`<${tagName}([^>]*)>`, 'i');
                const match = modifiedCode.match(regex);
                
                if (match) {
                    const openingTag = match[0];
                    if (!openingTag.includes(`${fix.attribute}=`)) {
                        modifiedCode = modifiedCode.replace(
                            openingTag,
                            openingTag.replace('>', ` ${fix.attribute}="${fix.value}">`)
                        );
                    }
                }
            }
        } else if (fix.type === 'trim' && fix.tag === 'title') {
            modifiedCode = modifiedCode.replace(
                /<title[^>]*>[\s\S]*?<\/title>/i,
                `<title>${fix.newValue}</title>`
            );
        }
    }
    
    return modifiedCode;
}

module.exports = {
    generateFixes,
    applyFixes
};
