const { Expense } = require('../schemas/expense')
const { Supplier } = require('../schemas/supplier')
const { logAudit } = require('../utils/audit-log')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function normalizeNullableString(input) {
  if (input === null || input === undefined) return null
  const s = String(input).trim()
  return s ? s : null
}

function normalizeDate(input) {
  if (!input) return new Date()
  const d = new Date(input)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

async function listExpenses(req, res) {
  const shopId = req.params.shopId
  const category = String(req.query.category ?? '').trim()
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()
  const supplierId = String(req.query.supplierId ?? '').trim()

  const filter = { shopId }
  if (category) filter.category = category
  if (supplierId) {
    if (!objectIdRe.test(supplierId)) return res.status(400).json({ error: 'Invalid supplierId' })
    filter.supplierId = supplierId
  }
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) filter.occurredAt = { ...(filter.occurredAt ?? {}), $gte: d }
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) filter.occurredAt = { ...(filter.occurredAt ?? {}), $lte: d }
  }

  const items = await Expense.find(filter).sort({ occurredAt: -1 }).limit(500).lean()
  res.status(200).json({ items })
}

async function createExpense(req, res) {
  const shopId = req.params.shopId
  const userId = String(req.user?.sub ?? '')
  const { category, description, amountCents, occurredAt, supplierId } = req.body ?? {}

  const normalizedCategory = String(category ?? '').trim()
  if (!normalizedCategory) {
    return res.status(400).json({ error: 'category is required' })
  }
  if (!isFiniteNumber(amountCents) || amountCents < 0) {
    return res.status(400).json({ error: 'amountCents must be >= 0' })
  }
  let normalizedSupplierId = String(supplierId ?? '').trim()
  if (normalizedSupplierId && !objectIdRe.test(normalizedSupplierId)) {
    return res.status(400).json({ error: 'Invalid supplierId' })
  }
  if (normalizedSupplierId) {
    const has = await Supplier.findOne({ _id: normalizedSupplierId, shopId }).select({ _id: 1 }).lean()
    if (!has) {
      return res.status(400).json({ error: 'supplier not found' })
    }
  } else {
    normalizedSupplierId = ''
  }

  const item = await Expense.create({
    shopId,
    createdByUserId: userId || 'unknown',
    category: normalizedCategory,
    description: normalizeNullableString(description),
    amountCents: Math.round(amountCents),
    occurredAt: normalizeDate(occurredAt),
    supplierId: normalizedSupplierId || null,
  })

  await logAudit(req, {
    shopId,
    action: 'create',
    entityType: 'expense',
    entityId: String(item._id),
    metadata: { category: item.category, amountCents: item.amountCents },
  })

  res.status(201).json({ item })
}

async function getExpense(req, res) {
  const shopId = req.params.shopId
  const expenseId = req.params.expenseId
  if (!objectIdRe.test(expenseId)) {
    return res.status(400).json({ error: 'Invalid expenseId' })
  }
  const item = await Expense.findOne({ _id: expenseId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function updateExpense(req, res) {
  const shopId = req.params.shopId
  const expenseId = req.params.expenseId
  if (!objectIdRe.test(expenseId)) {
    return res.status(400).json({ error: 'Invalid expenseId' })
  }

  const updates = {}
  const allowed = ['category', 'description', 'amountCents', 'occurredAt', 'supplierId']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('category' in updates) {
    const c = String(updates.category ?? '').trim()
    if (!c) return res.status(400).json({ error: 'category is required' })
    updates.category = c
  }
  if ('description' in updates) {
    updates.description = normalizeNullableString(updates.description)
  }
  if ('amountCents' in updates) {
    if (!isFiniteNumber(updates.amountCents) || updates.amountCents < 0) {
      return res.status(400).json({ error: 'amountCents must be >= 0' })
    }
    updates.amountCents = Math.round(updates.amountCents)
  }
  if ('occurredAt' in updates) {
    updates.occurredAt = normalizeDate(updates.occurredAt)
  }
  if ('supplierId' in updates) {
    const s = updates.supplierId ? String(updates.supplierId).trim() : ''
    if (s && !objectIdRe.test(s)) return res.status(400).json({ error: 'Invalid supplierId' })
    if (s) {
      const has = await Supplier.findOne({ _id: s, shopId }).select({ _id: 1 }).lean()
      if (!has) return res.status(400).json({ error: 'supplier not found' })
      updates.supplierId = s
    } else {
      updates.supplierId = null
    }
  }

  const item = await Expense.findOneAndUpdate({ _id: expenseId, shopId }, { $set: updates }, { new: true }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  await logAudit(req, {
    shopId,
    action: 'update',
    entityType: 'expense',
    entityId: String(expenseId),
    metadata: updates,
  })

  res.status(200).json({ item })
}

async function deleteExpense(req, res) {
  const shopId = req.params.shopId
  const expenseId = req.params.expenseId
  if (!objectIdRe.test(expenseId)) {
    return res.status(400).json({ error: 'Invalid expenseId' })
  }
  const deleted = await Expense.findOneAndDelete({ _id: expenseId, shopId }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }

  await logAudit(req, {
    shopId,
    action: 'delete',
    entityType: 'expense',
    entityId: String(expenseId),
    metadata: {},
  })

  res.status(200).json({ ok: true })
}

module.exports = { listExpenses, createExpense, getExpense, updateExpense, deleteExpense }
