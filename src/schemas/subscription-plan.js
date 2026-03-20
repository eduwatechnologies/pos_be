const mongoose = require('mongoose')

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true },
    currency: { type: String, default: 'NGN' },
    priceMonthly: { type: Number, required: true, min: 0 },
    features: { type: Object, default: () => ({}) },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ?? mongoose.model('SubscriptionPlan', subscriptionPlanSchema)

module.exports = { SubscriptionPlan }

