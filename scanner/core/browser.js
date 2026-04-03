const puppeteer = require('puppeteer');
const os = require('os');
const fs = require('fs');

function getChromePath() {
    const platform = os.platform();
    
    if (platform === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
        ];
        return paths.find(path => fs.existsSync(path));
    }
    
    if (platform === 'linux') {
        const paths = [
            process.env.PUPPETEER_EXECUTABLE_PATH,
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable'
        ];
        
        for (const path of paths) {
            if (path && fs.existsSync(path)) {
                return path;
            }
        }
    }
    
    return null;
}

class BrowserPool {
    constructor(options = {}) {
        this.maxInstances = options.maxInstances || 2;
        this.browsers = [];
        this.available = [];
        this.inUse = new Set();
        
        const chromePath = getChromePath();
        
        this.launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-translate',
                '--no-first-run',
                '--single-process'
            ]
        };
        
        if (chromePath) {
            this.launchOptions.executablePath = chromePath;
            console.log('Using Chrome at:', chromePath);
        } else {
            console.warn('Chrome not found. Puppeteer will try to download it.');
        }
    }

    async getBrowser() {
        if (this.available.length > 0) {
            const browser = this.available.pop();
            return browser;
        }

        if (this.browsers.length < this.maxInstances) {
            try {
                const browser = await puppeteer.launch(this.launchOptions);
                this.browsers.push(browser);
                console.log('Browser launched successfully');
                return browser;
            } catch (err) {
                console.error('Failed to launch browser:', err.message);
                throw err;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.getBrowser();
    }

    async getPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        await page.setRequestInterception(true);
        page.on('request', request => {
            const type = request.resourceType();
            request.continue();
        });

        this.inUse.add(page);
        return { browser, page };
    }

    async releasePage(context) {
        if (context.page) {
            try {
                await context.page.close();
            } catch (e) {}
            this.inUse.delete(context.page);
        }
    }

    async close() {
        for (const browser of this.browsers) {
            try {
                await browser.close();
            } catch (e) {}
        }
        this.browsers = [];
        this.available = [];
        this.inUse.clear();
    }
}

module.exports = { BrowserPool, getChromePath };
