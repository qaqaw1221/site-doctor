const puppeteer = require('puppeteer');
const os = require('os');

// Determine Chrome executable path based on OS
function getChromePath() {
    const platform = os.platform();
    if (platform === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
        ];
        return paths.find(path => require('fs').existsSync(path));
    }
    return null;
}

class SiteScanner {
    // Determine site type for special handling
    determineSiteType(url, metaData) {
        const domain = url.toLowerCase();
        
        // Search engines - comprehensive list
        if (domain.includes('google.com') || domain.includes('google.') || 
            domain.includes('yandex.') || domain.includes('yandex.') ||
            domain.includes('bing.') || domain.includes('bing.com') ||
            domain.includes('duckduckgo.') || domain.includes('duckduckgo.com') ||
            domain.includes('yahoo.') || domain.includes('yahoo.com') ||
            domain.includes('baidu.') || domain.includes('baidu.com') ||
            domain.includes('ask.') || domain.includes('ask.com')) {
            return 'search_engine';
        }
        
        // Social networks
        if (domain.includes('facebook.') || domain.includes('instagram.') ||
            domain.includes('twitter.') || domain.includes('linkedin.') ||
            domain.includes('vk.') || domain.includes('telegram.') ||
            domain.includes('tiktok.') || domain.includes('snapchat.')) {
            return 'social_network';
        }
        
        // Admin panels
        if (domain.includes('admin') || domain.includes('wp-admin') ||
            domain.includes('dashboard') || domain.includes('cpanel') ||
            domain.includes('/admin')) {
            return 'admin_panel';
        }
        
        // Development sites
        if (domain.includes('localhost') || domain.includes('127.0.0.1') ||
            domain.includes('staging') || domain.includes('dev') ||
            domain.includes('test.') || domain.includes('local.')) {
            return 'development';
        }
        
        // E-commerce platforms
        if (domain.includes('amazon.') || domain.includes('shopify.') ||
            domain.includes('ebay.') || domain.includes('aliexpress.') ||
            domain.includes('etsy.') || domain.includes('shop.')) {
            return 'ecommerce';
        }
        
        // Large platforms/services (more lenient rules)
        if (domain.includes('github.') || domain.includes('youtube.') ||
            domain.includes('reddit.') || domain.includes('wikipedia.') ||
            domain.includes('stackoverflow.') || domain.includes('medium.')) {
            return 'large_platform';
        }
        
        return 'regular';
    }
    
    async scan(url) {
        console.log(`Starting scan for: ${url}`);
        
        const chromePath = getChromePath();
        console.log('Using Chrome at:', chromePath || 'bundled Chromium');
        
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        };
        
        if (chromePath) {
            launchOptions.executablePath = chromePath;
        }
        
        const browser = await puppeteer.launch(launchOptions);
        
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            
            console.log('Navigating to:', url);
            const startTime = Date.now();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            const domLoadedTime = Date.now() - startTime;
            
            // Wait a bit for dynamic content
            await page.waitForTimeout(1000);
            
            // Get real performance metrics from Performance API
            const performance = await page.evaluate(() => {
                const nav = performance.getEntriesByType('navigation')[0];
                const paint = performance.getEntriesByType('paint');
                const fcp = paint.find(p => p.name === 'first-contentful-paint');
                
                return {
                    domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
                    loadComplete: nav ? nav.loadEventEnd : 0,
                    firstContentfulPaint: fcp ? fcp.startTime : 0,
                    totalResources: performance.getEntriesByType('resource').length
                };
            });
            
            // Check for images without alt
            const imagesData = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img'));
                const visibleImages = images.filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width > 1 && rect.height > 1;
                });
                return {
                    total: visibleImages.length,
                    withoutAlt: visibleImages.filter(img => !img.alt || img.alt.trim() === '').length
                };
            });
            
            // Check meta tags
            const metaData = await page.evaluate(() => {
                const description = document.querySelector('meta[name="description"]');
                const viewport = document.querySelector('meta[name="viewport"]');
                const canonical = document.querySelector('link[rel="canonical"]');
                const charset = document.querySelector('meta[charset], meta[http-equiv="Content-Type"]');
                
                return {
                    hasDescription: !!description && description.content.length > 0,
                    descriptionLength: description ? description.content.length : 0,
                    hasViewport: !!viewport,
                    hasCanonical: !!canonical,
                    hasCharset: !!charset,
                    title: document.title,
                    titleLength: document.title ? document.title.length : 0
                };
            });
            
            // Check headings structure
            const headings = await page.evaluate(() => {
                const h1s = document.querySelectorAll('h1');
                const h2s = document.querySelectorAll('h2');
                
                // Check if H1s are visible and have content
                const validH1s = Array.from(h1s).filter(h1 => {
                    const text = h1.textContent.trim();
                    const rect = h1.getBoundingClientRect();
                    return text.length > 0 && rect.width > 0 && rect.height > 0;
                });
                
                return {
                    h1: validH1s.length,
                    h2: h2s.length,
                    firstH1Text: validH1s[0] ? validH1s[0].textContent.trim().substring(0, 50) : ''
                };
            });
            
            // Check for Open Graph tags (social sharing)
            const ogTags = await page.evaluate(() => {
                return {
                    hasOGTitle: !!document.querySelector('meta[property="og:title"]'),
                    hasOGDescription: !!document.querySelector('meta[property="og:description"]'),
                    hasOGImage: !!document.querySelector('meta[property="og:image"]')
                };
            });
            
            // Check HTTPS
            const isHTTPS = url.startsWith('https://');
            
            // Determine site type for special handling
            const siteType = this.determineSiteType(url, metaData);
            console.log(`Detected site type: ${siteType}`);
            
            const issues = [];
            let performanceScore = 100;
            let seoScore = 100;
            let securityScore = 100;
            
            // ===== PERFORMANCE CHECKS =====
            // Different thresholds for different site types
            const perfThresholds = {
                regular: { critical: 5000, medium: 3000, fcp: 1800 },
                search_engine: { critical: 8000, medium: 5000, fcp: 2500 },
                large_platform: { critical: 7000, medium: 4000, fcp: 2200 },
                ecommerce: { critical: 6000, medium: 3500, fcp: 2000 },
                social_network: { critical: 7000, medium: 4000, fcp: 2200 }
            };
            
            const thresholds = perfThresholds[siteType] || perfThresholds.regular;
            
            // Critical: Page load time > threshold
            if (performance.loadComplete > thresholds.critical) {
                issues.push({
                    type: 'performance',
                    severity: 'high',
                    title: 'Медленная загрузка страницы',
                    description: `Страница загружается ${Math.round(performance.loadComplete/1000)} секунд. Рекомендуется менее ${Math.round(thresholds.medium/1000)} секунд для хорошего UX.`,
                    businessImpact: 30,
                    autoFixable: false,
                    estimatedFixTime: '45 минут'
                });
                performanceScore -= 25;
            } else if (performance.loadComplete > thresholds.medium) {
                issues.push({
                    type: 'performance',
                    severity: 'medium',
                    title: 'Медленная загрузка страницы',
                    description: `Время загрузки ${Math.round(performance.loadComplete/1000)} секунд. Рекомендуется менее ${Math.round(thresholds.medium/1000)} секунд.`,
                    businessImpact: 20,
                    autoFixable: false,
                    estimatedFixTime: '30 минут'
                });
                performanceScore -= 15;
            }
            
            // Warning: FCP > threshold
            if (performance.firstContentfulPaint > thresholds.fcp) {
                issues.push({
                    type: 'performance',
                    severity: 'medium',
                    title: 'Медленный First Contentful Paint',
                    description: `FCP: ${Math.round(performance.firstContentfulPaint)}мс. Рекомендуется менее ${Math.round(thresholds.fcp)}мс.`,
                    businessImpact: 15,
                    autoFixable: false,
                    estimatedFixTime: '20 минут'
                });
                performanceScore -= 10;
            }
            
            // ===== SEO CHECKS =====
            // Skip most SEO checks for search engines and large platforms
            if (siteType === 'search_engine' || siteType === 'large_platform') {
                console.log(`Skipping most SEO checks for ${siteType}`);
                
                // Only check critical issues for these sites
                if (!metaData.hasViewport) {
                    issues.push({
                        type: 'mobile',
                        severity: 'high',
                        title: 'Отсутствует viewport meta-тег',
                        description: 'Нет мета-тега viewport. Страница будет некорректно отображаться на мобильных устройствах.',
                        businessImpact: 30,
                        autoFixable: true,
                        estimatedFixTime: '2 минуты'
                    });
                    seoScore -= 20;
                }
                
                if (!isHTTPS) {
                    issues.push({
                        type: 'security',
                        severity: 'critical',
                        title: 'Отсутствует HTTPS',
                        description: 'Сайт работает без HTTPS. Это критичная уязвимость безопасности и негативно влияет на SEO.',
                        businessImpact: 50,
                        autoFixable: false,
                        estimatedFixTime: '1-2 часа'
                    });
                    securityScore = 30;
                }
                
            } else {
                console.log('Running full SEO checks for regular site');
                
                // Critical: No title or title too short/long
                if (!metaData.title || metaData.titleLength === 0) {
                    issues.push({
                        type: 'seo',
                        severity: 'critical',
                        title: 'Отсутствует заголовок страницы',
                        description: 'Тег <title> отсутствует или пуст. Критично для SEO.',
                        businessImpact: 35,
                        autoFixable: true,
                        estimatedFixTime: '2 минуты'
                    });
                    seoScore -= 30;
                } else if (metaData.titleLength < 10) {
                    issues.push({
                        type: 'seo',
                        severity: 'medium',
                        title: 'Слишком короткий заголовок',
                        description: `Длина заголовка ${metaData.titleLength} символов. Рекомендуется 30-60 символов.`,
                        businessImpact: 15,
                        autoFixable: true,
                        estimatedFixTime: '5 минут'
                    });
                    seoScore -= 10;
                } else if (metaData.titleLength > 70) {
                    issues.push({
                        type: 'seo',
                        severity: 'low',
                        title: 'Слишком длинный заголовок',
                        description: `Длина заголовка ${metaData.titleLength} символов. Будет обрезан в поисковой выдаче.`,
                        businessImpact: 10,
                        autoFixable: true,
                        estimatedFixTime: '5 минут'
                    });
                    seoScore -= 5;
                }
                
                // Critical: No meta description
                if (!metaData.hasDescription) {
                    issues.push({
                        type: 'seo',
                        severity: 'high',
                        title: 'Отсутствует meta-описание',
                        description: 'Мета-тег description отсутствует. Это важно для SEO и отображения в поисковых системах.',
                        businessImpact: 25,
                        autoFixable: true,
                        estimatedFixTime: '5 минут'
                    });
                    seoScore -= 20;
                } else if (metaData.hasDescription && (metaData.descriptionLength < 50 || metaData.descriptionLength > 160)) {
                    issues.push({
                        type: 'seo',
                        severity: 'low',
                        title: 'Некорректная длина meta-описания',
                        description: `Длина описания ${metaData.descriptionLength} символов. Оптимально: 50-160.`,
                        businessImpact: 10,
                        autoFixable: true,
                        estimatedFixTime: '5 минут'
                    });
                    seoScore -= 5;
                }
                
                // Warning: No valid H1 heading
                if (headings.h1 === 0) {
                    issues.push({
                        type: 'seo',
                        severity: 'medium',
                        title: 'Отсутствует заголовок H1',
                        description: 'На странице нет видимого тега h1. Это важно для структуры и SEO.',
                        businessImpact: 20,
                        autoFixable: true,
                        estimatedFixTime: '10 минут'
                    });
                    seoScore -= 15;
                }
                
                // Info: Multiple H1s (less strict for complex sites)
                if (headings.h1 > 1 && siteType !== 'ecommerce') {
                    issues.push({
                        type: 'seo',
                        severity: 'low',
                        title: 'Несколько заголовков H1',
                        description: `На странице ${headings.h1} тегов h1. Рекомендуется только один на страницу.`,
                        businessImpact: 10,
                        autoFixable: true,
                        estimatedFixTime: '10 минут'
                    });
                    seoScore -= 5;
                }
                
                // Warning: Images without alt (more lenient for complex sites)
                if (imagesData.total > 0 && imagesData.withoutAlt > 0) {
                    const percentage = Math.round((imagesData.withoutAlt / imagesData.total) * 100);
                    const threshold = siteType === 'ecommerce' ? 30 : 20;
                    const severityThreshold = siteType === 'ecommerce' ? 10 : 5;
                    
                    if (percentage > threshold) {
                        issues.push({
                            type: 'seo',
                            severity: imagesData.withoutAlt > severityThreshold ? 'high' : 'medium',
                            title: 'Изображения без alt-тегов',
                            description: `${imagesData.withoutAlt} из ${imagesData.total} изображений (${percentage}%) без атрибута alt. Влияет на доступность и SEO.`,
                            businessImpact: imagesData.withoutAlt > severityThreshold ? 20 : 15,
                            autoFixable: true,
                            estimatedFixTime: '20 минут'
                        });
                        seoScore -= imagesData.withoutAlt > severityThreshold ? 15 : 10;
                    }
                }
                
                // Low priority: No canonical
                if (!metaData.hasCanonical) {
                    issues.push({
                        type: 'seo',
                        severity: 'low',
                        title: 'Отсутствует canonical URL',
                        description: 'Нет тега link rel="canonical". Рекомендуется для предотвращения дублирования контента.',
                        businessImpact: 10,
                        autoFixable: true,
                        estimatedFixTime: '5 минут'
                    });
                    seoScore -= 5;
                }
                
                // Warning: No viewport (mobile critical)
                if (!metaData.hasViewport) {
                    issues.push({
                        type: 'mobile',
                        severity: 'high',
                        title: 'Отсутствует viewport meta-тег',
                        description: 'Нет мета-тега viewport. Страница будет некорректно отображаться на мобильных устройствах.',
                        businessImpact: 30,
                        autoFixable: true,
                        estimatedFixTime: '2 минуты'
                    });
                    seoScore -= 20;
                }
                
                // Info: No Open Graph tags
                if (!ogTags.hasOGTitle || !ogTags.hasOGDescription || !ogTags.hasOGImage) {
                    issues.push({
                        type: 'social',
                        severity: 'low',
                        title: 'Отсутствуют Open Graph теги',
                        description: 'Нет тегов для социальных сетей. При шаринге страницы может отображаться некорректно.',
                        businessImpact: 10,
                        autoFixable: true,
                        estimatedFixTime: '10 минут'
                    });
                    seoScore -= 5;
                }
                
                // ===== SECURITY CHECKS =====
                // Critical: No HTTPS
                if (!isHTTPS) {
                    issues.push({
                        type: 'security',
                        severity: 'critical',
                        title: 'Отсутствует HTTPS',
                        description: 'Сайт работает без HTTPS. Это критичная уязвимость безопасности и негативно влияет на SEO.',
                        businessImpact: 50,
                        autoFixable: false,
                        estimatedFixTime: '1-2 часа'
                    });
                    securityScore = 30;
                }
            }
            
            // Ensure scores are within 0-100
            performanceScore = Math.max(0, Math.min(100, performanceScore));
            seoScore = Math.max(0, Math.min(100, seoScore));
            securityScore = Math.max(0, Math.min(100, securityScore));
            
            const overallScore = Math.round((performanceScore + seoScore + securityScore) / 3);
            
            console.log(`Scan completed for: ${url}`);
            console.log(`Found ${issues.length} issues`);
            console.log(`Scores - Performance: ${performanceScore}, SEO: ${seoScore}, Security: ${securityScore}`);
            console.log(`Site type: ${siteType}`);
            
            return {
                url,
                siteType,
                issues,
                performance: {
                    score: performanceScore,
                    loadTime: performance.loadComplete,
                    domContentLoaded: performance.domContentLoaded,
                    firstContentfulPaint: Math.round(performance.firstContentfulPaint),
                    totalResources: performance.totalResources
                },
                seo: {
                    score: seoScore,
                    missingAlt: imagesData.withoutAlt,
                    missingMeta: metaData.hasDescription ? 0 : 1,
                    brokenLinks: 0,
                    headings,
                    hasTitle: !!metaData.title && metaData.titleLength > 0,
                    hasCanonical: metaData.hasCanonical,
                    hasViewport: metaData.hasViewport,
                    totalImages: imagesData.total,
                    metaDescriptionLength: metaData.descriptionLength
                },
                security: {
                    score: securityScore,
                    isHTTPS
                },
                overallScore
            };
            
        } catch (error) {
            await browser.close();
            console.error('Scan error:', error);
            throw error;
        }
    }
}

module.exports = { SiteScanner };
