const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/database');
const { sendOtpSms } = require('../utils/sms');
const authenticateToken = require('../middleware/authenticateToken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function isValidMobile(mobile) {
  return /^[6-9]\d{9}$/.test(mobile);
}

router.post('/register', async (req, res) => {
  try {
    const { name, mobile, password, confirmPassword } = req.body;

    if (!name || !mobile || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'ಎಲ್ಲಾ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ' });
    }
    if (!isValidMobile(mobile)) {
      return res.status(400).json({ success: false, message: 'ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ನಂಬರ್ ನಮೂದಿಸಿ' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password ಮತ್ತು Confirm Password ಹೊಂದಾಣಿಕೆ ಆಗುತ್ತಿಲ್ಲ' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password ಕನಿಷ್ಠ 6 ಅಕ್ಷರ ಇರಬೇಕು' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'ಈ ಮೊಬೈಲ್ ನಂಬರ್ ಈಗಾಗಲೇ ನೋಂದಣಿಯಾಗಿದೆ' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, mobile, password) VALUES ($1, $2, $3) RETURNING id',
      [name, mobile, hashedPassword]
    );

    return res.status(201).json({
      success: true,
      message: 'ನೋಂದಣಿ ಯಶಸ್ವಿ',
      user: { id: result.rows[0].id, name, mobile }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ success: false, message: 'ಮೊಬೈಲ್ ಮತ್ತು Password ನಮೂದಿಸಿ' });
    }

    const result = await pool.query('SELECT * FROM users WHERE mobile = $1', [mobile]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'ಬಳಕೆದಾರ ಕಂಡುಬಂದಿಲ್ಲ' });
    }

    const passwordMatches = bcrypt.compareSync(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ' });
    }

    const token = jwt.sign({ id: user.id, mobile: user.mobile }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    return res.json({
      success: true,
      message: 'ಲಾಗಿನ್ ಯಶಸ್ವಿ',
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile || !isValidMobile(mobile)) {
      return res.status(400).json({ success: false, message: 'ಸರಿಯಾದ ಮೊಬೈಲ್ ನಂಬರ್ ನಮೂದಿಸಿ' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ಈ ಮೊಬೈಲ್ ನಂಬರ್ ನೋಂದಣಿಯಾಗಿಲ್ಲ' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query('INSERT INTO otps (mobile, otp, expires_at) VALUES ($1, $2, $3)', [
      mobile,
      otp,
      expiresAt
    ]);

    const smsResult = await sendOtpSms(mobile, otp);

    const response = { success: true, message: 'OTP ಕಳುಹಿಸಲಾಗಿದೆ (5 ನಿಮಿಷ ಮಾನ್ಯ)' };

    if (!smsResult.sent) {
      response.otp_for_testing = otp;
      response.sms_note = 'SMS ಕಳುಹಿಸಿಲ್ಲ (FAST2SMS_API_KEY ಸೆಟ್ ಆಗಿಲ್ಲ) — ಟೆಸ್ಟಿಂಗ್ ಮೋಡ್';
    }

    return res.json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { mobile, otp, newPassword } = req.body;

    if (!mobile || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'ಎಲ್ಲಾ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password ಕನಿಷ್ಠ 6 ಅಕ್ಷರ ಇರಬೇಕು' });
    }

    const result = await pool.query(
      'SELECT * FROM otps WHERE mobile = $1 AND otp = $2 AND used = FALSE ORDER BY id DESC LIMIT 1',
      [mobile, otp]
    );
    const record = result.rows[0];

    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP ತಪ್ಪಾಗಿದೆ' });
    }
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP ಅವಧಿ ಮುಗಿದಿದೆ' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE mobile = $2', [hashedPassword, mobile]);
    await pool.query('UPDATE otps SET used = TRUE WHERE id = $1', [record.id]);

    return res.json({ success: true, message: 'Password ಬದಲಾಯಿಸಲಾಗಿದೆ. ಈಗ ಲಾಗಿನ್ ಮಾಡಿ' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, mobile, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'ಬಳಕೆದಾರ ಕಂಡುಬಂದಿಲ್ಲ' });
    }
    return res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

module.exports = router;
