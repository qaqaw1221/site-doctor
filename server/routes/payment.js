const express = require('express');
const router = express.Router();
const dbModule = require('../database');
const db = dbModule;
const { authenticateToken } = require('../middleware/auth');
const { PLAN_PRICES, PLAN_FEATURES } = require('../middleware/plans');
const { sendPaymentConfirmation } = require('../utils/email');

// NOWPayments API
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NOWPAYMENTS_IPN_KEY = process.env.NOWPAYMENTS_IPN_KEY || '';

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1';

// Create payment
router.post('/create', authenticateToken, async (req, res) => {
    const { plan, period, method } = req.body;
    const userId = req.user.id;

    if (!plan || !['pro', 'business'].includes(plan)) {
        return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    if (!period || !['monthly', 'yearly'].includes(period)) {
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }

    const price = PLAN_PRICES[plan][period];

    // Generate internal payment ID
    const paymentId = `PAY_${Date.now()}_${userId}`;

    try {
        if (method === 'crypto') {
            // Create NOWPayments invoice
            const response = await fetch(`${NOWPAYMENTS_API}/invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': NOWPAYMENTS_API_KEY
                },
                body: JSON.stringify({
                    price_amount: price.amount,
                    price_currency: 'usd', // NOWPayments works in USD
                    order_id: paymentId,
                    order_description: `Site Doctor ${plan.charAt(0).toUpperCase() + plan.slice(1)} - ${period === 'monthly' ? 'Monthly' : 'Yearly'}`,
                    is_fee_paid_by_user: false
                })
            });

            const data = await response.json();

            if (data.id) {
                // Save payment
                db.run(
                    'INSERT INTO payments (payment_id, user_id, plan, period, amount, currency, method, status, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [paymentId, userId, plan, period, price.amount, price.currency, 'crypto', 'pending', data.id.toString()],
                    (err) => {
                        if (err) console.error('Payment insert error:', err);
                    }
                );

                res.json({
                    success: true,
                    paymentId,
                    amount: data.price_amount,
                    currency: data.price_currency,
                    invoiceUrl: data.invoice_url,
                    checkoutUrl: data.invoice_url,
                    description: `${plan} - ${period}`
                });
            } else {
                throw new Error(data.message || 'Failed to create invoice');
            }
        } else {
            // Card or other methods - create pending payment
            db.run(
                'INSERT INTO payments (payment_id, user_id, plan, period, amount, currency, method, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [paymentId, userId, plan, period, price.amount, price.currency, method || 'card', 'pending'],
                (err) => {
                    if (err) {
                        console.error('Payment insert error:', err);
                        return res.status(500).json({ success: false, error: 'Failed to create payment' });
                    }

                    res.json({
                        success: true,
                        paymentId,
                        amount: price.amount,
                        currency: price.currency,
                        description: `${plan} - ${period}`,
                        message: 'Card payments coming soon. Use crypto for now.'
                    });
                }
            );
        }
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get payment status
router.get('/status/:paymentId', authenticateToken, (req, res) => {
    const { paymentId } = req.params;
    const userId = req.user.id;

    db.get('SELECT * FROM payments WHERE payment_id = ? AND user_id = ?', [paymentId, userId], (err, payment) => {
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
                checkoutUrl: payment.method === 'crypto' ? `https://nowpayments.io/payment?paymentId=${payment.external_id}` : null,
                createdAt: payment.created_at
            }
        });
    });
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
                currencies: ['RUB', 'USD', 'EUR'],
                gateway: 'stripe',
                icon: 'credit-card'
            },
            {
                id: 'crypto',
                name: 'Криптовалюта',
                nameEn: 'Cryptocurrency',
                currencies: ['USDTTRC', 'USDTERC', 'BTC', 'ETH', 'TON'],
                gateway: 'nowpayments',
                icon: 'bitcoin'
            },
            {
                id: 'sbp',
                name: 'СБП (Россия)',
                nameEn: 'SBP (Russia)',
                currencies: ['RUB'],
                gateway: 'yookassa',
                icon: 'smartphone'
            }
        ]
    });
});

// NOWPayments IPN Webhook
router.post('/webhook/nowpayments', (req, res) => {
    const signature = req.headers['x-nowpayments-sig'];
    
    let paymentData;
    if (typeof req.body === 'string' || req.body instanceof Buffer) {
        try {
            paymentData = JSON.parse(req.body.toString());
        } catch (e) {
            console.error('Failed to parse webhook body:', e);
            return res.status(400).json({ error: 'Invalid JSON' });
        }
    } else {
        paymentData = req.body;
    }

    console.log('NOWPayments webhook received:', paymentData);
    console.log('Signature:', signature ? 'present' : 'missing');

    if (!signature || signature !== NOWPAYMENTS_IPN_KEY) {
        console.log('Invalid signature');
        return res.status(403).json({ error: 'Invalid signature' });
    }

    if (paymentData.payment_status === 'finished' || paymentData.payment_status === 'confirmed') {
        const orderId = paymentData.order_id;
        
        if (!orderId) {
            console.error('No order_id in webhook');
            return res.status(400).json({ error: 'Missing order_id' });
        }

        db.get('SELECT * FROM payments WHERE payment_id = ?', [orderId], (err, payment) => {
            if (err || !payment) {
                console.error('Payment not found:', orderId);
                return res.json({ error: 'Payment not found' });
            }

            if (payment.status !== 'completed') {
                db.run('UPDATE payments SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE payment_id = ?',
                    ['completed', orderId], (err) => {
                        if (err) console.error('Error updating payment:', err);
                    });

                const periodMonths = payment.period === 'yearly' ? 12 : 1;
                db.run(
                    'UPDATE users SET plan = ?, subscription_end = datetime("now", "+" || ? || " months"), subscription_cancelled = 0, scans_used = 0 WHERE id = ?',
                    [payment.plan, periodMonths, payment.user_id],
                    (err) => {
                        if (err) console.error('Error updating user:', err);
                    }
                );

                db.get('SELECT email, name FROM users WHERE id = ?', [payment.user_id], (err, user) => {
                    if (!err && user) {
                        sendPaymentConfirmation(user.email, user.name || 'Пользователь', payment.plan, payment.period);
                    }
                });

                console.log(`✅ Payment completed: ${orderId} - Plan: ${payment.plan} - User: ${payment.user_id}`);
            }
        });
    }

    res.json({ received: true });
});

// Stripe webhook (for card payments)
router.post('/webhook/stripe', (req, res) => {
    // Handle Stripe webhooks
    res.json({ received: true });
});

// Get user's subscription info
router.get('/subscription', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT plan, subscription_end FROM users WHERE id = ?', [userId], (err, user) => {
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

    // Don't remove the plan immediately, just mark for downgrade at end of period
    db.run('UPDATE users SET subscription_cancelled = 1 WHERE id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
        }

        res.json({
            success: true,
            message: 'Подписка отменена. План будет активен до конца оплаченного периода.'
        });
    });
});

module.exports = router;
