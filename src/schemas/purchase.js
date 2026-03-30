const mongoose = require('mongoose')

const purchaseItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitCostCents: { type: Number, required: true, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const purchaseSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    supplierId: { type: String, default: null, index: true },
    createdByUserId: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: ['posted', 'voided'], default: 'posted', index: true },
    reference: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    items: { type: [purchaseItemSchema], default: [] },
    subtotalCents: { type: Number, required: true, min: 0 },
    totalCostCents: { type: Number, required: true, min: 0 },
    purchasedAt: { type: Date, required: true, default: Date.now, index: true },
    voidedAt: { type: Date, default: null },
    voidedByUserId: { type: String, default: null },
  },
  { timestamps: true },
)

purchaseSchema.index({ shopId: 1, purchasedAt: -1 })
purchaseSchema.index({ shopId: 1, supplierId: 1, purchasedAt: -1 })

const Purchase = mongoose.models.Purchase ?? mongoose.model('Purchase', purchaseSchema)

module.exports = { Purchase }
