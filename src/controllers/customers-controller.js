const { Customer } = require('../schemas/customer')
const { Receipt } = require('../schemas/receipt')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listCustomers(req, res) {
  const shopId = req.params.shopId
  const q = String(req.query.q ?? '').trim()

  const filter = { shopId }
  if (q) {
    const re = { $regex: escapeRegex(q), $options: 'i' }
    filter.$or = [{ name: re }, { email: re }, { phone: re }]
  }

  const items = await Customer.find(filter).sort({ createdAt: -1 }).limit(500).lean()
  res.status(200).json({ items })
}

async function createCustomer(req, res) {
  const shopId = req.params.shopId
  const { name, email, phone, address, notes } = req.body ?? {}

  const normalizedName = String(name ?? '').trim()
  if (!normalizedName) {
    return res.status(400).json({ error: 'name is required' })
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : ''
  const normalizedPhone = phone ? String(phone).trim() : ''

  if (normalizedEmail) {
    const existing = await Customer.findOne({ shopId, email: normalizedEmail }).select({ _id: 1 }).lean()
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' })
    }
  }

  const item = await Customer.create({
    shopId,
    name: normalizedName,
    email: normalizedEmail || null,
    phone: normalizedPhone || null,
    address: address ? String(address).trim() : null,
    notes: notes ? String(notes).trim() : null,
    isActive: true,
  })

  res.status(201).json({ item })
}

async function getCustomer(req, res) {
  const shopId = req.params.shopId
  const customerId = req.params.customerId
  if (!objectIdRe.test(customerId)) {
    return res.status(400).json({ error: 'Invalid customerId' })
  }

  const item = await Customer.findOne({ _id: customerId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

async function updateCustomer(req, res) {
  const shopId = req.params.shopId
  const customerId = req.params.customerId
  if (!objectIdRe.test(customerId)) {
    return res.status(400).json({ error: 'Invalid customerId' })
  }

  const updates = {}
  const allowed = ['name', 'email', 'phone', 'address', 'notes', 'isActive']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('name' in updates) {
    const normalizedName = String(updates.name ?? '').trim()
    if (!normalizedName) return res.status(400).json({ error: 'name is required' })
    updates.name = normalizedName
  }

  if ('email' in updates) {
    const normalizedEmail = updates.email ? String(updates.email).trim().toLowerCase() : ''
    if (normalizedEmail) {
      const existing = await Customer.findOne({ shopId, email: normalizedEmail, _id: { $ne: customerId } })
        .select({ _id: 1 })
        .lean()
      if (existing) return res.status(409).json({ error: 'Email already exists' })
      updates.email = normalizedEmail
    } else {
      updates.email = null
    }
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

  const item = await Customer.findOneAndUpdate({ _id: customerId, shopId }, { $set: updates }, { new: true }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

async function deleteCustomer(req, res) {
  const shopId = req.params.shopId
  const customerId = req.params.customerId
  if (!objectIdRe.test(customerId)) {
    return res.status(400).json({ error: 'Invalid customerId' })
  }

  const deleted = await Customer.findOneAndDelete({ _id: customerId, shopId }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ ok: true })
}

async function getCustomerActivity(req, res) {
  const shopId = req.params.shopId
  const customerId = req.params.customerId
  if (!objectIdRe.test(customerId)) {
    return res.status(400).json({ error: 'Invalid customerId' })
  }

  const customer = await Customer.findOne({ _id: customerId, shopId }).lean()
  if (!customer) {
    return res.status(404).json({ error: 'Not found' })
  }

  const name = String(customer?.name ?? '').trim()
  const nameRegex = name ? new RegExp(`^${escapeRegex(name)}$`, 'i') : null

  const receiptFilter = { shopId, $or: [{ customerId: String(customerId) }] }
  if (nameRegex) receiptFilter.$or.push({ customerName: nameRegex })

  const receipts = await Receipt.find(receiptFilter).sort({ paidAt: -1 }).limit(300).lean()

  const paidReceipts = receipts.filter((r) => String(r?.status ?? 'paid') !== 'refunded')
  const totalSpentCents = paidReceipts.reduce((sum, r) => sum + Number(r?.totalCents ?? 0), 0)
  const totalOrders = paidReceipts.length
  const refundedCount = receipts.length - paidReceipts.length
  const lastPurchaseAt = paidReceipts.length ? paidReceipts[0]?.paidAt ?? null : null

  res.status(200).json({
    customer,
    receipts,
    summary: { totalOrders, totalSpentCents, refundedCount, lastPurchaseAt },
  })
}

module.exports = { listCustomers, createCustomer, getCustomer, updateCustomer, deleteCustomer, getCustomerActivity }
