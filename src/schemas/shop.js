const mongoose = require('mongoose')

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    currency: { type: String, default: 'NGN' },
    businessName: { type: String, default: 'ScanSell POS' },
    businessLogoUrl: { type: String, default: null },
    address: { type: String, default: null },
    phone: { type: String, default: null },
  },
  { timestamps: true },
)

const Shop = mongoose.models.Shop ?? mongoose.model('Shop', shopSchema)

module.exports = { Shop }

