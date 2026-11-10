const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  service: {
    type: String,
    default: 'طلب تصميم إبداعي'
  },
  category: {
    type: String,
    enum: ['social', 'print', 'branding', 'custom'],
    default: 'social'
  },
  categoryName: {
    type: String,
    default: 'سوشيال ميديا'
  },
  price: {
    type: Number,
    default: 0
  },
  clientName: {
    type: String,
    default: 'عميل استوديو EDGE',
    trim: true
  },
  clientPhone: {
    type: String,
    default: 'غير مسجل',
    trim: true
  },
  clientEmail: {
    type: String,
    trim: true,
    default: ''
  },
  brandName: {
    type: String,
    trim: true,
    default: ''
  },
  colors: {
    primary: { type: String, default: '#0A58CA' },
    secondary: { type: String, default: '#0056F6' },
    accent: { type: String, default: '#22D3EE' }
  },
  uploadedFiles: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'deposit_paid', 'fully_paid'],
    default: 'unpaid'
  },
  adminNotes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);

