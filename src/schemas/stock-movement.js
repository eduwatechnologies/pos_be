const mongoose = require('mongoose')

const stockMovementSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    qtyDelta: { type: Number, required: true },
    sourceType: { type: String, required: true, trim: true, index: true },
    sourceId: { type: String, required: true, trim: true, index: true },
    unitPriceCents: { type: Number, default: null },
    unitCostCents: { type: Number, default: null },
    notes: { type: String, default: null, trim: true },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true },
)

stockMovementSchema.index({ shopId: 1, productId: 1, occurredAt: -1 })

const StockMovement = mongoose.models.StockMovement ?? mongoose.model('StockMovement', stockMovementSchema)

module.exports = { StockMovement }
