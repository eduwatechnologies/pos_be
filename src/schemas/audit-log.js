const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, default: null, index: true },
    metadata: { type: Object, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true },
)

auditLogSchema.index({ shopId: 1, occurredAt: -1 })

const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema)

module.exports = { AuditLog }
