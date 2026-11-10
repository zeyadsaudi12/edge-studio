const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  projectId: {
    type: String,
    unique: true,
    index: true
  },
  title: {
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
    required: true
  },
  client: {
    type: String,
    trim: true,
    default: 'عميل EDGE'
  },
  year: {
    type: String,
    default: () => new Date().getFullYear().toString()
  },
  image: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  tags: {
    type: [String],
    default: []
  },
  features: {
    type: [String],
    default: []
  },
  isCustom: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema);

