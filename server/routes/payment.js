const express = require('express');
const router = express.Router();
const dbModule = require('../database');
const db = dbModule;
const { authenticateToken } = require('../middleware/auth');
const { PLAN_PRICES, PLAN_FEATURES } = require('../middleware/plans');
const { sendPaymentConfirmation } = require('../utils/email');

// Stripe API
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// FreeKassa API
const FREEKASSA_MERCHANT_ID = process.env.FREEKASSA_MERCHANT_ID || '';
const FREEKASSA_SECRET_KEY = process.env.FREEKASSA_SECRET_KEY || '';
const FREEKASSA_SECRET_KEY_2 = process.env.FREEKASSA_SECRET_KEY_2 || '';
const FREEKASSA_API_KEY = process.env.FREEKASSA_API_KEY || '';

// FreeKassa payment URL
const FREEKASSA_URL = 'https://pay.freekassa.ru/';
const FREEKASSA_IPN_URL = process.env.BASE_URL + '/api/payment/freekassa-ipn';

// Activate plan by Stripe session ID
router.post('/activate-session', authenticateToken, async (req, res) => {
    const { session_id } = req.body;
    const userId = req.user.id;
    
    if (!session_id) {
        return res.status(400).json({ success: false, error: 'Missing session_id' });
    }
    
    try {
        // Get session from Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);
        
        if (session.payment_status !== 'paid') {
            return res.json({ success: false, message: 'Payment not completed', status: session.payment_status });
        }
        
        // Find payment record
        db.get('SELECT * FROM payments WHERE external_id = $1', [session_id], (err, payment) => {
            if (err || !payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            
            if (payment.status === 'completed') {
                return res.json({ success: true, message: 'Plan already activated', plan: payment.plan });
            }
            
            // Activate the plan
            const periodMonths = payment.period === 'yearly' ? 12 : 1;
            const subscriptionEnd = new Date(Date.now() + periodMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
            
            db.run('UPDATE payments SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE payment_id = $2', ['completed', payment.payment_id]);
            
            db.run('UPDATE users SET plan = $1, subscription_end = $2, subscription_cancelled = 0, scans_used = 0, scans_left = $3 WHERE id = $4', 
                [payment.plan, subscriptionEnd, payment.plan === 'agency' ? 500 : 50, userId]);
            
            // Get updated user
            db.get('SELECT id, email, name, plan, scans_left, email_verified FROM users WHERE id = $1', [userId], (err, user) => {
                if (err || !user) {
                    return res.json({ success: true, message: 'Plan activated!', plan: payment.plan });
                }
                
                return res.json({ success: true, message: 'Plan activated!', plan: payment.plan, user: user });
            });
        });
    } catch (error) {
        console.error('Activate session error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Create payment - create Stripe Checkout Session
router.post('/create', authenticateToken, async (req, res) => {
    const { plan, period } = req.body;
    const userId = req.user.id;

    if (!plan || !['pro', 'agency'].includes(plan)) {
        return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    if (!period || !['monthly', 'yearly'].includes(period)) {
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }

    const price = PLAN_PRICES[plan][period];
    const paymentId = `PAY_${Date.now()}_${userId}`;

    try {
        // Get user info
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = $1', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: user.email,
            client_reference_id: paymentId,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Site Doctor ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
                            description: period === 'monthly' ? 'Monthly subscription' : 'Yearly subscription (2 months free!)',
                        },
                        unit_amount: Math.round(price.amount * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                user_id: userId.toString(),
                plan: plan,
                period: period,
                payment_id: paymentId
            },
            success_url: `${process.env.BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.BASE_URL}/scan?payment=cancelled`,
        });

        // Save payment to database (PostgreSQL syntax)
        db.run(
            'INSERT INTO payments (payment_id, user_id, plan, period, amount, currency, method, status, external_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)',
            [paymentId, userId, plan, period, price.amount, price.currency, 'stripe', 'pending', session.id],
            (err) => {
                if (err) console.error('Payment insert error:', err);
            }
        );

        res.json({
            success: true,
            paymentId,
            amount: price.amount,
            currency: price.currency,
            checkoutUrl: session.url,
            sessionId: session.id,
            description: `${plan} - ${period}`
        });
    } catch (error) {
        console.error('Stripe payment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get payment status
router.get('/status/:paymentId', authenticateToken, (req, res) => {
    const { paymentId } = req.params;
    const userId = req.user.id;

    db.get('SELECT * FROM payments WHERE payment_id = $1 AND user_id = $2', [paymentId, userId], (err, payment) => {
        if (err || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        res.json({
            success: true,
            payment: {
                id: payment.payment_id,
                plan: payment.plan,
                period: payment.period,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                checkoutUrl: null,
                createdAt: payment.created_at
            }
        });
    });
});

// Get payment status by Stripe session ID
router.get('/status-by-session/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user.id;

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        db.get('SELECT * FROM payments WHERE external_id = $1 AND user_id = $2', [sessionId, userId], (err, payment) => {
            if (err || !payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }

            let status = payment.status;
            if (session.payment_status === 'paid') {
                status = 'completed';
            } else if (session.payment_status === 'unpaid') {
                status = 'pending';
            }

            res.json({
                success: true,
                payment: {
                    id: payment.payment_id,
                    plan: payment.plan,
                    period: payment.period,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: status,
                    stripeStatus: session.payment_status,
                    createdAt: payment.created_at
                }
            });
        });
    } catch (error) {
        console.error('Stripe status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available payment methods
router.get('/methods', (req, res) => {
    res.json({
        success: true,
        methods: [
            {
                id: 'card',
                name: 'Банковская карта',
                nameEn: 'Credit/Debit Card',
                currencies: ['USD', 'EUR', 'GBP'],
                gateway: 'stripe',
                icon: 'credit-card',
                regions: ['Мир']
            }
        ]
    });
});

// Stripe Webhook
router.post('/webhook/stripe', (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('Stripe webhook received:', event.type);

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            handleSuccessfulPayment(session);
            break;
        case 'checkout.session.expired':
            const expiredSession = event.data.object;
            handleExpiredPayment(expiredSession);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

function handleSuccessfulPayment(session) {
    const paymentId = session.client_reference_id;
    
    if (!paymentId) {
        console.error('No client_reference_id in session');
        return;
    }

    const metadata = session.metadata || {};

    db.get('SELECT * FROM payments WHERE payment_id = $1', [paymentId], (err, payment) => {
        if (err || !payment) {
            console.error('Payment not found:', paymentId);
            return;
        }

        if (payment.status !== 'completed') {
            db.run('UPDATE payments SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
                ['completed', paymentId], (err) => {
                    if (err) console.error('Error updating payment:', err);
                });

            const periodMonths = payment.period === 'yearly' ? 12 : 1;
            const subscriptionEnd = new Date(Date.now() + periodMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
            const scansLeft = payment.plan === 'agency' ? 500 : 50;
            db.run(
                'UPDATE users SET plan = $1, subscription_end = $2, subscription_cancelled = 0, scans_used = 0, scans_left = $3 WHERE id = $4',
                [payment.plan, subscriptionEnd, scansLeft, payment.user_id],
                (err) => {
                    if (err) console.error('Error updating user:', err);
                }
            );

            db.get('SELECT email, name FROM users WHERE id = $1', [payment.user_id], (err, user) => {
                if (!err && user) {
                    sendPaymentConfirmation(user.email, user.name || 'Пользователь', payment.plan, payment.period);
                }
            });

            console.log(`Payment completed: ${paymentId} - Plan: ${payment.plan} - User: ${payment.user_id}`);
        }
    });
}

function handleExpiredPayment(session) {
    const paymentId = session.client_reference_id;
    
    if (!paymentId) return;

    db.run('UPDATE payments SET status = $1 WHERE payment_id = $2', ['expired', paymentId], (err) => {
        if (err) console.error('Error updating payment status:', err);
    });
}

// Get user's subscription info
router.get('/subscription', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT plan, subscription_end FROM users WHERE id = $1', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            plan: user.plan,
            features: PLAN_FEATURES[user.plan],
            subscriptionEnd: user.subscription_end,
            isActive: user.plan !== 'free'
        });
    });
});

// Cancel subscription
router.post('/cancel', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.run('UPDATE users SET subscription_cancelled = 1 WHERE id = $1', [userId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
        }

        res.json({
            success: true,
            message: 'Подписка отменена. План будет активен до конца оплаченного периода.'
        });
    });
});

// =====================
// FREEKASSA INTEGRATION
// =====================

// Create FreeKassa payment
router.post('/create-freekassa', authenticateToken, (req, res) => {
    const { plan, period } = req.body;
    const userId = req.user.id;

    if (!plan || !['pro', 'agency'].includes(plan)) {
        return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    if (!FREEKASSA_MERCHANT_ID || !FREEKASSA_SECRET_KEY) {
        return res.status(500).json({ success: false, error: 'FreeKassa not configured' });
    }

    const price = PLAN_PRICES[plan][period];
    const paymentId = `FK_${Date.now()}_${userId}`;
    const amount = price.amount;

    // Save payment to database
    db.run(
        'INSERT INTO payments (payment_id, user_id, plan, period, amount, currency, method, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)',
        [paymentId, userId, plan, period, amount, 'USD', 'freekassa', 'pending'],
        (err) => {
            if (err) console.error('FreeKassa payment insert error:', err);
        }
    );

    // Create signature for FreeKassa (lowercase MD5)
    const sign = require('crypto').createHash('md5').update(
        `${FREEKASSA_MERCHANT_ID}:${amount}:${FREEKASSA_SECRET_KEY_2}:${paymentId}`
    ).digest('hex').toLowerCase();

    // Build FreeKassa payment URL
    const checkoutUrl = `${FREEKASSA_URL}?` + new URLSearchParams({
        m: FREEKASSA_MERCHANT_ID,
        oa: amount.toString(),
        o: paymentId,
        s: sign,
        us_user_id: userId.toString(),
        us_plan: plan,
        us_period: period,
        currency: 'USD',
        success_url: `${process.env.BASE_URL}/payment/success?payment_id=${paymentId}`,
        fail_url: `${process.env.BASE_URL}/payment/cancelled`,
        callback_url: FREEKASSA_IPN_URL
    }).toString();

    res.json({
        success: true,
        paymentId,
        amount,
        currency: 'USD',
        checkoutUrl,
        method: 'freekassa'
    });
});

// FreeKassa IPN (Instant Payment Notification)
router.post('/freekassa-ipn', express.urlencoded({ extended: true }), (req, res) => {
    const {
        AMOUNT,
        ORDER_ID,
        SIGN
    } = req.body;

    console.log('FreeKassa IPN received:', req.body);

    // Verify signature
    const expectedSign = require('crypto').createHash('md5').update(
        `${AMOUNT}:${FREEKASSA_SECRET_KEY_2}:${ORDER_ID}`
    ).digest('hex');

    if (SIGN !== expectedSign) {
        console.error('FreeKassa signature verification failed');
        return res.status(400).send('bad sign');
    }

    // Find payment
    db.get('SELECT * FROM payments WHERE payment_id = $1', [ORDER_ID], (err, payment) => {
        if (err || !payment) {
            console.error('Payment not found:', ORDER_ID);
            return res.status(404).send('Payment not found');
        }

        if (payment.status === 'completed') {
            console.log('Payment already completed:', ORDER_ID);
            return res.send('OK');
        }

        // Update payment status
        db.run('UPDATE payments SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
            ['completed', ORDER_ID], (err) => {
                if (err) console.error('Error updating payment:', err);
            });

        // Activate user plan
        const periodMonths = payment.period === 'yearly' ? 12 : 1;
        const subscriptionEnd = new Date(Date.now() + periodMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
        const scansLeft = payment.plan === 'agency' ? 500 : 50;

        db.run(
            'UPDATE users SET plan = $1, subscription_end = $2, subscription_cancelled = 0, scans_used = 0, scans_left = $3, comparisons_used = 0 WHERE id = $4',
            [payment.plan, subscriptionEnd, scansLeft, payment.user_id],
            (err) => {
                if (err) console.error('Error updating user:', err);
                else console.log(`FreeKassa payment completed: ${ORDER_ID} - User: ${payment.user_id}`);
            }
        );

        res.send('OK');
    });
});

// Get FreeKassa payment status
router.get('/freekassa-status/:paymentId', authenticateToken, (req, res) => {
    const { paymentId } = req.params;
    const userId = req.user.id;

    db.get('SELECT * FROM payments WHERE payment_id = $1 AND user_id = $2', [paymentId, userId], (err, payment) => {
        if (err || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        res.json({
            success: true,
            status: payment.status,
            plan: payment.plan,
            amount: payment.amount
        });
    });
});

// Get available payment methods (updated for FreeKassa)
router.get('/methods', (req, res) => {
    const methods = [
        {
            id: 'freekassa',
            name: 'Банковская карта / СБП / Крипта',
            nameEn: 'Card / SBP / Crypto',
            currencies: ['USD', 'RUB', 'EUR'],
            gateway: 'freekassa',
            icon: 'wallet'
        }
    ];

    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('placeholder')) {
        methods.push({
            id: 'stripe',
            name: 'Банковская карта (Stripe)',
            nameEn: 'Credit/Debit Card (Stripe)',
            currencies: ['USD'],
            gateway: 'stripe',
            icon: 'credit-card'
        });
    }

    res.json({
        success: true,
        methods
    });
});

module.exports = router;
