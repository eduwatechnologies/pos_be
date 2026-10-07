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
    cashierUserId: { type: String, default: null, index: true },
    customerId: { type: String, default: null, index: true },
    customerName: { type: String, default: null },
    customerPhone: { type: String, default: null },
    customerEmail: { type: String, default: null },
    paymentMethod: { type: String, required: true, enum: ['cash', 'card', 'transfer', 'other'] },
    source: { type: String, default: 'pos', enum: ['pos', 'online', 'manual'] },
    status: { type: String, required: true, enum: ['paid', 'refunded'], default: 'paid' },
    orderStatus: {
      type: String,
      default: 'pending',
      enum: ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'completed', 'canceled'],
    },
    items: { type: [receiptItemSchema], default: [] },
    subtotalCents: { type: Number, required: true, min: 0 },
    discountCents: { type: Number, required: true, min: 0, default: 0 },
    taxCents: { type: Number, required: true, min: 0, default: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true, default: Date.now, index: true },
    refundedAt: { type: Date, default: null },
    refundReason: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true },
)

receiptSchema.index({ shopId: 1, paidAt: -1 })
receiptSchema.index({ shopId: 1, customerId: 1, paidAt: -1 })

const Receipt = mongoose.models.Receipt ?? mongoose.model('Receipt', receiptSchema)

module.exports = { Receipt }
