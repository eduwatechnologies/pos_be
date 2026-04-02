const mongoose = require('mongoose')

const billItemSchema = new mongoose.Schema(
  {
    productId: { type: String, default: null, index: true },
    description: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    unitCostCents: { type: Number, required: true, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const paymentSchema = new mongoose.Schema(
  {
    amountCents: { type: Number, required: true, min: 1 },
    method: { type: String, required: true, trim: true },
    paidAt: { type: Date, required: true, default: Date.now },
    reference: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    createdByUserId: { type: String, required: true, index: true },
  },
  { _id: false },
)

const supplierBillSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    supplierId: { type: String, required: true, index: true },
    reference: { type: String, required: true, trim: true },
    status: { type: String, enum: ['unpaid', 'partially_paid', 'paid', 'voided'], default: 'unpaid', index: true },
    items: { type: [billItemSchema], default: [] },
    subtotalCents: { type: Number, required: true, min: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    paidCents: { type: Number, required: true, default: 0, min: 0 },
    dueDate: { type: Date, required: true, index: true },
    payments: { type: [paymentSchema], default: [] },
    notes: { type: String, default: null, trim: true },
    sourceType: { type: String, default: 'manual', trim: true, index: true },
    sourceId: { type: String, default: null, trim: true, index: true },
    createdByUserId: { type: String, required: true, index: true },
    voidedAt: { type: Date, default: null },
    voidedByUserId: { type: String, default: null },
  },
  { timestamps: true },
)

supplierBillSchema.index({ shopId: 1, supplierId: 1, dueDate: 1 })

const SupplierBill =
  mongoose.models.SupplierBill ?? mongoose.model('SupplierBill', supplierBillSchema)

module.exports = { SupplierBill }
