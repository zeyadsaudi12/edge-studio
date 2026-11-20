/**
 * EDGE Creative Studio - Production Backend Server
 * خادم Express مع قاعدة بيانات MongoDB وتوثيق أمني للوحة الإدارة
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
if (!process.env.JWT_SECRET) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be configured in production.');
  }
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
}
const JWT_SECRET = process.env.JWT_SECRET;

const Admin = require('./models/Admin');
const Order = require('./models/Order');
const Project = require('./models/Project');
const Package = require('./models/Package');
const Setting = require('./models/Setting');
const { requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edge_studio';
if (isProduction && !process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI must be configured in production.');
}
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// تحويل وحجب صيغة .html تلقائياً للحصول على روابط نظيفة وجميلة (Clean URLs)
app.use((req, res, next) => {
  if (req.path === '/index.html') {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, '/' + query);
  }
  if (req.path.endsWith('.html')) {
    const cleanPath = req.path.slice(0, -5);
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, cleanPath + query);
  }
  next();
});

// Serve only public assets and explicitly routed pages.
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// توجيه المسارات النظيفة (بدون .html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/portfolio', (req, res) => {
  res.sendFile(path.join(__dirname, 'portfolio.html'));
});

// حالة الاتصال بقاعدة البيانات وإعادة استخدام الاتصال في Serverless
let isDbConnected = false;
let dbConnectingPromise = null;
mongoose.connection.on('disconnected', () => {
  isDbConnected = false;
  dbConnectingPromise = null;
});

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    isDbConnected = true;
    return;
  }

  if (dbConnectingPromise) {
    return dbConnectingPromise;
  }

  dbConnectingPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    bufferCommands: false
  }).then(async () => {
    isDbConnected = true;
    console.log('تم الاتصال بقاعدة بيانات MongoDB بنجاح');
    await seedDefaultAdmin();
  }).catch((err) => {
    isDbConnected = false;
    dbConnectingPromise = null;
    console.warn('⚠️ تحذير: تعذر الاتصال بـ MongoDB حالياً:', err.message);
  });

  return dbConnectingPromise;
}

// Middleware لضمان اتصال قاعدة البيانات قبل تنفيذ أي طلب API على Vercel Serverless
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    await connectToDatabase();
  }
  next();
});

// إنشاء حساب الأدمن الافتراضي إن لم يكن موجوداً
async function seedDefaultAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      if (isProduction && !process.env.ADMIN_PASSWORD) {
        console.warn('ADMIN_PASSWORD is required to create the initial admin account.');
        return;
      }
      if (process.env.ADMIN_PASSWORD &&
          (process.env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') > 72)) {
        console.error('ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
        return;
      }

      const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
      const generatedPassword = process.env.ADMIN_PASSWORD ? null : crypto.randomBytes(12).toString('hex');
      const initialPassword = process.env.ADMIN_PASSWORD || generatedPassword;

      const initialAdmin = new Admin({
        username: defaultUsername,
        password: initialPassword,
        name: 'مدير منصة EDGE',
        role: 'superadmin'
      });

      await initialAdmin.save();
      console.log(`تم إنشاء حساب الأدمن ${defaultUsername}.`);
      if (generatedPassword) {
        console.warn(`كلمة مرور مؤقتة لمرة واحدة لحساب ${defaultUsername}: ${generatedPassword}`);
      }
    }
  } catch (e) {
    console.error('خطأ في تهيئة حساب الأدمن:', e.message);
  }
}

const rateLimitBuckets = new Map();
function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }

    if (rateLimitBuckets.size > 10000) {
      for (const [bucketKey, value] of rateLimitBuckets) {
        if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
      }
    }
    next();
  };
}

function requireDatabase(req, res, next) {
  if (!isDbConnected) {
    return res.status(503).json({
      success: false,
      message: 'قاعدة البيانات غير متاحة حالياً. لم يتم حفظ أي تغييرات.'
    });
  }
  next();
}

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanOrderDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
    cleanText(key, 80),
    typeof item === 'string' ? cleanText(item, 1000) :
      (typeof item === 'number' || typeof item === 'boolean' ? item : '')
  ]).filter(([key]) => key));
}

function validImageReference(value) {
  if (typeof value !== 'string') return false;
  if (/^https:\/\/[^\s]+$/i.test(value)) return true;
  return /^\/?assets\/[a-zA-Z0-9._/-]+$/.test(value) && !value.split('/').includes('..');
}

/* ==========================================================================
   مسارات الحالة والنظام (System & Health)
   ========================================================================== */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    appName: 'EDGE Creative Studio Platform',
    databaseConnected: isDbConnected,
    databaseEngine: 'MongoDB',
    timestamp: new Date().toISOString()
  });
});

/* ==========================================================================
   مسارات المصادقة والأمان (Authentication & Security)
   ========================================================================== */

// 1. تسجيل الدخول لحساب الإدارة
app.post('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'محاولات تسجيل الدخول كثيرة. يرجى الانتظار قبل المحاولة مجدداً.'
}), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (typeof username !== 'string' || typeof password !== 'string' ||
        !username.trim() || !password || username.length > 80 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال اسم المستخدم وكلمة المرور.'
      });
    }

    if (!isDbConnected) {
      return res.status(503).json({
        success: false,
        message: 'تعذر الاتصال بقاعدة البيانات. يرجى المحاولة لاحقاً.'
      });
    }

    const admin = await Admin.findOne({ username: username.toLowerCase().trim() });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة.'
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة.'
      });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role, name: admin.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح.',
      token,
      admin: {
        username: admin.username,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم أثناء تسجيل الدخول.' });
  }
});

// 2. التحقق من صلاحية الجلسة والتوكن
app.get('/api/auth/verify', requireAdmin, (req, res) => {
  res.json({
    success: true,
    valid: true,
    admin: req.admin
  });
});

// 3. تغيير كلمة المرور لحساب الأدمن
app.post('/api/auth/change-password', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof newPassword !== 'string' || newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل وألا تتجاوز 72 بايت.' });
    }

    if (!isDbConnected) {
      return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة حالياً.' });
    }

    const admin = await Admin.findOne({ username: req.admin.username });
    if (!admin) return res.status(404).json({ success: false, message: 'المستخدم غير موجود.' });

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة.' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   مسارات الطلبات (Orders API)
   ========================================================================== */

// 1. تقديم طلب جديد (مفتوح للعملاء من الموقع)
app.post('/api/orders', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'تم استلام طلبات كثيرة من هذا الاتصال. يرجى المحاولة لاحقاً.'
}), async (req, res) => {
  try {
    if (!isDbConnected) {
      return res.status(503).json({
        success: false,
        message: 'تعذر حفظ الطلب حالياً. يرجى المحاولة لاحقاً.'
      });
    }

    const data = req.body || {};
    const clientName = cleanText(data.clientName, 120);
    const clientPhone = cleanText(data.clientPhone, 40);
    if (!clientName || !clientPhone) {
      return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان.' });
    }

    const orderPayload = {
      orderId: `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      service: cleanText(data.service, 160) || 'طلب تصميم',
      category: ['social', 'print', 'branding', 'custom'].includes(data.category) ? data.category : 'social',
      categoryName: cleanText(data.categoryName, 100) || 'سوشيال ميديا',
      price: Number.isFinite(Number(data.price)) && Number(data.price) >= 0 ? Number(data.price) : 0,
      clientName,
      clientPhone,
      clientEmail: cleanText(data.clientEmail, 160),
      brandName: cleanText(data.brandName, 160),
      colors: {
        primary: /^#[0-9a-f]{6}$/i.test(data.colors?.primary || '') ? data.colors.primary : '#0A58CA',
        secondary: /^#[0-9a-f]{6}$/i.test(data.colors?.secondary || '') ? data.colors.secondary : '#0056F6',
        accent: /^#[0-9a-f]{6}$/i.test(data.colors?.accent || '') ? data.colors.accent : '#22D3EE'
      },
      uploadedFiles: Array.isArray(data.uploadedFiles) ? data.uploadedFiles.slice(0, 10) : [],
      details: cleanOrderDetails(data.details),
      status: 'pending',
      paymentStatus: 'unpaid',
      adminNotes: ''
    };

    const savedOrder = await Order.create(orderPayload);
    return res.status(201).json({
      success: true,
      message: 'تم تسجيل الطلب في قاعدة البيانات بنجاح.',
      order: savedOrder
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ الطلب.', error: err.message });
  }
});

// 2. جلب كافة الطلبات (محمي للأدمن)
app.get('/api/orders', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { status, paymentStatus, search } = req.query;
    const query = {};

    if (status && status !== 'all') query.status = status;
    if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;

    if (search) {
      const safeSearch = escapeRegex(String(search).slice(0, 100));
      query.$or = [
        { orderId: new RegExp(safeSearch, 'i') },
        { clientName: new RegExp(safeSearch, 'i') },
        { clientPhone: new RegExp(safeSearch, 'i') },
        { brandName: new RegExp(safeSearch, 'i') },
        { service: new RegExp(safeSearch, 'i') }
      ];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. تحديث حالة الطلب أو الدفع (محمي للأدمن)
app.patch('/api/orders/:orderId', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, paymentStatus, adminNotes } = req.body;

    const updateFields = {};
    if (status !== undefined) {
      if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'حالة الطلب غير صالحة.' });
      }
      updateFields.status = status;
    }
    if (paymentStatus !== undefined) {
      if (!['unpaid', 'deposit_paid', 'fully_paid'].includes(paymentStatus)) {
        return res.status(400).json({ success: false, message: 'حالة الدفع غير صالحة.' });
      }
      updateFields.paymentStatus = paymentStatus;
    }
    if (adminNotes !== undefined) updateFields.adminNotes = cleanText(adminNotes, 2000);
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ success: false, message: 'لا توجد حقول صالحة للتحديث.' });
    }

    const updated = await Order.findOneAndUpdate(
      { orderId },
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
    }

    res.json({ success: true, message: 'تم تحديث بيانات الطلب بنجاح.', order: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. حذف طلب محدد (محمي للأدمن)
app.delete('/api/orders/:orderId', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { orderId } = req.params;
    const deleted = await Order.findOneAndDelete({ orderId });
    if (!deleted) return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
    res.json({ success: true, message: 'تم حذف الطلب بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. تصفير وإفراغ جميع الطلبات (محمي للأدمن)
app.delete('/api/orders', requireAdmin, requireDatabase, async (req, res) => {
  try {
    await Order.deleteMany({});
    res.json({ success: true, message: 'تم تصفير وإفراغ سجل الطلبات بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. جلب إحصائيات لوحة التحكم الشاملة (محمي للأدمن)
app.get('/api/stats', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const [orderCounts, categoryCounts, revenueResult] = await Promise.all([
      Order.aggregate([{
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          in_progress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
        }
      }]),
      Order.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Order.aggregate([{
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $or: [{ $eq: ['$status', 'completed'] }, { $eq: ['$paymentStatus', 'fully_paid'] }] }, then: '$price' },
                  { case: { $eq: ['$paymentStatus', 'deposit_paid'] }, then: { $multiply: ['$price', 0.5] } }
                ],
                default: 0
              }
            }
          }
        }
      }])
    ]);

    const counts = orderCounts[0] || {};
    const categories = Object.fromEntries(categoryCounts.map(({ _id, count }) => [_id, count]));

    res.json({
      success: true,
      stats: {
        total: counts.total || 0,
        pending: counts.pending || 0,
        in_progress: counts.in_progress || 0,
        completed: counts.completed || 0,
        cancelled: counts.cancelled || 0,
        revenue: revenueResult[0]?.revenue || 0,
        categories: {
          social: categories.social || 0,
          print: categories.print || 0,
          branding: categories.branding || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   مسارات المشاريع (Portfolio Projects API)
   ========================================================================== */

app.post('/api/uploads/cloudinary-signature', requireAdmin, rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'تجاوزت الحد المسموح لرفع الصور. حاول لاحقاً.'
}), (req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({
      success: false,
      message: 'رفع الصور السحابي غير مهيأ. أضف إعدادات Cloudinary إلى متغيرات البيئة.'
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'edge-studio/projects';
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');
  res.json({ success: true, cloudName, apiKey, timestamp, folder, signature });
});

// 1. جلب المشاريع المضافة (مفتوح للجميع)
app.get('/api/projects', async (req, res) => {
  try {
    if (!isDbConnected) {
      return res.json({ success: true, projects: [] });
    }
    const projects = await Project.find().sort({ createdAt: -1 });
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. إضافة مشروع جديد (محمي للأدمن)
app.post('/api/projects', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const data = req.body || {};
    if (!cleanText(data.title, 160) || !validImageReference(data.image)) {
      return res.status(400).json({ success: false, message: 'اسم المشروع ورابط صورة صالح مطلوبان.' });
    }
    if (data.showInHome !== undefined && typeof data.showInHome !== 'boolean') {
      return res.status(400).json({ success: false, message: 'قيمة عرض المشروع غير صالحة.' });
    }

    const newProj = new Project({
      projectId: `proj-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      title: cleanText(data.title, 160),
      category: ['posts', 'covers', 'frames', 'profiles', 'thum', 'certificates', 'social', 'print', 'branding'].includes(data.category) ? data.category : 'social',
      categoryName: cleanText(data.categoryName, 100) || 'تصميم إبداعي',
      client: cleanText(data.client, 120) || 'عميل EDGE',
      year: cleanText(data.year, 4) || new Date().getFullYear().toString(),
      image: data.image,
      description: cleanText(data.description, 2000),
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 20).map(tag => cleanText(tag, 50)).filter(Boolean) : [],
      features: Array.isArray(data.features) ? data.features.slice(0, 20).map(feature => cleanText(feature, 200)).filter(Boolean) : [],
      showInHome: data.showInHome !== false,
      isCustom: true
    });

    await newProj.save();
    res.status(201).json({ success: true, message: 'تم حفظ المشروع في قاعدة البيانات بنجاح.', project: newProj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. تعديل مشروع قائم (محمي للأدمن)
app.put('/api/projects/:id', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const input = req.body || {};
    const allowedFields = ['title', 'category', 'categoryName', 'client', 'year', 'image', 'description', 'tags', 'features', 'showInHome'];
    const data = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = input[field];
    }
    if (data.title !== undefined) data.title = cleanText(data.title, 160);
    if (data.category !== undefined && !['posts', 'covers', 'frames', 'profiles', 'thum', 'certificates', 'social', 'print', 'branding'].includes(data.category)) {
      return res.status(400).json({ success: false, message: 'تصنيف المشروع غير صالح.' });
    }
    if (data.image !== undefined && !validImageReference(data.image)) {
      return res.status(400).json({ success: false, message: 'يجب استخدام رابط صورة HTTPS أو صورة من مجلد assets.' });
    }
    if (data.categoryName !== undefined) data.categoryName = cleanText(data.categoryName, 100);
    if (data.client !== undefined) data.client = cleanText(data.client, 120);
    if (data.year !== undefined) data.year = cleanText(data.year, 4);
    if (data.description !== undefined) data.description = cleanText(data.description, 2000);
    for (const field of ['tags', 'features']) {
      if (data[field] !== undefined) {
        if (!Array.isArray(data[field])) return res.status(400).json({ success: false, message: 'قائمة بيانات المشروع غير صالحة.' });
        data[field] = data[field].slice(0, 20).map(value => cleanText(value, field === 'tags' ? 50 : 200)).filter(Boolean);
      }
    }
    if (data.showInHome !== undefined && typeof data.showInHome !== 'boolean') {
      return res.status(400).json({ success: false, message: 'قيمة عرض المشروع غير صالحة.' });
    }

    const updated = await Project.findOneAndUpdate(
      { $or: [{ projectId: id }, ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])] },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'المشروع غير موجود.' });
    res.json({ success: true, message: 'تم تحديث المشروع بنجاح.', project: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. حذف مشروع (محمي للأدمن)
app.delete('/api/projects/:id', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Project.findOneAndDelete({
      $or: [{ projectId: id }, ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])]
    });
    if (!deleted) return res.status(404).json({ success: false, message: 'المشروع غير موجود.' });
    res.json({ success: true, message: 'تم حذف المشروع بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   مسارات الباقات والأسعار (Packages & Services API)
   ========================================================================== */

// 1. جلب كافة الباقات المتاحة (مفتوح للعملاء والواجهة الرئيسية)
app.get('/api/packages', async (req, res) => {
  try {
    if (!isDbConnected) {
      return res.json({ success: true, packages: [] });
    }
    const { category } = req.query;
    const query = category && category !== 'all' ? { category } : {};
    const packages = await Package.find(query).sort({ createdAt: -1 });
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({ success: true, count: packages.length, packages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. إضافة باقة جديدة (محمي للأدمن)
app.post('/api/packages', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const data = req.body || {};
    const catNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    const price = Number(data.price);
    if (!cleanText(data.name, 120) || !catNames[data.category] || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ success: false, message: 'اسم الباقة وتصنيفها وسعر صالح مطلوبة.' });
    }
    if (data.popular !== undefined && typeof data.popular !== 'boolean') {
      return res.status(400).json({ success: false, message: 'قيمة الباقة المميزة غير صالحة.' });
    }

    const newPkg = new Package({
      name: cleanText(data.name, 120),
      category: data.category,
      categoryName: catNames[data.category] || 'سوشيال ميديا',
      price,
      currency: cleanText(data.currency, 12) || 'ج.م',
      period: cleanText(data.period, 40) || 'للباقة',
      popular: data.popular === undefined ? false : data.popular,
      badge: cleanText(data.badge, 40),
      description: cleanText(data.description, 1000),
      features: Array.isArray(data.features) ? data.features.slice(0, 30).map(f => cleanText(f, 200)).filter(Boolean) : cleanText(data.features, 3000).split('\n').map(f => f.trim()).filter(Boolean)
    });

    await newPkg.save();
    res.status(201).json({ success: true, message: 'تم حفظ وإضافة الباقة بنجاح.', package: newPkg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. تعديل باقة قائمة (محمي للأدمن)
app.put('/api/packages/:id', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const input = req.body || {};
    const catNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'معرّف الباقة غير صالح.' });
    const allowedFields = ['name', 'category', 'price', 'currency', 'period', 'popular', 'badge', 'description', 'features'];
    const data = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = input[field];
    }
    if (data.name !== undefined) data.name = cleanText(data.name, 120);
    if (data.category !== undefined) {
      if (!catNames[data.category]) return res.status(400).json({ success: false, message: 'تصنيف الباقة غير صالح.' });
      data.categoryName = catNames[data.category];
    }
    if (data.price !== undefined) {
      data.price = Number(data.price);
      if (!Number.isFinite(data.price) || data.price < 0) return res.status(400).json({ success: false, message: 'سعر الباقة غير صالح.' });
    }
    for (const field of ['currency', 'period', 'badge', 'description']) {
      if (data[field] !== undefined) data[field] = cleanText(data[field], field === 'description' ? 1000 : 80);
    }
    if (data.popular !== undefined && typeof data.popular !== 'boolean') {
      return res.status(400).json({ success: false, message: 'قيمة الباقة المميزة غير صالحة.' });
    }
    if (data.features !== undefined) {
      if (!Array.isArray(data.features) && typeof data.features !== 'string') return res.status(400).json({ success: false, message: 'قائمة مميزات الباقة غير صالحة.' });
      data.features = (Array.isArray(data.features) ? data.features : data.features.split('\n')).slice(0, 30).map(f => cleanText(f, 200)).filter(Boolean);
    }

    const updated = await Package.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: 'الباقة غير موجودة.' });
    res.json({ success: true, message: 'تم تحديث بيانات الباقة بنجاح.', package: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. حذف باقة (محمي للأدمن)
app.delete('/api/packages/:id', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'معرّف الباقة غير صالح.' });
    const deleted = await Package.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'الباقة غير موجودة.' });
    res.json({ success: true, message: 'تم حذف الباقة بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   مسارات الأسعار والإعدادات (Pricing API)
   ========================================================================== */
app.get('/api/pricing', async (req, res) => {
  try {
    if (isDbConnected) {
      const setting = await Setting.findOne({ key: 'pricing' });
      if (setting) return res.json({ success: true, pricing: setting.value });
    }
    res.json({ success: true, pricing: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/pricing', requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { pricing } = req.body;
    await Setting.findOneAndUpdate(
      { key: 'pricing' },
      { key: 'pricing', value: pricing },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'تم حفظ الأسعار في قاعدة البيانات بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/pricing', requireAdmin, requireDatabase, async (req, res) => {
  try {
    await Setting.findOneAndDelete({ key: 'pricing' });
    res.json({ success: true, message: 'تمت استعادة الأسعار الافتراضية بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// تشغيل الخادم محلياً أو تصديره للعمل على Vercel Serverless
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  connectToDatabase();
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 خادم EDGE Creative Studio يعمل بنجاح!`);
    console.log(`🌐 الموقع الرئيسي: http://localhost:${PORT}`);
    console.log(`🔒 لوحة تحكم الأدمن: http://localhost:${PORT}/admin`);
    console.log(`🔑 صفحة تسجيل دخول الأدمن: http://localhost:${PORT}/login`);
    console.log(`======================================================\n`);
  });
} else {
  connectToDatabase();
}

module.exports = app;

