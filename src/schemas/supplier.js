const mongoose = require('mongoose')

const supplierSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, index: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

supplierSchema.index({ shopId: 1, key: 1 }, { unique: true })
supplierSchema.index({ shopId: 1, createdAt: -1 })

const Supplier = mongoose.models.Supplier ?? mongoose.model('Supplier', supplierSchema)

module.exports = { Supplier }
