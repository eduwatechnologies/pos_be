const mongoose = require('mongoose')

const invoiceSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StoreSubscription',
      required: true,
      index: true,
    },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true, index: true },
    currency: { type: String, default: 'NGN' },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['unpaid', 'paid', 'void'], default: 'unpaid', index: true },
    paymentProvider: { type: String, default: null, index: true },
    paymentReference: { type: String, default: null, index: true },
    paymentMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true },
)

invoiceSchema.index({ shopId: 1, status: 1, createdAt: -1 })

const Invoice = mongoose.models.Invoice ?? mongoose.model('Invoice', invoiceSchema)

module.exports = { Invoice }
