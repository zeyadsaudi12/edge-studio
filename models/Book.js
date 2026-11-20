const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
  bookId: {
    type: String,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  cover: {
    type: String,
    required: true
  },
  pdfUrl: {
    type: String,
    required: true
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Book', BookSchema);
