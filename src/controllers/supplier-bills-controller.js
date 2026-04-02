const { SupplierBill } = require('../schemas/supplier-bill')
const { Supplier } = require('../schemas/supplier')
const { logAudit } = require('../utils/audit-log')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

async function listBills(req, res) {
  const shopId = req.params.shopId
  const status = String(req.query.status ?? '').trim()
  const supplierId = String(req.query.supplierId ?? '').trim()
  const q = String(req.query.q ?? '').trim()

  const filter = { shopId }
  if (status) {
    if (!['unpaid', 'partially_paid', 'paid', 'voided'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    filter.status = status
  }
  if (supplierId) {
    if (!objectIdRe.test(supplierId)) return res.status(400).json({ error: 'Invalid supplierId' })
    filter.supplierId = supplierId
  }
  if (q) {
    filter.$or = [{ reference: { $regex: escapeRegex(q), $options: 'i' } }, { notes: { $regex: escapeRegex(q), $options: 'i' } }]
  }

  const items = await SupplierBill.find(filter).sort({ dueDate: 1, createdAt: -1 }).limit(500).lean()
  res.status(200).json({ items })
}

async function createBill(req, res) {
  const shopId = req.params.shopId
  const userId = String(req.user?.sub ?? '')
  const { supplierId, reference, dueDate, items, notes, sourceType, sourceId } = req.body ?? {}

  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  const normalizedSupplierId = supplierId ? String(supplierId).trim() : ''
  if (!objectIdRe.test(normalizedSupplierId)) return res.status(400).json({ error: 'Invalid supplierId' })
  const hasSupplier = await Supplier.findOne({ _id: normalizedSupplierId, shopId }).select({ _id: 1 }).lean()
  if (!hasSupplier) return res.status(400).json({ error: 'supplier not found' })

  const normalizedItems = Array.isArray(items) ? items : []
  if (normalizedItems.length === 0) return res.status(400).json({ error: 'items is required' })

  const lines = []
  let subtotalCents = 0
  for (const raw of normalizedItems) {
    const description = String(raw?.description ?? '').trim()
    const qty = Number(raw?.qty ?? 0)
    const unitCostCents = Number(raw?.unitCostCents ?? 0)
    const productId = raw?.productId ? String(raw.productId).trim() : ''
    if (!description) return res.status(400).json({ error: 'item.description is required' })
    if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'item.qty must be integer >= 1' })
    if (!Number.isInteger(unitCostCents) || unitCostCents < 0) return res.status(400).json({ error: 'item.unitCostCents must be integer >= 0' })
    if (productId && !objectIdRe.test(productId)) return res.status(400).json({ error: 'Invalid item.productId' })
    const lineTotalCents = qty * unitCostCents
    subtotalCents += lineTotalCents
    lines.push({ productId: productId || null, description, qty, unitCostCents, lineTotalCents })
  }

  const bill = await SupplierBill.create({
    shopId,
    supplierId: normalizedSupplierId,
    reference: String(reference ?? '').trim() || `BILL-${Date.now()}`,
    status: 'unpaid',
    items: lines,
    subtotalCents,
    totalCents: subtotalCents,
    paidCents: 0,
    dueDate: normalizeDate(dueDate),
    payments: [],
    notes: normalizeNullableString(notes),
    sourceType: String(sourceType ?? 'manual').trim() || 'manual',
    sourceId: sourceId ? String(sourceId).trim() : null,
    createdByUserId: userId,
  })

  await logAudit(req, {
    shopId,
    action: 'create',
    entityType: 'supplier_bill',
    entityId: String(bill._id),
    metadata: { supplierId: bill.supplierId, subtotalCents: bill.subtotalCents, dueDate: bill.dueDate },
  })

  res.status(201).json({ item: bill })
}

async function getBill(req, res) {
  const shopId = req.params.shopId
  const billId = req.params.billId
  if (!objectIdRe.test(billId)) return res.status(400).json({ error: 'Invalid billId' })
  const item = await SupplierBill.findOne({ _id: billId, shopId }).lean()
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.status(200).json({ item })
}

async function voidBill(req, res) {
  const shopId = req.params.shopId
  const billId = req.params.billId
  const userId = String(req.user?.sub ?? '')
  if (!objectIdRe.test(billId)) return res.status(400).json({ error: 'Invalid billId' })
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  const updated = await SupplierBill.findOneAndUpdate(
    { _id: billId, shopId, status: { $ne: 'paid' } },
    { $set: { status: 'voided', voidedAt: new Date(), voidedByUserId: userId } },
    { new: true },
  ).lean()
  if (!updated) return res.status(404).json({ error: 'Not found or already paid' })
  await logAudit(req, { shopId, action: 'void', entityType: 'supplier_bill', entityId: String(billId), metadata: {} })
  res.status(200).json({ item: updated })
}

async function payBill(req, res) {
  const shopId = req.params.shopId
  const billId = req.params.billId
  const userId = String(req.user?.sub ?? '')
  const { amountCents, method, paidAt, reference, notes } = req.body ?? {}
  if (!objectIdRe.test(billId)) return res.status(400).json({ error: 'Invalid billId' })
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (!isFiniteNumber(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amountCents must be > 0' })
  const normalizedMethod = String(method ?? '').trim()
  if (!normalizedMethod) return res.status(400).json({ error: 'method is required' })

  const bill = await SupplierBill.findOne({ _id: billId, shopId }).lean()
  if (!bill) return res.status(404).json({ error: 'Not found' })
  if (bill.status === 'voided') return res.status(400).json({ error: 'Cannot pay a voided bill' })

  const newPaid = bill.paidCents + Math.round(Number(amountCents))
  const newStatus = newPaid >= bill.totalCents ? 'paid' : 'partially_paid'
  const payment = {
    amountCents: Math.round(Number(amountCents)),
    method: normalizedMethod,
    paidAt: normalizeDate(paidAt),
    reference: normalizeNullableString(reference),
    notes: normalizeNullableString(notes),
    createdByUserId: userId,
  }

  const updated = await SupplierBill.findOneAndUpdate(
    { _id: billId, shopId },
    { $set: { paidCents: newPaid, status: newStatus }, $push: { payments: payment } },
    { new: true },
  ).lean()

  await logAudit(req, {
    shopId,
    action: 'pay',
    entityType: 'supplier_bill',
    entityId: String(billId),
    metadata: { amountCents: payment.amountCents, method: payment.method },
  })

  res.status(200).json({ item: updated })
}

module.exports = { listBills, createBill, getBill, voidBill, payBill }
