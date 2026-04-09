const mongoose = require('mongoose')
const { Receipt } = require('../schemas/receipt')
const { Product } = require('../schemas/product')
const { Shop } = require('../schemas/shop')
const { StockMovement } = require('../schemas/stock-movement')
const { Customer } = require('../schemas/customer')
const { logAudit } = require('../utils/audit-log')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listReceipts(req, res) {
  const shopId = req.params.shopId

  const paymentMethod = String(req.query.paymentMethod ?? '').trim()
  const customerId = String(req.query.customerId ?? '').trim()
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()
  const q = String(req.query.q ?? '').trim()

  const filter = { shopId }
  if (paymentMethod) filter.paymentMethod = paymentMethod
  if (customerId) {
    if (!objectIdRe.test(customerId)) return res.status(400).json({ error: 'Invalid customerId' })
    filter.customerId = customerId
  }

  if (from || to) {
    filter.paidAt = {}
    if (from) filter.paidAt.$gte = new Date(from)
    if (to) filter.paidAt.$lte = new Date(to)
  }

  if (q) {
    const or = [{ customerName: { $regex: escapeRegex(q), $options: 'i' } }]
    if (objectIdRe.test(q)) {
      or.push({ _id: q })
    }
    filter.$or = or
  }

  const items = await Receipt.find(filter).sort({ paidAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function createReceipt(req, res) {
  const shopId = req.params.shopId
  const cashierUserId = req.user.sub

  const { items, customerId, customerName, paymentMethod, taxCents, discountCents } = req.body ?? {}
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' })
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' })
  }
  const normalizedPaymentMethod = String(paymentMethod).trim().toLowerCase() === 'digital' ? 'transfer' : String(paymentMethod).trim().toLowerCase()
  if (!['cash', 'card', 'transfer', 'other'].includes(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Invalid paymentMethod' })
  }

  const normalizedCustomerId = customerId ? String(customerId).trim() : ''
  if (normalizedCustomerId) {
    if (!objectIdRe.test(normalizedCustomerId)) {
      return res.status(400).json({ error: 'Invalid customerId' })
    }
    const exists = await Customer.findOne({ _id: normalizedCustomerId, shopId }).select({ _id: 1 }).lean()
    if (!exists) {
      return res.status(404).json({ error: 'Customer not found' })
    }
  }

  const incomingItems = items.slice(0, 200)
  const productIds = incomingItems.map((i) => i?.productId).filter(Boolean)
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds }, shopId }).lean()
    : []
  const productsById = new Map(products.map((p) => [String(p._id), p]))

  const normalizedItems = []
  for (const raw of incomingItems) {
    const qty = Number(raw?.qty ?? 0)
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Each item must have qty >= 1' })
    }

    const productId = raw?.productId ? String(raw.productId) : null
    const product = productId ? productsById.get(productId) : null
    if (productId && !product) {
      return res.status(400).json({ error: 'One or more products not found' })
    }

    const name = String(raw?.name ?? product?.name ?? '').trim()
    if (!name) {
      return res.status(400).json({ error: 'Each item must have a name' })
    }

    const unitPriceCents = Number(raw?.unitPriceCents ?? product?.priceCents ?? NaN)
    if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
      return res.status(400).json({ error: 'Each item must have unitPriceCents >= 0' })
    }

    normalizedItems.push({
      productId,
      name,
      qty,
      unitPriceCents,
      lineTotalCents: unitPriceCents * qty,
    })
  }

  const subtotalCents = normalizedItems.reduce((sum, i) => sum + i.lineTotalCents, 0)
  const safeTaxCents = Number.isFinite(Number(taxCents)) && Number(taxCents) >= 0 ? Number(taxCents) : 0
  const safeDiscountCents = Number.isFinite(Number(discountCents)) && Number(discountCents) >= 0 ? Number(discountCents) : 0
  if (safeDiscountCents > subtotalCents) {
    return res.status(400).json({ error: 'discountCents must be <= subtotalCents' })
  }
  const totalCents = subtotalCents - safeDiscountCents + safeTaxCents

  const shop = await Shop.findById(shopId).select({ allowNegativeStock: 1 }).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }
  const allowNegativeStock = shop.allowNegativeStock === true

  const qtyByProductId = new Map()
  for (const i of normalizedItems) {
    const productId = i.productId ? String(i.productId) : ''
    if (!productId) continue
    if (!objectIdRe.test(productId)) return res.status(400).json({ error: 'Invalid productId in items' })
    qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + Number(i.qty ?? 0))
  }

  const stockOps = Array.from(qtyByProductId.entries()).map(([productId, qty]) => ({
    updateOne: {
      filter: allowNegativeStock ? { _id: productId, shopId } : { _id: productId, shopId, stockQty: { $gte: qty } },
      update: { $inc: { stockQty: -qty } },
    },
  }))

  const receiptData = {
    shopId,
    cashierUserId,
    customerId: normalizedCustomerId || null,
    customerName: customerName ? String(customerName) : null,
    paymentMethod: normalizedPaymentMethod,
    items: normalizedItems,
    subtotalCents,
    discountCents: safeDiscountCents,
    taxCents: safeTaxCents,
    totalCents,
    paidAt: new Date(),
    status: 'paid',
  }

  let receipt = null
  const session = await mongoose.startSession()
  try {
    try {
      await session.withTransaction(async () => {
        if (stockOps.length) {
          const bulkRes = await Product.bulkWrite(stockOps, { session })
          if (!allowNegativeStock && bulkRes.modifiedCount !== stockOps.length) {
            const err = new Error('Insufficient stock')
            err.status = 409
            throw err
          }
        }

        const created = await Receipt.create([receiptData], { session })
        receipt = created?.[0] ?? null

        if (receipt) {
          const movements = normalizedItems
            .filter((i) => i.productId)
            .map((i) => ({
              shopId,
              productId: String(i.productId),
              type: 'sale',
              qtyDelta: -Number(i.qty ?? 0),
              sourceType: 'receipt',
              sourceId: String(receipt._id),
              unitPriceCents: Number(i.unitPriceCents ?? 0),
              unitCostCents: null,
              notes: null,
              occurredAt: receipt.paidAt ?? new Date(),
            }))
          if (movements.length) {
            try {
              await StockMovement.insertMany(movements, { session })
            } catch {}
          }
        }
      })
    } catch (err) {
      const errStatus = typeof err?.status === 'number' ? err.status : null
      if (errStatus === 409) {
        return res.status(409).json({ error: 'Insufficient stock' })
      }

      const message = String(err?.message ?? '')
      const isTxNotSupported =
        message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set member') ||
        message.includes('mongos')
      if (!isTxNotSupported) throw err

      if (stockOps.length) {
        const bulkRes = await Product.bulkWrite(stockOps)
        if (!allowNegativeStock && bulkRes.modifiedCount !== stockOps.length) {
          return res.status(409).json({ error: 'Insufficient stock' })
        }
      }

      try {
        receipt = await Receipt.create(receiptData)
      } catch (createErr) {
        if (stockOps.length) {
          await Product.bulkWrite(
            Array.from(qtyByProductId.entries()).map(([productId, qty]) => ({
              updateOne: { filter: { _id: productId, shopId }, update: { $inc: { stockQty: qty } } },
            })),
          )
        }
        throw createErr
      }

      if (receipt) {
        const movements = normalizedItems
          .filter((i) => i.productId)
          .map((i) => ({
            shopId,
            productId: String(i.productId),
            type: 'sale',
            qtyDelta: -Number(i.qty ?? 0),
            sourceType: 'receipt',
            sourceId: String(receipt._id),
            unitPriceCents: Number(i.unitPriceCents ?? 0),
            unitCostCents: null,
            notes: null,
            occurredAt: receipt.paidAt ?? new Date(),
          }))
        if (movements.length) {
          try {
            await StockMovement.insertMany(movements)
          } catch {}
        }
      }
    }
  } finally {
    session.endSession()
  }

  if (!receipt) {
    return res.status(500).json({ error: 'Failed to create receipt' })
  }

  await logAudit(req, {
    shopId,
    action: 'create',
    entityType: 'receipt',
    entityId: String(receipt._id),
    metadata: { totalCents, paymentMethod, itemCount: normalizedItems.length },
  })

  res.status(201).json({ item: receipt })
}

async function getReceipt(req, res) {
  const shopId = req.params.shopId
  const receiptId = req.params.receiptId
  if (!objectIdRe.test(receiptId)) {
    return res.status(400).json({ error: 'Invalid receiptId' })
  }

  const item = await Receipt.findOne({ _id: receiptId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function refundReceipt(req, res) {
  const shopId = req.params.shopId
  const receiptId = req.params.receiptId
  if (!objectIdRe.test(receiptId)) {
    return res.status(400).json({ error: 'Invalid receiptId' })
  }

  const { reason } = req.body ?? {}
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmedReason) {
    return res.status(400).json({ error: 'reason is required' })
  }

  const receipt = await Receipt.findOne({ _id: receiptId, shopId })
  if (!receipt) {
    return res.status(404).json({ error: 'Not found' })
  }
  if (receipt.status === 'refunded') {
    return res.status(400).json({ error: 'Already refunded' })
  }

  receipt.status = 'refunded'
  receipt.refundedAt = new Date()
  receipt.refundReason = trimmedReason
  await receipt.save()

  const stockUpdates = (receipt.items ?? [])
    .filter((i) => i.productId)
    .map((i) => ({ productId: i.productId, qty: i.qty }))
  for (const u of stockUpdates) {
    await Product.updateOne({ _id: u.productId, shopId }, { $inc: { stockQty: u.qty } })
  }

  if (stockUpdates.length) {
    try {
      await StockMovement.insertMany(
        stockUpdates.map((u) => ({
          shopId,
          productId: String(u.productId),
          type: 'refund',
          qtyDelta: Number(u.qty ?? 0),
          sourceType: 'receipt',
          sourceId: String(receiptId),
          unitPriceCents: null,
          unitCostCents: null,
          notes: receipt.refundReason ?? null,
          occurredAt: receipt.refundedAt ?? new Date(),
        })),
      )
    } catch {}
  }

  await logAudit(req, {
    shopId,
    action: 'refund',
    entityType: 'receipt',
    entityId: String(receiptId),
    metadata: { reason: receipt.refundReason },
  })

  res.status(200).json({ item: receipt.toObject() })
}

module.exports = { listReceipts, createReceipt, getReceipt, refundReceipt }
