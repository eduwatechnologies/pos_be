const mongoose = require('mongoose')

const storeSubscriptionSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'canceled'],
      default: 'active',
      index: true,
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
  },
  { timestamps: true },
)

storeSubscriptionSchema.index({ shopId: 1, status: 1 })

const StoreSubscription =
  mongoose.models.StoreSubscription ?? mongoose.model('StoreSubscription', storeSubscriptionSchema)

module.exports = { StoreSubscription }

