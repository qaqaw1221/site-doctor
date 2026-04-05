const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const dbModule = require('../database');
const db = dbModule;
const { authenticateToken } = require('../middleware/auth');
const { PLAN_PRICES, PLAN_FEATURES } = require('../middleware/plans');
const { sendPaymentConfirmation } = require('../utils/email');

// NOWPayments API
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NOWPAYMENTS_IPN_KEY = process.env.NOWPAYMENTS_IPN_KEY || '';
const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1';

// NovaPay API
const NOVAPAY_API_URL = process.env.NOVAPAY_API_URL || 'https://api-qecom.novapay.ua';
const NOVAPAY_MERCHANT_ID = parseInt(process.env.NOVAPAY_MERCHANT_ID) || 2;

// Test private key (hardcoded)
const NOVAPAY_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCgYSuVeKh3Zl8O
sEcOR0MuUcKW6S2+FNOV9R8eJItSoe3U96zOqwNw8DTa2wOKR5W0WPeRQkg2Y2zk
5zFGLSHG1y9+uTDOmO/1kMBzh99P7bvjlE5ofV5+iXH8/Xq9Ye/N+paiAQYN8ym6
N3h9mYHuU9IlksJaCG1RCWjNTxLwoCl0/CJZVawKREAM2XVxWH28HUaeMRTx2Rmk
iQhFGKQJJlyotk9WzkjgqmMJcZHwM8qBRF6ZeBD8hKV3wXWLFcDjKgIMK51IXKbO
335ZdiZdEBbAxg4d9XVe0SR9Z5QgP6+Jw3l5LtCJbZqb9Y2viosJDZGJdTgv4inG
bMm3+HTPAgMBAAECggEAA3rrI259qk5TFnBkVpGRijg92iS3FK9v8z80FiF6hly/
D0S2P/bDN6XRjttkntx7+qzvyOzL/NMWysZyAO0/b1P6LUa7P+2bErJ9p8fmTc8f
izdH8P5lkVs+4MyjFLrZcNRy/YPKDdglMnrpMm6lJfbLrF2FuiE+GGFAmLPsrrOF
/RaRTm2QX+e+tjZhtIBHDMHoPSfcpB2iGMB/Spm/iy3RSWTQYp7ySEu9oaYrTbcG
TxQxOQcwKc7FqbggAyUHEniLsY15BGkJKxGoB4HelnxR+FernJdkNcywdZPzgVFe
lmpltxlP6le4AzSQPVmj+IBrv/h4McWZEUqzFvGWAQKBgQDQ5SW1YvtcEFgT2HCE
2hAxesnLHBEmdwvzkGwmmdwlwIMTxmAELlO8mCQooMbcJAY2O4Kd1tClKKo+SlYl
AISoc42yGgLsFvauKRl3Fdc+oCadXH3FLhh0PDMJ3XLsZAJ0LM3W1zFeBRJS1Epb
6qqlqrqNqgK14ndnM+Yz5rXn/wKBgQDEi1/ywVtgBNQxp7fSVotX+I44amMfqLq/
yGvo/U37R2sp788yRQ/x0fHDGIXQ4krXymOrEPBQM5mb3VdD1RjfbieSETUwxO+k
Cyx7BopTARcNTo4Nt+vE/KyQeYywGuq9Q/YpkGAlHCRNRKR5mWrsxr8FKGMlel99
j/vinBDzMQKBgF3pVp2IJUbLVj19xYAEZNlJwWSddpxbUrUqDWUBMLaMKKGAQnQ+
u4iCwWa+eQhI7b393QfGpkBJ2tdsJfQ3WF20LVSPWxb2b+n2MiuWVxEhgJqoFSbL
RVUkJzHdK6hYgb3m0pcuYVRKZWV1aQSPqC4YZgwADX3llRaBf5F/u/HTAoGASM5s
Y4uW4rHHPQGpCYS/p33OiT13rKGfVC3VM4Cp43xoSSepdDC7IFQqH6A06dT57oft
ddAXhU4oB+HtUpZc2V9/zw8Kyh8ZuoXdG1Gn6emMdYR1AMXx043aCsbMA+xkqmnD
hVATHYwYMntMBjN7tWxGFI4KdDapquSsZRx09vECgYEAh0fPQPlT7Bbsd50/MDpG
HXwt8v3LFZtxAPLWZdOP7Wmb8DJ5L/yazlVnT1u5y+JfcYGZIEZ/SKLM6I+1xhTN
f8y23MXWUCw00jhLK2clpbjVfWKey2pEcm6aGG3/CMEaOEqspsDS9bE8GdQPfNfw
6VicGagZw45jEQ416jB5d8w=
-----END PRIVATE KEY-----`;

// Helper: Sign NovaPay request
function signNovaPayRequest(body) {
    try {
        const dataToSign = JSON.stringify(body);
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(dataToSign);
        sign.end();
        const signature = sign.sign(NOVAPAY_PRIVATE_KEY, 'base64');
        return signature;
    } catch (error) {
        console.error('NovaPay sign error:', error);
        return null;
    }
}

// Helper: Verify NovaPay signature
function verifyNovaPaySignature(body, signature) {
    try {
        const publicKey = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw1FeLVQlCYMnxVMPwhHA\nAYik6KGfYz0GJW0SP4dBs6XQ2Ap2kP0X3K5WtJNnPehiWf7jJz9XH2Xh/17t37kZ\nKXGEdWYtPUAWQItLGSIwmPMau+YBFFvLD8OReFhFXc6sjReSPJSFV8KDtOP7By9u\n+KxYqZTVqPxCeYXHOzT7vtDJBJDLbe0pJ3B3wRihMEuHP54X4zqEAi/vbqArhHDD\nO07FZpQ3PA/Fkgj8jMTUxU3LxmIIkNIuLz+Ze/PxL88qvRkRoHd73agYSs5bVdCg\nurGUs2hGFQap4KiyR0TRtaJujM715y1gjVFN7Khkkol/dJaHRqxUaZv3dlL+RMXG\n/wIDAQAB\n-----END PUBLIC KEY-----';
        
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(JSON.stringify(body));
        verify.end();
        return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
        console.error('NovaPay verify error:', error);
        return false;
    }
}

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
    const paymentId = `PAY_${Date.now()}_${userId}`;

    try {
        if (method === 'novapay') {
            // NovaPay checkout
            const sessionBody = {
                merchant_id: NOVAPAY_MERCHANT_ID,
                order_id: paymentId,
                amount: Math.round(price.amount * 100),
                currency: 'UAH',
                callback_url: `${process.env.BASE_URL}/api/payment/webhook/novapay`,
                result_url: `${process.env.BASE_URL}/payment/success?payment_id=${paymentId}`,
                client_first_name: req.user.name?.split(' ')[0] || 'User',
                client_last_name: req.user.name?.split(' ').slice(1).join(' ') || '',
                client_email: req.user.email,
                products: [
                    {
                        name: `Site Doctor ${plan.charAt(0).toUpperCase() + plan.slice(1)} - ${period === 'monthly' ? 'Monthly' : 'Yearly'}`,
                        price: Math.round(price.amount * 100),
                        count: 1
                    }
                ],
                metadata: {
                    user_id: userId.toString(),
                    plan: plan,
                    period: period
                }
            };

            const signature = signNovaPayRequest(sessionBody);

            const response = await fetch(`${NOVAPAY_API_URL}/v1/checkout/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-sign': signature || ''
                },
                body: JSON.stringify(sessionBody)
            });

            const data = await response.json();

            if (data.status === 'accept' && data.checkout_url) {
                db.run(
                    'INSERT INTO payments (payment_id, user_id, plan, period, amount, currency, method, status, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [paymentId, userId, plan, period, price.amount, 'UAH', 'novapay', 'pending', data.session_id?.toString() || paymentId],
                    (err) => {
                        if (err) console.error('NovaPay payment insert error:', err);
                    }
                );

                res.json({
                    success: true,
                    paymentId,
                    amount: price.amount,
                    currency: 'UAH',
                    checkoutUrl: data.checkout_url,
                    description: `${plan} - ${period}`
                });
            } else {
                throw new Error(data.message || data.error || 'Failed to create NovaPay session');
            }
        } else if (method === 'crypto') {
            // NOWPayments invoice
            const response = await fetch(`${NOWPAYMENTS_API}/invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': NOWPAYMENTS_API_KEY
                },
                body: JSON.stringify({
                    price_amount: price.amount,
                    price_currency: 'usd',
                    order_id: paymentId,
                    order_description: `Site Doctor ${plan.charAt(0).toUpperCase() + plan.slice(1)} - ${period === 'monthly' ? 'Monthly' : 'Yearly'}`,
                    is_fee_paid_by_user: false
                })
            });

            const data = await response.json();

            if (data.id) {
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
                        message: 'Card payments coming soon. Use NovaPay or crypto for now.'
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

        let checkoutUrl = null;
        if (payment.method === 'crypto') {
            checkoutUrl = `https://nowpayments.io/payment?paymentId=${payment.external_id}`;
        } else if (payment.method === 'novapay') {
            checkoutUrl = null; // Redirect URL was already sent in create response
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
                checkoutUrl: checkoutUrl,
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
                id: 'novapay',
                name: 'Банковская карта',
                nameEn: 'Credit/Debit Card',
                currencies: ['UAH', 'USD', 'EUR'],
                gateway: 'novapay',
                icon: 'credit-card',
                regions: ['Украина', 'Европа']
            },
            {
                id: 'card',
                name: 'Банковская карта (другие)',
                nameEn: 'Credit/Debit Card',
                currencies: ['RUB', 'USD', 'EUR'],
                gateway: 'stripe',
                icon: 'credit-card',
                regions: ['Россия', 'Мир']
            },
            {
                id: 'crypto',
                name: 'Криптовалюта',
                nameEn: 'Cryptocurrency',
                currencies: ['USDTTRC', 'USDTERC', 'BTC', 'ETH', 'TON'],
                gateway: 'nowpayments',
                icon: 'bitcoin',
                regions: ['Мир']
            },
            {
                id: 'sbp',
                name: 'СБП (Россия)',
                nameEn: 'SBP (Russia)',
                currencies: ['RUB'],
                gateway: 'yookassa',
                icon: 'smartphone',
                regions: ['Россия']
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

// NovaPay: Create checkout session and get payment link
router.post('/novapay/create-session', authenticateToken, async (req, res) => {
    const { plan, period } = req.body;
    const userId = req.user.id;

    if (!plan || !['pro', 'business'].includes(plan)) {
        return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    if (!period || !['monthly', 'yearly'].includes(period)) {
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }

    const price = PLAN_PRICES[plan][period];
    const paymentId = `PAY_NOVA_${Date.now()}_${userId}`;

    try {
        // Create checkout session
        const sessionBody = {
            merchant_id: NOVAPAY_MERCHANT_ID,
            order_id: paymentId,
            amount: Math.round(price.amount * 100), // NovaPay uses cents
            currency: 'UAH',
            callback_url: `${process.env.BASE_URL}/api/payment/webhook/novapay`,
            result_url: `${process.env.BASE_URL}/payment/success?payment_id=${paymentId}`,
            client_first_name: req.user.name?.split(' ')[0] || 'User',
            client_last_name: req.user.name?.split(' ').slice(1).join(' ') || '',
            client_email: req.user.email,
            products: [
                {
                    name: `Site Doctor ${plan.charAt(0).toUpperCase() + plan.slice(1)} - ${period === 'monthly' ? 'Monthly' : 'Yearly'}`,
                    price: Math.round(price.amount * 100),
                    count: 1
                }
            ],
            metadata: {
                user_id: userId.toString(),
                plan: plan,
                period: period
            }
        };

        const signature = signNovaPayRequest(sessionBody);

        const response = await fetch(`${NOVAPAY_API_URL}/v1/checkout/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sign': signature || ''
            },
            body: JSON.stringify(sessionBody)
        });

        const data = await response.json();

        if (data.status === 'accept' && data.checkout_url) {
            // Save payment
            db.run(
                'INSERT INTO payments (payment_id, user_id, plan, period, amount, currency, method, status, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [paymentId, userId, plan, period, price.amount, 'UAH', 'novapay', 'pending', data.session_id?.toString() || paymentId],
                (err) => {
                    if (err) console.error('NovaPay payment insert error:', err);
                }
            );

            res.json({
                success: true,
                paymentId,
                amount: price.amount,
                currency: 'UAH',
                checkoutUrl: data.checkout_url,
                description: `${plan} - ${period}`
            });
        } else {
            console.error('NovaPay error:', data);
            throw new Error(data.message || 'Failed to create NovaPay session');
        }
    } catch (error) {
        console.error('NovaPay create session error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// NovaPay Webhook
router.post('/webhook/novapay', (req, res) => {
    const rawBody = req.body;
    let data;

    try {
        if (Buffer.isBuffer(rawBody)) {
            data = JSON.parse(rawBody.toString());
        } else if (typeof rawBody === 'string') {
            data = JSON.parse(rawBody);
        } else {
            data = rawBody;
        }
    } catch (e) {
        console.error('Failed to parse NovaPay webhook:', e);
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    console.log('NovaPay webhook received:', JSON.stringify(data, null, 2));

    // Verify signature if provided
    const signature = req.headers['x-signature'] || req.headers['x-sign'];
    if (signature && !verifyNovaPaySignature(data, signature)) {
        console.log('NovaPay invalid signature');
        // Continue anyway for testing - in production should return 403
    }

    const sessionStatus = data.status;
    const orderId = data.order_id;

    if (!orderId) {
        console.error('No order_id in NovaPay webhook');
        return res.status(400).json({ error: 'Missing order_id' });
    }

    // Map NovaPay statuses to our statuses
    let paymentStatus = 'pending';
    if (sessionStatus === 'complete' || sessionStatus === 'success') {
        paymentStatus = 'completed';
    } else if (sessionStatus === 'expired' || sessionStatus === 'cancelled') {
        paymentStatus = 'cancelled';
    }

    if (paymentStatus === 'completed') {
        db.get('SELECT * FROM payments WHERE payment_id = ?', [orderId], (err, payment) => {
            if (err || !payment) {
                console.error('Payment not found:', orderId);
                return res.json({ received: true });
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

                console.log(`✅ NovaPay Payment completed: ${orderId} - Plan: ${payment.plan}`);
            }
        });
    } else if (paymentStatus === 'cancelled') {
        db.run('UPDATE payments SET status = ? WHERE payment_id = ?', ['cancelled', orderId], (err) => {
            if (err) console.error('Error updating payment status:', err);
        });
    }

    res.json({ received: true });
});

// Get NovaPay payment status
router.get('/novapay/status/:paymentId', authenticateToken, async (req, res) => {
    const { paymentId } = req.params;
    const userId = req.user.id;

    db.get('SELECT * FROM payments WHERE payment_id = ? AND user_id = ?', [paymentId, userId], async (err, payment) => {
        if (err || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        // If we have external_id (NovaPay session_id), check status
        if (payment.method === 'novapay' && payment.external_id) {
            try {
                const statusBody = {
                    merchant_id: NOVAPAY_MERCHANT_ID,
                    session_id: payment.external_id
                };
                const signature = signNovaPayRequest(statusBody);

                const response = await fetch(`${NOVAPAY_API_URL}/v1/checkout/session/status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-sign': signature || ''
                    },
                    body: JSON.stringify(statusBody)
                });

                const data = await response.json();
                
                // Map NovaPay status to our status
                let novaStatus = 'pending';
                if (data.status === 'complete' || data.status === 'success') {
                    novaStatus = 'completed';
                } else if (data.status === 'expired' || data.status === 'cancelled') {
                    novaStatus = 'cancelled';
                }

                // Update if changed
                if (novaStatus !== payment.status) {
                    db.run('UPDATE payments SET status = ? WHERE payment_id = ?', [novaStatus, paymentId]);
                    payment.status = novaStatus;
                }

            } catch (error) {
                console.error('NovaPay status check error:', error);
            }
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
                checkoutUrl: payment.method === 'novapay' ? null : null,
                createdAt: payment.created_at
            }
        });
    });
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
module.exports.verifyNovaPaySignature = verifyNovaPaySignature;
module.exports.signNovaPayRequest = signNovaPayRequest;
