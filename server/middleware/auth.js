const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'site-doctor-secret-key-change-in-production';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            plan: user.plan,
            scans_left: user.scans_left,
            comparisons_used: user.comparisons_used || 0
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

module.exports = { authenticateToken, generateToken, JWT_SECRET };
