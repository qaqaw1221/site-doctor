const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { sendVerificationCode, generateVerificationCode } = require('../utils/email');

const router = express.Router();

const validatePassword = (password) => {
    if (password.length < 8) return 'Пароль должен содержать минимум 8 символов';
    if (!/[a-zA-Z]/.test(password)) return 'Пароль должен содержать хотя бы одну букву';
    if (!/[0-9]/.test(password)) return 'Пароль должен содержать хотя бы одну цифру';
    return null;
};

router.post('/register', [
    body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
    body('password').isLength({ min: 8 }).withMessage('Пароль должен содержать минимум 8 символов'),
    body('name').optional().trim().isLength({ min: 2, max: 30 }).withMessage('Имя должно быть от 2 до 30 символов')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { email, password, name } = req.body;

    const passwordError = validatePassword(password);
    if (passwordError) {
        return res.status(400).json({ success: false, error: passwordError });
    }

    const userName = name || email.split('@')[0];

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        db.run(
            'INSERT INTO users (email, password, name, plan, scans_used, verification_code, verification_expires, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, userName, 'free', 0, verificationCode, verificationExpires, 0],
            function(err) {
                if (err) {
                    console.error('Registration error:', err.message);
                    if (err.message.includes('UNIQUE constraint failed: email')) {
                        return res.status(400).json({ success: false, error: 'Пользователь с таким email уже существует' });
                    }
                    if (err.message.includes('UNIQUE constraint failed: name')) {
                        return res.status(400).json({ success: false, error: 'Это имя пользователя уже занято' });
                    }
                    return res.status(500).json({ success: false, error: 'Failed to create user: ' + err.message });
                }

                sendVerificationCode(email, userName, verificationCode).then(sent => {
                    res.json({
                        success: true,
                        message: sent ? 'Код отправлен на email!' : 'Ошибка отправки email. Попробуйте позже.',
                        emailSent: sent,
                        userId: this.lastID,
                        email: email
                    });
                });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/verify-code', [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Код должен быть 6 цифр')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Код должен быть 6 цифр' });
    }

    const { email, code } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (!user) {
            return res.status(400).json({ success: false, error: 'Пользователь не найден' });
        }
        if (user.email_verified) {
            return res.status(400).json({ success: false, error: 'Email уже подтверждён' });
        }

        if (user.verification_code !== code) {
            return res.status(400).json({ success: false, error: 'Неверный код' });
        }

        if (new Date(user.verification_expires) < new Date()) {
            return res.status(400).json({ success: false, error: 'Код истёк. Запросите новый код.' });
        }

        db.run(
            'UPDATE users SET email_verified = 1, verification_code = NULL, verification_expires = NULL WHERE id = ?',
            [user.id],
            (err) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Failed to verify email' });
                }

                const token = generateToken({ ...user, email_verified: 1 });

                res.json({
                    success: true,
                    message: 'Email подтверждён! Добро пожаловать!',
                    token: token,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        plan: user.plan,
                        scans_left: user.scans_left
                    }
                });
            }
        );
    });
});

router.post('/resend-code', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Некорректный email' });
    }

    const { email } = req.body;

    db.get('SELECT id, email, name, email_verified FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (!user) {
            return res.json({ success: true, message: 'Если пользователь существует, код отправлен' });
        }

        if (user.email_verified) {
            return res.json({ success: true, message: 'Email уже подтверждён' });
        }

        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        db.run(
            'UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?',
            [verificationCode, verificationExpires, user.id],
            async (err) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Database error' });
                }

                const sent = await sendVerificationCode(user.email, user.name, verificationCode);

                res.json({
                    success: true,
                    message: sent ? 'Новый код отправлен!' : 'Не удалось отправить код. Попробуйте позже.'
                });
            }
        );
    });
});

router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            if (!user) {
                return res.status(400).json({ success: false, error: 'Неверный email или пароль' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, error: 'Неверный email или пароль' });
            }

            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

            const token = generateToken(user);

            res.json({
                success: true,
                message: 'Вход выполнен успешно',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    plan: user.plan,
                    scans_left: user.scans_left,
                    email_verified: user.email_verified
                }
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/me', authenticateToken, (req, res) => {
    db.get('SELECT id, email, name, plan, scans_left, created_at, email_verified FROM users WHERE id = ?',
        [req.user.id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            res.json({ success: true, user });
        }
    );
});

module.exports = router;
