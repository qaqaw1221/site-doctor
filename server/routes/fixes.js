const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { PLAN_FEATURES } = require('../middleware/plans');

router.use(authenticateToken);

function generateFixRecommendations($) {
    const fixes = [];
    let potentialScoreIncrease = 0;

    const title = $('title').text().trim();
    if (!title) {
        fixes.push({
            type: 'seo',
            issue: 'Отсутствует тег <title>',
            fix: '<title>Заголовок вашего сайта</title>',
            impact: 'Высокий'
        });
        potentialScoreIncrease += 15;
    }

    const metaDesc = $('meta[name="description"]').attr('content');
    if (!metaDesc) {
        fixes.push({
            type: 'seo',
            issue: 'Отсутствует meta description',
            fix: '<meta name="description" content="Описание вашего сайта">',
            impact: 'Средний'
        });
        potentialScoreIncrease += 10;
    }

    const h1 = $('h1').first().text().trim();
    if (!h1) {
        fixes.push({
            type: 'seo',
            issue: 'Отсутствует тег H1',
            fix: '<h1>Главный заголовок страницы</h1>',
            impact: 'Высокий'
        });
        potentialScoreIncrease += 15;
    }

    const imagesWithoutAlt = $('img:not([alt])').length;
    if (imagesWithoutAlt > 0) {
        fixes.push({
            type: 'accessibility',
            issue: `${imagesWithoutAlt} изображений без alt текста`,
            fix: 'Добавьте атрибут alt ко всем изображениям: <img src="..." alt="описание">',
            impact: 'Средний'
        });
        potentialScoreIncrease += 10;
    }

    const viewport = $('meta[name="viewport"]').attr('content');
    if (!viewport) {
        fixes.push({
            type: 'mobile',
            issue: 'Отсутствует viewport meta',
            fix: '<meta name="viewport" content="width=device-width, initial-scale=1">',
            impact: 'Высокий'
        });
        potentialScoreIncrease += 15;
    }

    const lang = $('html').attr('lang');
    if (!lang) {
        fixes.push({
            type: 'accessibility',
            issue: 'Не указан язык страницы',
            fix: '<html lang="ru">',
            impact: 'Низкий'
        });
        potentialScoreIncrease += 5;
    }

    const canonical = $('link[rel="canonical"]').attr('href');
    if (!canonical) {
        fixes.push({
            type: 'seo',
            issue: 'Отсутствует canonical URL',
            fix: '<link rel="canonical" href="https://ваш-сайт.ru/">',
            impact: 'Низкий'
        });
        potentialScoreIncrease += 5;
    }

    return {
        fixes,
        totalFixes: fixes.length,
        potentialScoreIncrease
    };
}

router.post('/preview', async (req, res) => {
    const { url } = req.body;
    const plan = req.user.plan || 'free';
    
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL required'
        });
    }
    
    if (!PLAN_FEATURES[plan]?.autoFixes) {
        return res.status(403).json({
            success: false,
            error: 'Автофиксы доступны только на тарифах Pro и Business',
            upgrade: true,
            required: 'autoFixes'
        });
    }
    
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'SiteDoctor/1.0'
            }
        });

        const $ = cheerio.load(response.data);
        const recommendations = generateFixRecommendations($);

        res.json({
            success: true,
            fixes: recommendations.fixes,
            totalFixes: recommendations.totalFixes,
            potentialScoreIncrease: recommendations.potentialScoreIncrease,
            recommendations: recommendations.fixes.map(f => f.issue),
            features: PLAN_FEATURES[plan]
        });
        
    } catch (error) {
        console.error('Preview fixes error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Не удалось загрузить страницу: ' + error.message
        });
    }
});

router.post('/apply', async (req, res) => {
    const { url, fixes } = req.body;
    const plan = req.user.plan || 'free';
    
    if (!url || !fixes || !Array.isArray(fixes)) {
        return res.status(400).json({
            success: false,
            error: 'Необходимы url и массив fixes'
        });
    }
    
    if (!PLAN_FEATURES[plan]?.autoFixes) {
        return res.status(403).json({
            success: false,
            error: 'Автофиксы доступны только на тарифах Pro и Business',
            upgrade: true,
            required: 'autoFixes'
        });
    }

    res.json({
        success: true,
        message: 'Автофиксы применяются автоматически при следующем сканировании',
        appliedFixes: fixes.length,
        features: PLAN_FEATURES[plan]
    });
});

router.get('/features', (req, res) => {
    const plan = req.user.plan || 'free';
    res.json({
        success: true,
        plan: plan,
        features: PLAN_FEATURES[plan] || PLAN_FEATURES.free
    });
});

module.exports = router;
