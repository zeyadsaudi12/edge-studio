const mongoose = require('mongoose');

const PackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['social', 'print', 'branding'],
    required: true
  },
  categoryName: {
    type: String,
    default: 'سوشيال ميديا'
  },
  price: {
    type: Number,
    required: true,
    default: 0
  },
  currency: {
    type: String,
    default: 'ج.م'
  },
  period: {
    type: String,
    default: 'للباقة'
  },
  popular: {
    type: Boolean,
    default: false
  },
  badge: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  features: {
    type: [String],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model('Package', PackageSchema);

