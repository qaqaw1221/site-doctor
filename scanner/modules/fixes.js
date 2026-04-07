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
                description: 'Добавить meta viewport для корректного отображения на мобильных устройствах',
                impact: 'Высокое',
                impactScore: 10,
                category: 'mobile',
                code: '<meta name="viewport" content="width=device-width, initial-scale=1">'
            })
        },
        {
            id: 'add_meta_description',
            check: () => !data?.seo?.description,
            generate: async () => {
                const h1Text = await page.evaluate(() => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.textContent.trim().substring(0, 155) : 'Описание страницы';
                });
                return {
                    type: 'add',
                    tag: 'meta',
                    attributes: {
                        name: 'description',
                        content: h1Text
                    },
                    location: 'head',
                    description: 'Meta description помогает поисковым системам понимать содержание страницы и улучшает CTR в выдаче',
                    impact: 'Высокое',
                    impactScore: 12,
                    category: 'seo',
                    code: `<meta name="description" content="${h1Text}">`
                };
            }
        },
        {
            id: 'add_canonical',
            check: () => !data?.seo?.canonical,
            generate: async () => ({
                type: 'add',
                tag: 'link',
                attributes: {
                    rel: 'canonical',
                    href: url
                },
                location: 'head',
                description: 'Canonical URL указывает поисковикам главную версию страницы, предотвращая проблемы с дублированием контента',
                impact: 'Среднее',
                impactScore: 6,
                category: 'seo',
                code: `<link rel="canonical" href="${url}">`
            })
        },
        {
            id: 'add_og_tags',
            check: () => !data?.seo?.ogTitle && !data?.seo?.ogDescription,
            generate: async () => {
                const title = data?.seo?.title || 'Заголовок страницы';
                const description = data?.seo?.description || title;
                return [
                    {
                        type: 'add',
                        tag: 'meta',
                        attributes: { property: 'og:title', content: title },
                        location: 'head',
                        description: 'Open Graph тег для красивого превью при шаринге в соцсетях',
                        impact: 'Среднее',
                        impactScore: 4,
                        category: 'social',
                        code: `<meta property="og:title" content="${title}">`
                    },
                    {
                        type: 'add',
                        tag: 'meta',
                        attributes: { property: 'og:description', content: description.substring(0, 200) },
                        location: 'head',
                        description: 'Описание для превью в Facebook, VK, Telegram',
                        impact: 'Среднее',
                        impactScore: 4,
                        category: 'social',
                        code: `<meta property="og:description" content="${description.substring(0, 200)}">`
                    },
                    {
                        type: 'add',
                        tag: 'meta',
                        attributes: { property: 'og:type', content: 'website' },
                        location: 'head',
                        description: 'Тип контента для корректного отображения',
                        impact: 'Низкое',
                        impactScore: 2,
                        category: 'social',
                        code: '<meta property="og:type" content="website">'
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
                    description: 'Twitter Card для красивых ссылок при ретвите',
                    impact: 'Низкое',
                    impactScore: 2,
                    category: 'social',
                    code: '<meta name="twitter:card" content="summary_large_image">'
                };
            }
        },
        {
            id: 'add_schema_basic',
            check: () => !data?.seo?.hasSchema,
            generate: async () => {
                const title = data?.seo?.title || 'Страница';
                const description = data?.seo?.description || '';
                return {
                    type: 'add',
                    tag: 'script',
                    attributes: { type: 'application/ld+json' },
                    location: 'head',
                    content: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        "name": title,
                        "description": description,
                        "url": url
                    }, null, 2),
                    description: 'Schema.org разметка помогает Google лучше понимать контент и может улучшить сниппеты в выдаче',
                    impact: 'Среднее',
                    impactScore: 5,
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
            const p = document.querySelector('article p, main p, .content p, p');
            return p ? p.textContent.trim().substring(0, 200) : null;
        };
        
        const getH1 = () => {
            const h1 = document.querySelector('h1');
            return h1 ? h1.textContent.trim() : null;
        };
        
        const images = Array.from(document.querySelectorAll('img'));
        
        const getImageSelector = (img) => {
            if (img.id) return `#${img.id}`;
            const parent = img.parentElement;
            if (parent?.id) return `#${parent.id} img`;
            if (parent?.className && parent.className.includes(' ')) {
                const classes = parent.className.split(' ').filter(c => c && !c.includes('img')).join('.');
                if (classes) return `.${classes} img`;
            }
            return `img[src="${img.src.substring(0, 50)}..."]`;
        };
        
        const imagesWithoutAlt = images
            .filter(img => {
                const rect = img.getBoundingClientRect();
                return (!img.alt || img.alt.trim() === '') && rect.width > 10 && rect.height > 10;
            })
            .slice(0, 5);
        
        const imagesAboveFold = images
            .filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.top < window.innerHeight && rect.width > 50 && rect.height > 50;
            })
            .filter(img => !img.loading || img.loading !== 'lazy')
            .slice(0, 3);
        
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
            hasSchema: document.querySelector('script[type="application/ld+json"]') !== null,
            imagesWithoutAlt: imagesWithoutAlt.map((img, i) => {
                const altText = img.src.split('/').pop()
                    .replace(/[-_]/g, ' ')
                    .replace(/\.[^.]+$/, '')
                    .replace(/[0-9]/g, '')
                    .trim() || `Изображение ${i + 1}`;
                return {
                    selector: getImageSelector(img),
                    src: img.src.substring(0, 80) + (img.src.length > 80 ? '...' : ''),
                    suggestedAlt: altText.charAt(0).toUpperCase() + altText.slice(1),
                    priority: i === 0 ? 'high' : 'medium'
                };
            }),
            imagesWithoutLazy: imagesAboveFold.map((img, i) => ({
                selector: getImageSelector(img),
                src: img.src.substring(0, 80) + (img.src.length > 80 ? '...' : ''),
                priority: 'high'
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
                description: `Добавить alt="${img.suggestedAlt}" к изображению (приоритет: ${img.priority === 'high' ? 'высокий' : 'средний'})`,
                impact: img.priority === 'high' ? 'Высокое' : 'Среднее',
                impactScore: img.priority === 'high' ? 6 : 4,
                category: 'accessibility',
                preview: `alt="${img.suggestedAlt}"`,
                code: `alt="${img.suggestedAlt}"`
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
                description: 'Добавить loading="lazy" - ускорит загрузку страницы на 30-50%',
                impact: 'Среднее',
                impactScore: 5,
                category: 'performance',
                preview: `loading="lazy"`,
                code: `loading="lazy"`
            });
        }
    }
    
    if (pageData.title && pageData.title.length > 70) {
        fixes.push({
            type: 'trim',
            tag: 'title',
            currentValue: pageData.title,
            newValue: pageData.title.substring(0, 60).trim() + '...',
            description: 'Обрезать title до 60 символов - Google обрезает длинные title в выдаче',
            impact: 'Среднее',
            impactScore: 4,
            category: 'seo',
            preview: pageData.title.substring(0, 60).trim() + '...'
        });
    }
    
    const scoreByCategory = {};
    for (const fix of fixes) {
        if (!scoreByCategory[fix.category]) {
            scoreByCategory[fix.category] = { count: 0, impact: 0 };
        }
        scoreByCategory[fix.category].count++;
        scoreByCategory[fix.category].impact += fix.impactScore || 2;
    }
    
    const totalImpact = fixes.reduce((sum, f) => sum + (f.impactScore || 2), 0);
    
    return {
        canFix: fixes.length > 0,
        totalFixes: fixes.length,
        fixesByCategory: scoreByCategory,
        potentialScoreIncrease: Math.min(totalImpact * 1.5, 30),
        fixes: fixes.map((fix, index) => ({
            id: `fix_${index}`,
            ...fix
        })),
        recommendations: generateRecommendations(fixes, pageData)
    };
}

function generateRecommendations(fixes, pageData) {
    const recommendations = [];
    
    const seoFixes = fixes.filter(f => f.category === 'seo');
    if (seoFixes.length > 0) {
        recommendations.push({
            priority: 'high',
            title: 'SEO оптимизация',
            description: `${seoFixes.length} изменений для улучшения поисковой выдачи. Мета-теги помогают Google понимать контент и повышают кликабельность в результатах поиска.`,
            potentialGain: `${seoFixes.reduce((s, f) => s + (f.impactScore || 2), 0) * 1.5}% к Score`
        });
    }
    
    const accessibilityFixes = fixes.filter(f => f.category === 'accessibility');
    if (accessibilityFixes.length > 0) {
        recommendations.push({
            priority: 'medium',
            title: 'Доступность (Accessibility)',
            description: `${accessibilityFixes.length} изображений без alt-тегов. Это важно для пользователей с ограниченными возможностями и помогает поисковикам индексировать картинки.`,
            potentialGain: `+${accessibilityFixes.length * 5} к Accessibility Score`
        });
    }
    
    const performanceFixes = fixes.filter(f => f.category === 'performance');
    if (performanceFixes.length > 0) {
        recommendations.push({
            priority: 'medium',
            title: 'Производительность',
            description: `Lazy loading ускорит загрузку на ${performanceFixes.length * 15}% за счёт отложенной загрузки изображений ниже fold.`,
            potentialGain: `+${performanceFixes.length * 8} к Performance Score`
        });
    }
    
    const socialFixes = fixes.filter(f => f.category === 'social');
    if (socialFixes.length > 0) {
        recommendations.push({
            priority: 'low',
            title: 'Social Sharing',
            description: `Open Graph теги сделают ссылки привлекательнее при шаринге в соцсетях.`,
            potentialGain: '+5-15% CTR в соцсетях'
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
                let newTag;
                
                if (fix.tag === 'script' && fix.attributes?.type === 'application/ld+json') {
                    newTag = `<script type="application/ld+json">${fix.content}</script>`;
                } else {
                    const attrs = Object.entries(fix.attributes || {})
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(' ');
                    newTag = fix.content 
                        ? `<${tag} ${attrs}>${fix.content}</${tag}>`
                        : `<${tag} ${attrs} />`;
                }
                
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
                const selector = fix.selector.replace(/\[|\]/g, '').split(/[#,.]/);
                const tagName = selector[0] || 'img';
                const attrPart = selector.slice(1).join('');
                
                let pattern;
                if (attrPart) {
                    pattern = new RegExp(`<${tagName}([^>]*?)(${attrPart}=["'][^"']*)?([^>]*)>`, 'i');
                } else {
                    pattern = new RegExp(`<${tagName}([^>]*)(?<!${fix.attribute}=)[^>]*>`, 'gi');
                }
                
                const match = modifiedCode.match(pattern);
                if (match) {
                    let targetTag = match[0];
                    if (!targetTag.includes(`${fix.attribute}=`)) {
                        if (targetTag.endsWith('/>')) {
                            targetTag = targetTag.slice(0, -2) + ` ${fix.attribute}="${fix.value}">`;
                        } else {
                            targetTag = targetTag.replace('>', ` ${fix.attribute}="${fix.value}">`);
                        }
                        modifiedCode = modifiedCode.replace(match[0], targetTag);
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
