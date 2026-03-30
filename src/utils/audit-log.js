const { AuditLog } = require('../schemas/audit-log')

async function logAudit(req, { shopId, action, entityType, entityId, metadata }) {
  try {
    const userId = String(req?.user?.sub ?? '')
    const ip = req?.ip ? String(req.ip) : null
    const userAgent = req?.headers?.['user-agent'] ? String(req.headers['user-agent']) : null
    const occurredAt = new Date()
    await AuditLog.create({
      shopId,
      userId: userId || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      ip,
      userAgent,
      occurredAt,
    })
  } catch {
  }
}

module.exports = { logAudit }
