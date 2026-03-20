const mongoose = require('mongoose')

const categorySchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

categorySchema.index({ shopId: 1, key: 1 }, { unique: true })

const Category = mongoose.models.Category ?? mongoose.model('Category', categorySchema)

module.exports = { Category }

