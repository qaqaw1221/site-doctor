const { SiteScanner } = require('./index');

async function test() {
    console.log('Testing Site Doctor Scanner v2...\n');
    
    const scanner = new SiteScanner({ maxInstances: 2 });
    
    scanner.on('progress', (data) => {
        console.log(`[${data.stage}] ${data.percent}%`);
    });

    scanner.on('scan:complete', (results) => {
        console.log('\n=== SCAN COMPLETE ===');
        console.log(`URL: ${results.url}`);
        console.log(`Site Type: ${results.siteType}`);
        console.log(`Overall Score: ${results.overallScore}/100`);
        console.log('\nScores:');
        console.log(`  SEO: ${results.scores.seo}/100`);
        console.log(`  Performance: ${results.scores.performance}/100`);
        console.log(`  Accessibility: ${results.scores.accessibility}/100`);
        console.log(`  Links: ${results.scores.links}/100`);
        console.log(`  Mobile: ${results.scores.mobile}/100`);
        console.log(`\nTotal Issues: ${results.stats.totalIssues}`);
        console.log(`  Critical: ${results.stats.critical}`);
        console.log(`  High: ${results.stats.high}`);
        console.log(`  Medium: ${results.stats.medium}`);
        console.log(`  Low: ${results.stats.low}`);
        console.log(`  Auto-fixable: ${results.stats.autoFixable}`);
        console.log(`\nScan Duration: ${results.stats.scanDuration}ms`);
    });

    scanner.on('scan:error', (err) => {
        console.error('\n=== SCAN ERROR ===');
        console.error(err.error);
    });

    try {
        const url = process.argv[2] || 'https://example.com';
        console.log(`Scanning: ${url}\n`);
        
        const result = await scanner.scan(url);
        
        console.log('\n--- Sample Issues ---');
        result.issues.slice(0, 5).forEach((issue, i) => {
            console.log(`${i + 1}. [${issue.severity}] ${issue.title}`);
            console.log(`   ${issue.description}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await scanner.close();
        process.exit(0);
    }
}

test();
