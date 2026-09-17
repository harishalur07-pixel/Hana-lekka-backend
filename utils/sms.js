const axios = require('axios');

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';

async function sendOtpSms(mobile, otp) {
  if (!FAST2SMS_API_KEY) {
    console.log(`[SMS SKIPPED - no API key set] Mobile: ${mobile}  OTP: ${otp}`);
    return { sent: false, error: 'FAST2SMS_API_KEY not configured' };
  }

  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'q',
        message: `ನಿಮ್ಮ ಹಣ ಲೆಕ್ಕ OTP: ${otp}. ಇದು 5 ನಿಮಿಷಗಳ ಕಾಲ ಮಾನ್ಯ.`,
        language: 'unicode',
        flash: 0,
        numbers: mobile
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.return === true) {
      return { sent: true };
    }
    console.error('[Fast2SMS] Unexpected response:', response.data);
    return { sent: false, error: response.data };
  } catch (err) {
    console.error('[Fast2SMS] Error sending SMS:', err.response?.data || err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendOtpSms };
