const mongoose = require('mongoose')

const expenseSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    createdByUserId: { type: String, required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    amountCents: { type: Number, required: true, min: 0 },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    supplierId: { type: String, default: null, index: true },
  },
  { timestamps: true },
)

expenseSchema.index({ shopId: 1, occurredAt: -1 })

const Expense = mongoose.models.Expense ?? mongoose.model('Expense', expenseSchema)

module.exports = { Expense }
