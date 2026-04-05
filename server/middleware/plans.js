const dbModule = require('../database');
const db = dbModule;
const PLAN_FEATURES = dbModule.PLAN_FEATURES || {
    free: { autoFixes: false, pdfExport: false, csvExport: false, apiAccess: false, whiteLabel: false, teamAccess: false, scheduledScans: false },
    pro: { autoFixes: true, pdfExport: true, csvExport: true, apiAccess: false, whiteLabel: false, teamAccess: false, scheduledScans: false },
    business: { autoFixes: true, pdfExport: true, csvExport: true, apiAccess: true, whiteLabel: true, teamAccess: 5, scheduledScans: true }
};

const PLAN_PRICES = {
    pro: {
        monthly: { amount: 9.99, currency: 'usd' },
        yearly: { amount: 99.99, currency: 'usd' }
    },
    business: {
        monthly: { amount: 59.99, currency: 'usd' },
        yearly: { amount: 599.99, currency: 'usd' }
    }
};

const requirePlan = (feature) => {
    return (req, res, next) => {
        const plan = req.user?.plan || 'free';
        const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
        
        if (feature === 'any') {
            return next();
        }
        
        if (features[feature]) {
            return next();
        }
        
        return res.status(403).json({
            success: false,
            error: `Для этой функции необходим тариф ${plan === 'free' ? 'Pro' : 'Business'}`,
            required: feature,
            upgrade: true
        });
    };
};

const getUserFeatures = (plan) => {
    return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
};

const getUserPlan = (userId, callback) => {
    db.get('SELECT plan FROM users WHERE id = ?', [userId], (err, row) => {
        if (err || !row) {
            return callback(err || new Error('User not found'), null);
        }
        callback(null, {
            plan: row.plan,
            features: getUserFeatures(row.plan),
            prices: PLAN_PRICES[row.plan]
        });
    });
};

module.exports = {
    requirePlan,
    getUserFeatures,
    getUserPlan,
    PLAN_FEATURES,
    PLAN_PRICES
};
