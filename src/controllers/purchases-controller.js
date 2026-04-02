const mongoose = require('mongoose')
const { Purchase } = require('../schemas/purchase')
const { Product } = require('../schemas/product')
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

async function listPurchases(req, res) {
  const shopId = req.params.shopId
  const q = String(req.query.q ?? '').trim()
  const supplierId = String(req.query.supplierId ?? '').trim()
  const status = String(req.query.status ?? '').trim()

  const filter = { shopId }
  if (supplierId) {
    if (!objectIdRe.test(supplierId)) return res.status(400).json({ error: 'Invalid supplierId' })
    filter.supplierId = supplierId
  }
  if (status) {
    if (!['posted', 'voided'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
    filter.status = status
  }
  if (q) {
    const re = { $regex: escapeRegex(q), $options: 'i' }
    const suppliers = await Supplier.find({ shopId, name: re }).select({ _id: 1 }).limit(25).lean()
    const supplierIds = suppliers.map((s) => String(s._id))
    filter.$or = [
      { reference: re },
      { notes: re },
      ...(supplierIds.length > 0 ? [{ supplierId: { $in: supplierIds } }] : []),
    ]
  }

  const items = await Purchase.find(filter).sort({ purchasedAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function createPurchase(req, res) {
  const shopId = req.params.shopId
  const userId = String(req.user?.sub ?? '')
  const { supplierId, reference, notes, purchasedAt, items } = req.body ?? {}

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const normalizedItems = Array.isArray(items) ? items : []
  if (normalizedItems.length === 0) {
    return res.status(400).json({ error: 'items is required' })
  }

  const linesByKey = new Map()
  const productIds = new Set()

  for (const raw of normalizedItems) {
    const productId = String(raw?.productId ?? '').trim()
    const qty = Number(raw?.qty ?? 0)
    const unitCostCentsRaw = raw?.unitCostCents ?? raw?.unitCost ?? 0
    const unitCostCents = Number(unitCostCentsRaw)

    if (!objectIdRe.test(productId)) return res.status(400).json({ error: 'Invalid productId in items' })
    if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'qty must be an integer >= 1' })
    if (!isFiniteNumber(unitCostCents) || unitCostCents < 0) {
      return res.status(400).json({ error: 'unitCostCents must be a number >= 0' })
    }
    if (!Number.isInteger(unitCostCents)) {
      return res.status(400).json({ error: 'unitCostCents must be an integer' })
    }

    const key = `${productId}:${unitCostCents}`
    const existing = linesByKey.get(key)
    linesByKey.set(key, {
      productId,
      qty: (existing?.qty ?? 0) + qty,
      unitCostCents,
    })
    productIds.add(productId)
  }

  const products = await Product.find({ shopId, _id: { $in: Array.from(productIds) } }).select({ name: 1 }).lean()
  const nameById = new Map(products.map((p) => [String(p._id), String(p.name ?? '')]))
  for (const id of productIds) {
    if (!nameById.has(id)) return res.status(400).json({ error: 'One or more products not found' })
  }

  const purchaseItems = []
  let subtotalCents = 0

  for (const line of linesByKey.values()) {
    const name = nameById.get(line.productId) ?? ''
    const lineTotalCents = line.qty * line.unitCostCents
    subtotalCents += lineTotalCents
    purchaseItems.push({
      productId: line.productId,
      name,
      qty: line.qty,
      unitCostCents: line.unitCostCents,
      lineTotalCents,
    })
  }

  const normalizedSupplierId = supplierId ? String(supplierId).trim() : ''
  if (normalizedSupplierId && !objectIdRe.test(normalizedSupplierId)) {
    return res.status(400).json({ error: 'Invalid supplierId' })
  }

  let purchase = null
  const session = await mongoose.startSession()
  try {
    try {
      await session.withTransaction(async () => {
        const created = await Purchase.create(
          [
            {
              shopId,
              supplierId: normalizedSupplierId || null,
              createdByUserId: userId,
              status: 'posted',
              reference: normalizeNullableString(reference),
              notes: normalizeNullableString(notes),
              items: purchaseItems,
              subtotalCents,
              totalCostCents: subtotalCents,
              purchasedAt: normalizeDate(purchasedAt),
            },
          ],
          { session },
        )
        purchase = created?.[0] ?? null

        await Product.bulkWrite(
          purchaseItems.map((i) => ({
            updateOne: {
              filter: { _id: i.productId, shopId },
              update: { $inc: { stockQty: i.qty } },
            },
          })),
          { session },
        )
      })
    } catch (err) {
      const message = String(err?.message ?? '')
      const isTxNotSupported =
        message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set member') ||
        message.includes('mongos')
      if (!isTxNotSupported) throw err

      purchase = await Purchase.create({
        shopId,
        supplierId: normalizedSupplierId || null,
        createdByUserId: userId,
        status: 'posted',
        reference: normalizeNullableString(reference),
        notes: normalizeNullableString(notes),
        items: purchaseItems,
        subtotalCents,
        totalCostCents: subtotalCents,
        purchasedAt: normalizeDate(purchasedAt),
      })

      await Product.bulkWrite(
        purchaseItems.map((i) => ({
          updateOne: {
            filter: { _id: i.productId, shopId },
            update: { $inc: { stockQty: i.qty } },
          },
        })),
      )
    }
  } finally {
    session.endSession()
  }

  if (!purchase) {
    return res.status(500).json({ error: 'Failed to create purchase' })
  }

  await logAudit(req, {
    shopId,
    action: 'create',
    entityType: 'purchase',
    entityId: String(purchase._id),
    metadata: { itemCount: purchaseItems.length, subtotalCents, supplierId: purchase.supplierId },
  })

  res.status(201).json({ item: purchase })
}

async function getPurchase(req, res) {
  const shopId = req.params.shopId
  const purchaseId = req.params.purchaseId
  if (!objectIdRe.test(purchaseId)) {
    return res.status(400).json({ error: 'Invalid purchaseId' })
  }

  const item = await Purchase.findOne({ _id: purchaseId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function voidPurchase(req, res) {
  const shopId = req.params.shopId
  const purchaseId = req.params.purchaseId
  const userId = String(req.user?.sub ?? '')

  if (!objectIdRe.test(purchaseId)) {
    return res.status(400).json({ error: 'Invalid purchaseId' })
  }
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const purchase = await Purchase.findOne({ _id: purchaseId, shopId }).lean()
  if (!purchase) {
    return res.status(404).json({ error: 'Not found' })
  }
  if (purchase.status === 'voided') {
    return res.status(200).json({ item: purchase })
  }

  const qtyToReverseByProductId = new Map()
  for (const item of purchase.items ?? []) {
    const productId = String(item.productId ?? '').trim()
    const qty = Number(item.qty ?? 0)
    if (!objectIdRe.test(productId)) return res.status(409).json({ error: 'Cannot void purchase: invalid productId' })
    if (!Number.isInteger(qty) || qty < 1) return res.status(409).json({ error: 'Cannot void purchase: invalid qty' })
    qtyToReverseByProductId.set(productId, (qtyToReverseByProductId.get(productId) ?? 0) + qty)
  }

  const reverseOps = Array.from(qtyToReverseByProductId.entries()).map(([productId, qty]) => ({
    updateOne: {
      filter: { _id: productId, shopId, stockQty: { $gte: qty } },
      update: { $inc: { stockQty: -qty } },
    },
  }))
  if (reverseOps.length === 0) {
    return res.status(409).json({ error: 'Cannot void purchase: no items to reverse' })
  }

  let updated = null
  const session = await mongoose.startSession()
  try {
    try {
      await session.withTransaction(async () => {
        updated = await Purchase.findOneAndUpdate(
          { _id: purchaseId, shopId, status: 'posted' },
          { $set: { status: 'voided', voidedAt: new Date(), voidedByUserId: userId } },
          { new: true, session },
        ).lean()

        if (!updated) {
          return
        }

        const bulkRes = await Product.bulkWrite(reverseOps, { session })
        if (bulkRes.modifiedCount !== reverseOps.length) {
          const err = new Error('Cannot void purchase: insufficient stock to reverse')
          err.status = 409
          throw err
        }
      })
    } catch (err) {
      const message = String(err?.message ?? '')
      const isTxNotSupported =
        message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set member') ||
        message.includes('mongos')
      if (!isTxNotSupported) throw err

      updated = await Purchase.findOneAndUpdate(
        { _id: purchaseId, shopId, status: 'posted' },
        { $set: { status: 'voided', voidedAt: new Date(), voidedByUserId: userId } },
        { new: true },
      ).lean()

      if (!updated) {
        return
      }

      const bulkRes = await Product.bulkWrite(reverseOps)
      if (bulkRes.modifiedCount !== reverseOps.length) {
        return res.status(409).json({ error: 'Cannot void purchase: insufficient stock to reverse' })
      }
    }
  } finally {
    session.endSession()
  }

  if (!updated) {
    const current = await Purchase.findOne({ _id: purchaseId, shopId }).lean()
    if (!current) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json({ item: current })
  }

  await logAudit(req, {
    shopId,
    action: 'void',
    entityType: 'purchase',
    entityId: String(purchaseId),
    metadata: {},
  })

  res.status(200).json({ item: updated })
}

module.exports = { listPurchases, createPurchase, getPurchase, voidPurchase }
