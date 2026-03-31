const SiteScanner = require('./core/scanner');
const { BrowserPool } = require('./core/browser');

module.exports = {
    SiteScanner,
    BrowserPool,
    
    createScanner: (options) => new SiteScanner(options),
    
    scan: async (url, options) => {
        const scanner = new SiteScanner({
            maxInstances: options?.maxInstances || 2
        });
        try {
            const result = await scanner.scan(url, options);
            return result;
        } finally {
            await scanner.close();
        }
    }
};
