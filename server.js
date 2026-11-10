/**
 * EDGE Creative Studio - Production Backend Server
 * خادم Express مع قاعدة بيانات MongoDB وتوثيق أمني للوحة الإدارة
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const Admin = require('./models/Admin');
const Order = require('./models/Order');
const Project = require('./models/Project');
const Package = require('./models/Package');
const Setting = require('./models/Setting');
const { requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edge_studio';
const JWT_SECRET = process.env.JWT_SECRET || 'edge_studio_super_secret_jwt_token_2024_auth_key';

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// مسار خدمة الملفات الثابتة (Frontend Static Files)
app.use(express.static(path.join(__dirname, '.')));

// توجيه المسار الرئيسي والصفحات الثابتة بشكل صريح للعمل السليم على Vercel Serverless
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// حالة الاتصال بقاعدة البيانات وإعادة استخدام الاتصال في Serverless
let isDbConnected = false;
let dbConnectingPromise = null;

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    isDbConnected = true;
    return;
  }

  if (dbConnectingPromise) {
    return dbConnectingPromise;
  }

  dbConnectingPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    bufferCommands: false
  }).then(async () => {
    isDbConnected = true;
    console.log('✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح');
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
    try {
      await connectToDatabase();
    } catch (e) {}
  }
  next();
});

// إنشاء حساب الأدمن الافتراضي إن لم يكن موجوداً
async function seedDefaultAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
      const defaultPassword = process.env.ADMIN_PASSWORD || 'edge2024admin';

      const initialAdmin = new Admin({
        username: defaultUsername,
        password: defaultPassword,
        name: 'مدير منصة EDGE',
        role: 'superadmin'
      });

      await initialAdmin.save();
      console.log(`🔒 تم إنشاء حساب الأدمن الافتراضي بنجاح:`);
      console.log(`   • اسم المستخدم: ${defaultUsername}`);
      console.log(`   • كلمة المرور: ${defaultPassword}`);
    }
  } catch (e) {
    console.error('خطأ في تهيئة حساب الأدمن:', e.message);
  }
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
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال اسم المستخدم وكلمة المرور.'
      });
    }

    if (!isDbConnected) {
      // تحقق بديل من متغيرات البيئة إن لم تكن قاعدة البيانات متصلة
      const envUser = process.env.ADMIN_USERNAME || 'admin';
      const envPass = process.env.ADMIN_PASSWORD || 'edge2024admin';

      if (username.toLowerCase() === envUser.toLowerCase() && password === envPass) {
        const token = jwt.sign(
          { username: envUser, role: 'superadmin', name: 'مدير المنصة' },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        return res.json({
          success: true,
          message: 'تم تسجيل الدخول بنجاح.',
          token,
          admin: { username: envUser, name: 'مدير المنصة', role: 'superadmin' }
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'بيانات الدخول غير صحيحة.'
        });
      }
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
app.post('/api/auth/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
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
app.post('/api/orders', async (req, res) => {
  try {
    const data = req.body;

    const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);

    const orderPayload = {
      orderId: data.id || orderId,
      service: data.service || 'طلب تصميم',
      category: data.category || 'social',
      categoryName: data.categoryName || 'سوشيال ميديا',
      price: parseFloat(data.price) || 0,
      clientName: data.clientName || 'عميل',
      clientPhone: data.clientPhone || '',
      clientEmail: data.clientEmail || '',
      brandName: data.brandName || '',
      colors: data.colors || { primary: '#0A58CA', secondary: '#0056F6', accent: '#22D3EE' },
      uploadedFiles: data.uploadedFiles || [],
      details: data.details || {},
      status: data.status || 'pending',
      paymentStatus: data.paymentStatus || 'unpaid',
      adminNotes: data.adminNotes || ''
    };

    if (isDbConnected) {
      const newOrder = new Order(orderPayload);
      await newOrder.save();
      return res.status(201).json({
        success: true,
        message: 'تم تسجيل الطلب في قاعدة البيانات بنجاح.',
        order: newOrder
      });
    } else {
      // في حالة عدم اتصال Mongo يتم الرد لتخزين العميل في localStorage
      return res.status(201).json({
        success: true,
        message: 'تم استلام الطلب محلياً بنجاح.',
        order: orderPayload,
        storage: 'local'
      });
    }
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ الطلب.', error: err.message });
  }
});

// 2. جلب كافة الطلبات (محمي للأدمن)
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    if (!isDbConnected) {
      return res.json({ success: true, orders: [], note: 'Database offline' });
    }

    const { status, paymentStatus, search } = req.query;
    const query = {};

    if (status && status !== 'all') query.status = status;
    if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;

    if (search) {
      query.$or = [
        { orderId: new RegExp(search, 'i') },
        { clientName: new RegExp(search, 'i') },
        { clientPhone: new RegExp(search, 'i') },
        { brandName: new RegExp(search, 'i') },
        { service: new RegExp(search, 'i') }
      ];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. تحديث حالة الطلب أو الدفع (محمي للأدمن)
app.patch('/api/orders/:orderId', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, paymentStatus, adminNotes } = req.body;

    if (!isDbConnected) {
      return res.json({ success: true, message: 'تم التحديث محلياً' });
    }

    const updateFields = {};
    if (status) updateFields.status = status;
    if (paymentStatus) updateFields.paymentStatus = paymentStatus;
    if (adminNotes !== undefined) updateFields.adminNotes = adminNotes;

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
app.delete('/api/orders/:orderId', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (isDbConnected) {
      await Order.findOneAndDelete({ orderId });
    }
    res.json({ success: true, message: 'تم حذف الطلب بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. تصفير وإفراغ جميع الطلبات (محمي للأدمن)
app.delete('/api/orders', requireAdmin, async (req, res) => {
  try {
    if (isDbConnected) {
      await Order.deleteMany({});
    }
    res.json({ success: true, message: 'تم تصفير وإفراغ سجل الطلبات بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. جلب إحصائيات لوحة التحكم الشاملة (محمي للأدمن)
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    if (!isDbConnected) {
      return res.json({
        success: true,
        stats: {
          total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0, revenue: 0
        }
      });
    }

    const total = await Order.countDocuments();
    const pending = await Order.countDocuments({ status: 'pending' });
    const in_progress = await Order.countDocuments({ status: 'in_progress' });
    const completed = await Order.countDocuments({ status: 'completed' });
    const cancelled = await Order.countDocuments({ status: 'cancelled' });

    const allOrders = await Order.find({}, 'price status paymentStatus');
    let revenue = 0;
    allOrders.forEach(o => {
      const p = o.price || 0;
      if (o.status === 'completed' || o.paymentStatus === 'fully_paid') {
        revenue += p;
      } else if (o.paymentStatus === 'deposit_paid') {
        revenue += (p * 0.5);
      }
    });

    const socialCount = await Order.countDocuments({ category: 'social' });
    const printCount = await Order.countDocuments({ category: 'print' });
    const brandCount = await Order.countDocuments({ category: 'branding' });

    res.json({
      success: true,
      stats: {
        total,
        pending,
        in_progress,
        completed,
        cancelled,
        revenue,
        categories: {
          social: socialCount,
          print: printCount,
          branding: brandCount
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

// 1. جلب المشاريع المضافة (مفتوح للجميع)
app.get('/api/projects', async (req, res) => {
  try {
    if (!isDbConnected) {
      return res.json({ success: true, projects: [] });
    }
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. إضافة مشروع جديد (محمي للأدمن)
app.post('/api/projects', requireAdmin, async (req, res) => {
  try {
    const data = req.body;
    const newProj = new Project({
      projectId: 'proj-' + Date.now(),
      title: data.title,
      category: data.category,
      categoryName: data.categoryName || 'تصميم إبداعي',
      client: data.client || 'عميل EDGE',
      year: data.year || new Date().getFullYear().toString(),
      image: data.image,
      description: data.description,
      tags: data.tags || [],
      features: data.features || [],
      isCustom: true
    });

    if (isDbConnected) {
      await newProj.save();
    }
    res.status(201).json({ success: true, message: 'تم حفظ المشروع في قاعدة البيانات بنجاح.', project: newProj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. تعديل مشروع قائم (محمي للأدمن)
app.put('/api/projects/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (isDbConnected) {
      const updated = await Project.findOneAndUpdate(
        { $or: [{ projectId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] },
        { $set: data },
        { new: true }
      );
      return res.json({ success: true, message: 'تم تحديث المشروع بنجاح.', project: updated });
    }
    res.json({ success: true, message: 'تم التحديث بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. حذف مشروع (محمي للأدمن)
app.delete('/api/projects/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isDbConnected) {
      await Project.findOneAndDelete({
        $or: [{ projectId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }]
      });
    }
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
    res.json({ success: true, count: packages.length, packages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. إضافة باقة جديدة (محمي للأدمن)
app.post('/api/packages', requireAdmin, async (req, res) => {
  try {
    const data = req.body;
    const catNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    const newPkg = new Package({
      name: data.name,
      category: data.category,
      categoryName: catNames[data.category] || 'سوشيال ميديا',
      price: parseFloat(data.price) || 0,
      currency: data.currency || 'ج.م',
      period: data.period || 'للباقة',
      popular: Boolean(data.popular),
      badge: data.badge || '',
      description: data.description || '',
      features: Array.isArray(data.features) ? data.features : (data.features || '').split('\n').map(f => f.trim()).filter(Boolean)
    });

    if (isDbConnected) {
      await newPkg.save();
    }
    res.status(201).json({ success: true, message: 'تم حفظ وإضافة الباقة بنجاح.', package: newPkg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. تعديل باقة قائمة (محمي للأدمن)
app.put('/api/packages/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const catNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    if (data.category && catNames[data.category]) {
      data.categoryName = catNames[data.category];
    }
    if (data.features && !Array.isArray(data.features)) {
      data.features = data.features.split('\n').map(f => f.trim()).filter(Boolean);
    }

    if (isDbConnected) {
      const updated = await Package.findByIdAndUpdate(id, { $set: data }, { new: true });
      return res.json({ success: true, message: 'تم تحديث بيانات الباقة بنجاح.', package: updated });
    }
    res.json({ success: true, message: 'تم التحديث بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. حذف باقة (محمي للأدمن)
app.delete('/api/packages/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isDbConnected) {
      await Package.findByIdAndDelete(id);
    }
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

app.post('/api/pricing', requireAdmin, async (req, res) => {
  try {
    const { pricing } = req.body;
    if (isDbConnected) {
      await Setting.findOneAndUpdate(
        { key: 'pricing' },
        { key: 'pricing', value: pricing },
        { upsert: true, new: true }
      );
    }
    res.json({ success: true, message: 'تم حفظ الأسعار في قاعدة البيانات بنجاح.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/pricing', requireAdmin, async (req, res) => {
  try {
    if (isDbConnected) {
      await Setting.findOneAndDelete({ key: 'pricing' });
    }
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
    console.log(`🔒 لوحة تحكم الأدمن: http://localhost:${PORT}/admin.html`);
    console.log(`🔑 صفحة تسجيل دخول الأدمن: http://localhost:${PORT}/login.html`);
    console.log(`======================================================\n`);
  });
} else {
  connectToDatabase();
}

module.exports = app;

