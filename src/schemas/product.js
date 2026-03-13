const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, default: null, trim: true },
    barcode: { type: String, default: null, trim: true, index: true },
    priceCents: { type: Number, required: true, min: 0 },
    stockQty: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

productSchema.index({ shopId: 1, name: 1 })

const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema)

module.exports = { Product }

