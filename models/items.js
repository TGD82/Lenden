const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  username: { type: String, required: true },
  imagePath: { type: String, required: true },
  price: { type: Number, required: true },
  itemName: { type: String, required: true },
  description: { type: String },
  category: { type: String }
});

module.exports = mongoose.model('Item', itemSchema);
