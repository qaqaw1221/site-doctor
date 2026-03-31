const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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
      },
      {
        type: 'seo',
        severity: 'medium',
        title: 'Изображения без alt-тегов',
        description: 'Найдено 3 изображения без alt-тегов',
        businessImpact: 20,
        autoFixable: true,
        estimatedFixTime: '10 минут'
      }
    ],
    performance: {
      score: 65,
      loadTime: 4200,
      firstContentfulPaint: 1200
    },
    seo: {
      score: 75,
      missingAlt: 3,
      missingMeta: 1,
      brokenLinks: 0
    }
  },
  'https://google.com': {
    url: 'https://google.com',
    scanDate: new Date(),
    issues: [],
    performance: {
      score: 95,
      loadTime: 800,
      firstContentfulPaint: 300
    },
    seo: {
      score: 98,
      missingAlt: 0,
      missingMeta: 0,
      brokenLinks: 0
    }
  }
};

// Routes
app.post('/api/scan', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        // Validate URL
        try {
            new URL(url);
        } catch {
            return res.status(400).json({ error: 'Invalid URL format' });
        }
        
        // Имитация задержки сканирования
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Возвращаем моковые данные или генерируем случайные
        let result = mockScanResults[url];
        
        if (!result) {
            // Генерируем случайные результаты для неизвестных URL
            const hasIssues = Math.random() > 0.3;
            result = {
                url,
                scanDate: new Date(),
                issues: hasIssues ? [
                    {
                        type: 'performance',
                        severity: 'high',
                        title: 'Медленная загрузка страницы',
                        description: `Страница загружается ${(Math.random() * 5 + 1).toFixed(1)} секунд`,
                        businessImpact: Math.floor(Math.random() * 40) + 10,
                        autoFixable: true,
                        estimatedFixTime: '15 минут'
                    }
                ] : [],
                performance: {
                    score: Math.floor(Math.random() * 40) + 60,
                    loadTime: Math.floor(Math.random() * 4000) + 1000,
                    firstContentfulPaint: Math.floor(Math.random() * 2000) + 500
                },
                seo: {
                    score: Math.floor(Math.random() * 30) + 70,
                    missingAlt: hasIssues ? Math.floor(Math.random() * 5) + 1 : 0,
                    missingMeta: hasIssues && Math.random() > 0.5 ? 1 : 0,
                    brokenLinks: 0
                }
            };
        }
        
        res.json({
            success: true,
            data: result,
            message: 'Scan completed successfully'
        });
        
    } catch (error) {
        console.error('Scan API error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Get scan history
app.get('/api/scans', async (req, res) => {
    try {
        // Возвращаем моковую историю
        const scans = Object.values(mockScanResults).sort((a, b) => b.scanDate - a.scanDate);
        
        res.json({
            success: true,
            data: scans
        });
    } catch (error) {
        console.error('Get scans error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0-simple'
    });
});

// Serve static files from client directory
app.use(express.static('client'));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Site Doctor API (Simple) running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the application`);
});
