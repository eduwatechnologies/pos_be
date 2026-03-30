const mongoose = require('mongoose')

const customerSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

customerSchema.index({ shopId: 1, createdAt: -1 })

const Customer = mongoose.models.Customer ?? mongoose.model('Customer', customerSchema)

module.exports = { Customer }

