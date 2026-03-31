const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.yandex.ru',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationCode(email, name, code) {
    const mailOptions = {
        from: `"Site Doctor" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Код подтверждения - Site Doctor',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 10px; padding: 40px; text-align: center; }
                    h1 { color: #333; margin-bottom: 20px; }
                    .code { font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #4F46E5; margin: 30px 0; }
                    p { color: #666; line-height: 1.6; font-size: 16px; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Подтверждение email</h1>
                    <p>Здравствуйте, ${name}!</p>
                    <p>Ваш код подтверждения:</p>
                    <div class="code">${code}</div>
                    <p>Введите этот код на сайте для подтверждения email.</p>
                    <p style="color: #999; font-size: 14px;">Код действителен 10 минут.</p>
                    <div class="footer">
                        Если вы не регистрировались в Site Doctor, проигнорируйте это письмо.
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Здравствуйте, ${name}!

Ваш код подтверждения: ${code}

Введите этот код на сайте для подтверждения email.
Код действителен 10 минут.

Site Doctor
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Verification code sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error.message);
        return false;
    }
}

async function testConnection() {
    try {
        await transporter.verify();
        console.log('SMTP connection verified');
        return true;
    } catch (error) {
        console.error('SMTP connection failed:', error.message);
        return false;
    }
}

async function sendPaymentConfirmation(email, name, plan, period) {
    const planNames = { pro: 'Pro', business: 'Business' };
    const periodNames = { monthly: 'ежемесячная', yearly: 'годовая' };
    const planName = planNames[plan] || plan;
    const periodName = periodNames[period] || period;
    
    const mailOptions = {
        from: `"Site Doctor" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Оплата прошла успешно! - Site Doctor',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 10px; padding: 40px; text-align: center; }
                    h1 { color: #22c55e; margin-bottom: 20px; }
                    .checkmark { font-size: 60px; margin-bottom: 20px; }
                    .plan { font-size: 24px; font-weight: bold; color: #4F46E5; margin: 20px 0; }
                    .period { color: #666; font-size: 16px; }
                    p { color: #333; line-height: 1.6; font-size: 16px; }
                    .features { text-align: left; margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 8px; }
                    .features li { margin: 8px 0; color: #333; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
                    .btn { display: inline-block; padding: 12px 30px; background: #4F46E5; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="checkmark">✓</div>
                    <h1>Оплата прошла успешно!</h1>
                    <p>Здравствуйте, ${name}!</p>
                    <p>Благодарим вас за подписку на Site Doctor.</p>
                    
                    <div class="plan">${planName} Plan</div>
                    <div class="period">${periodName} подписка</div>
                    
                    <div class="features">
                        <p><strong>Что включено:</strong></p>
                        <ul>
                            <li>${plan === 'pro' ? '50' : '500'} сканирований в месяц</li>
                            <li>${plan === 'pro' ? '50' : '500'} сравнений в месяц</li>
                            <li>Авто-исправления</li>
                            <li>PDF и CSV экспорт</li>
                            ${plan === 'business' ? '<li>API доступ</li><li>White-label</li><li>Командный доступ</li>' : '<li>Приоритетная поддержка</li>'}
                        </ul>
                    </div>
                    
                    <p>Ваш план активирован и готов к использованию!</p>
                    
                    <a href="${process.env.BASE_URL || 'https://sitedoctor.io'}" class="btn">Перейти в Site Doctor</a>
                    
                    <div class="footer">
                        Если у вас есть вопросы, напишите нам на support@sitedoctor.io<br>
                        © 2026 Site Doctor
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Здравствуйте, ${name}!

Оплата прошла успешно!

Вы подписались на план ${planName} (${periodName} подписка).

Ваш план активирован!

Перейдите на сайт чтобы начать использовать:
${process.env.BASE_URL || 'https://sitedoctor.io'}

© 2026 Site Doctor
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Payment confirmation sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending payment email:', error.message);
        return false;
    }
}

module.exports = {
    sendVerificationCode,
    generateVerificationCode,
    testConnection,
    sendPaymentConfirmation,
    transporter
};
