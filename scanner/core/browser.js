const puppeteer = require('puppeteer');
const os = require('os');

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

class BrowserPool {
    constructor(options = {}) {
        this.maxInstances = options.maxInstances || 3;
        this.browsers = [];
        this.available = [];
        this.inUse = new Set();
        this.launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        };

        const chromePath = getChromePath();
        if (chromePath) {
            this.launchOptions.executablePath = chromePath;
        }
    }

    async getBrowser() {
        if (this.available.length > 0) {
            const browser = this.available.pop();
            return browser;
        }

        if (this.browsers.length < this.maxInstances) {
            const browser = await puppeteer.launch(this.launchOptions);
            this.browsers.push(browser);
            return browser;
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
            if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                request.continue();
            } else {
                request.continue();
            }
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
