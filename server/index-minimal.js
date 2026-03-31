const http = require('http');
const url = require('url');

// Моковые данные для демонстрации
const mockScanResults = {
  'https://example.com': {
    url: 'https://example.com',
    scanDate: new Date(),
    issues: [
      {
        type: 'performance',
        severity: 'high',
        title: 'Медленная загрузка страницы',
        description: 'Страница загружается 4.2 секунд',
        businessImpact: 30,
        autoFixable: true,
        estimatedFixTime: '15 минут'
      },
      {
        type: 'seo',
        severity: 'medium',
        title: 'Отсутствует meta-описание',
        description: 'Добавьте meta-тег description для лучшего SEO',
        businessImpact: 25,
        autoFixable: true,
        estimatedFixTime: '5 минут'
      }
    ],
    performance: { score: 65, loadTime: 4200, firstContentfulPaint: 1200 },
    seo: { score: 75, missingAlt: 3, missingMeta: 1, brokenLinks: 0 }
  }
};

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  // API Routes
  if (path === '/api/scan' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { url: scanUrl } = JSON.parse(body);
        
        if (!scanUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL is required' }));
          return;
        }
        
        // Имитация задержки
        setTimeout(() => {
          let result = mockScanResults[scanUrl];
          
          if (!result) {
            result = {
              url: scanUrl,
              scanDate: new Date(),
              issues: Math.random() > 0.5 ? [{
                type: 'performance',
                severity: 'high',
                title: 'Медленная загрузка страницы',
                description: `Страница загружается ${(Math.random() * 5 + 1).toFixed(1)} секунд`,
                businessImpact: Math.floor(Math.random() * 40) + 10,
                autoFixable: true,
                estimatedFixTime: '15 минут'
              }] : [],
              performance: {
                score: Math.floor(Math.random() * 40) + 60,
                loadTime: Math.floor(Math.random() * 4000) + 1000,
                firstContentfulPaint: Math.floor(Math.random() * 2000) + 500
              },
              seo: {
                score: Math.floor(Math.random() * 30) + 70,
                missingAlt: Math.floor(Math.random() * 5),
                missingMeta: Math.random() > 0.5 ? 1 : 0,
                brokenLinks: 0
              }
            };
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: result,
            message: 'Scan completed successfully'
          }));
        }, 2000);
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    
  } else if (path === '/api/scans' && req.method === 'GET') {
    const scans = Object.values(mockScanResults).sort((a, b) => b.scanDate - a.scanDate);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: scans }));
    
  } else if (path === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '1.0.0-minimal'
    }));
    
  } else {
    // Serve static files
    const fs = require('fs');
    const filePath = path === '/' ? '/client/index.html' : path;
    
    try {
      const fullPath = __dirname + '..' + filePath;
      const content = fs.readFileSync(fullPath);
      const ext = filePath.split('.').pop();
      
      const contentType = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json'
      }[ext] || 'text/plain';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('File not found');
    }
  }
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`Site Doctor API (Minimal) running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the application`);
});
