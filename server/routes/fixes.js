const express = require('express');
const router = express.Router();
const { applyFixes } = require('../../scanner/modules/fixes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan, PLAN_FEATURES } = require('../middleware/plans');

router.use(authenticateToken);

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
        const puppeteer = require('puppeteer');
        const { getChromePath } = require('../../scanner/core/browser');
        const { generateFixes } = require('../../scanner/modules/fixes');
        
        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        };
        
        const chromePath = getChromePath();
        if (chromePath) {
            launchOptions.executablePath = chromePath;
        }
        
        const browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        
        const fixes = await generateFixes(page, { url });
        
        await browser.close();
        
        res.json({
            success: true,
            fixes: fixes.fixes,
            totalFixes: fixes.totalFixes,
            potentialScoreIncrease: fixes.potentialScoreIncrease,
            recommendations: fixes.recommendations,
            features: PLAN_FEATURES[plan]
        });
        
    } catch (error) {
        console.error('Preview fixes error:', error);
        res.status(500).json({
            success: false,
            error: error.message
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
    
    try {
        const puppeteer = require('puppeteer');
        const { getChromePath } = require('../../scanner/core/browser');
        
        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        };
        
        const chromePath = getChromePath();
        if (chromePath) {
            launchOptions.executablePath = chromePath;
        }
        
        const browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        
        const html = await page.content();
        
        const modifiedHtml = applyFixes(html, fixes);
        
        await browser.close();
        
        res.json({
            success: true,
            originalUrl: url,
            appliedFixes: fixes.length,
            modifiedHtml: modifiedHtml,
            downloadReady: true,
            features: PLAN_FEATURES[plan]
        });
        
    } catch (error) {
        console.error('Apply fixes error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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
