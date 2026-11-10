const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'edge_studio_super_secret_jwt_token_2024_auth_key';

function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح بالدخول: يرجى تسجيل الدخول أولاً بحساب مسؤول النظام.'
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'رمز التحقق مفقود.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'رمز الجلسة غير صالح أو منتهي الصلاحية. يرجى إعادة تسجيل الدخول.'
    });
  }
}

module.exports = { requireAdmin };

