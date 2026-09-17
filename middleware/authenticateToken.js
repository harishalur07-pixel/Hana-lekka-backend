const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token ಇಲ್ಲ' });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token ಅಮಾನ್ಯ ಅಥವಾ ಅವಧಿ ಮುಗಿದಿದೆ' });
    }
    req.user = decoded;
    next();
  });
}

module.exports = authenticateToken;
