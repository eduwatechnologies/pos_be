const { AuditLog } = require('../schemas/audit-log')

async function listAuditLogs(req, res) {
  const shopId = req.params.shopId
  const entityType = String(req.query.entityType ?? '').trim()
  const action = String(req.query.action ?? '').trim()
  const userId = String(req.query.userId ?? '').trim()
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const filter = { shopId }
  if (entityType) filter.entityType = entityType
  if (action) filter.action = action
  if (userId) filter.userId = userId
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) filter.occurredAt = { ...(filter.occurredAt ?? {}), $gte: d }
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) filter.occurredAt = { ...(filter.occurredAt ?? {}), $lte: d }
  }

  const items = await AuditLog.find(filter).sort({ occurredAt: -1 }).limit(500).lean()
  res.status(200).json({ items })
}

module.exports = { listAuditLogs }
