const { Supplier } = require('../schemas/supplier')
const { logAudit } = require('../utils/audit-log')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeName(input) {
  const name = String(input ?? '').trim()
  const key = name.toLowerCase()
  return { name, key }
}

async function listSuppliers(req, res) {
  const shopId = req.params.shopId
  const q = String(req.query.q ?? '').trim()
  const includeInactive = String(req.query.includeInactive ?? '').trim() === '1'

  const filter = { shopId }
  if (!includeInactive) filter.isActive = { $ne: false }
  if (q) {
    const re = { $regex: escapeRegex(q), $options: 'i' }
    filter.$or = [{ name: re }, { email: re }, { phone: re }]
  }

  const items = await Supplier.find(filter).sort({ createdAt: -1 }).limit(500).lean()
  res.status(200).json({ items })
}

async function createSupplier(req, res) {
  const shopId = req.params.shopId
  const { name, email, phone, address, notes } = req.body ?? {}

  const normalized = normalizeName(name)
  if (!normalized.name) {
    return res.status(400).json({ error: 'name is required' })
  }

  const existing = await Supplier.findOne({ shopId, key: normalized.key }).select({ _id: 1 }).lean()
  if (existing) {
    return res.status(409).json({ error: 'Supplier already exists' })
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : ''
  const normalizedPhone = phone ? String(phone).trim() : ''

  const item = await Supplier.create({
    shopId,
    name: normalized.name,
    key: normalized.key,
    email: normalizedEmail || null,
    phone: normalizedPhone || null,
    address: address ? String(address).trim() : null,
    notes: notes ? String(notes).trim() : null,
    isActive: true,
  })

  await logAudit(req, {
    shopId,
    action: 'create',
    entityType: 'supplier',
    entityId: String(item._id),
    metadata: { name: item.name },
  })

  res.status(201).json({ item })
}

async function getSupplier(req, res) {
  const shopId = req.params.shopId
  const supplierId = req.params.supplierId
  if (!objectIdRe.test(supplierId)) {
    return res.status(400).json({ error: 'Invalid supplierId' })
  }

  const item = await Supplier.findOne({ _id: supplierId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function updateSupplier(req, res) {
  const shopId = req.params.shopId
  const supplierId = req.params.supplierId
  if (!objectIdRe.test(supplierId)) {
    return res.status(400).json({ error: 'Invalid supplierId' })
  }

  const updates = {}
  const allowed = ['name', 'email', 'phone', 'address', 'notes', 'isActive']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('name' in updates) {
    const normalized = normalizeName(updates.name)
    if (!normalized.name) {
      return res.status(400).json({ error: 'name is required' })
    }
    updates.name = normalized.name
    updates.key = normalized.key

    const duplicate = await Supplier.findOne({ shopId, key: updates.key, _id: { $ne: supplierId } })
      .select({ _id: 1 })
      .lean()
    if (duplicate) {
      return res.status(409).json({ error: 'Supplier already exists' })
    }
  }

  if ('email' in updates) {
    const normalizedEmail = updates.email ? String(updates.email).trim().toLowerCase() : ''
    updates.email = normalizedEmail || null
  }

  if ('phone' in updates) {
    const normalizedPhone = updates.phone ? String(updates.phone).trim() : ''
    updates.phone = normalizedPhone || null
  }

  if ('address' in updates) {
    updates.address = updates.address ? String(updates.address).trim() : null
  }

  if ('notes' in updates) {
    updates.notes = updates.notes ? String(updates.notes).trim() : null
  }

  if ('isActive' in updates) {
    if (typeof updates.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be boolean' })
    }
  }

  const item = await Supplier.findOneAndUpdate({ _id: supplierId, shopId }, { $set: updates }, { new: true }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  await logAudit(req, {
    shopId,
    action: 'update',
    entityType: 'supplier',
    entityId: String(supplierId),
    metadata: updates,
  })

  res.status(200).json({ item })
}

async function deleteSupplier(req, res) {
  const shopId = req.params.shopId
  const supplierId = req.params.supplierId
  if (!objectIdRe.test(supplierId)) {
    return res.status(400).json({ error: 'Invalid supplierId' })
  }

  const deleted = await Supplier.findOneAndDelete({ _id: supplierId, shopId }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }

  await logAudit(req, {
    shopId,
    action: 'delete',
    entityType: 'supplier',
    entityId: String(supplierId),
    metadata: {},
  })

  res.status(200).json({ ok: true })
}

module.exports = { listSuppliers, createSupplier, getSupplier, updateSupplier, deleteSupplier }
