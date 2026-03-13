const mongoose = require('mongoose')

const receiptItemSchema = new mongoose.Schema(
  {
    productId: { type: String, default: null },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const receiptSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    cashierUserId: { type: String, required: true, index: true },
    customerName: { type: String, default: null },
    paymentMethod: { type: String, required: true, enum: ['cash', 'card', 'transfer', 'other'] },
    status: { type: String, required: true, enum: ['paid', 'refunded'], default: 'paid' },
    items: { type: [receiptItemSchema], default: [] },
    subtotalCents: { type: Number, required: true, min: 0 },
    taxCents: { type: Number, required: true, min: 0, default: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true, default: Date.now, index: true },
    refundedAt: { type: Date, default: null },
    refundReason: { type: String, default: null },
  },
  { timestamps: true },
)

receiptSchema.index({ shopId: 1, paidAt: -1 })

const Receipt = mongoose.models.Receipt ?? mongoose.model('Receipt', receiptSchema)

module.exports = { Receipt }

