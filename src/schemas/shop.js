const mongoose = require('mongoose')

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    currency: { type: String, default: 'NGN' },
    businessName: { type: String, default: 'ScanSell POS' },
    businessLogoUrl: { type: String, default: null },
    address: { type: String, default: null },
    phone: { type: String, default: null },
    taxRateBps: { type: Number, default: 800, min: 0, max: 10000 },
    allowNegativeStock: { type: Boolean, default: false },
    rolePermissions: {
      type: Object,
      default: () => ({
        admin: {
          dashboard: true,
          terminal: true,
          customers: true,
          receipts: true,
          analytics: true,
          inventory: true,
          employees: true,
          settings: true,
        },
        cashier: {
          dashboard: true,
          terminal: true,
          customers: false,
          receipts: true,
          analytics: false,
          inventory: false,
          employees: false,
          settings: false,
        },
      }),
    },
  },
  { timestamps: true },
)

const Shop = mongoose.models.Shop ?? mongoose.model('Shop', shopSchema)

module.exports = { Shop }

