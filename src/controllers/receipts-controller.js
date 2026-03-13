const { Receipt } = require('../schemas/receipt')
const { Product } = require('../schemas/product')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listReceipts(req, res) {
  const shopId = req.params.shopId

  const paymentMethod = String(req.query.paymentMethod ?? '').trim()
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()
  const q = String(req.query.q ?? '').trim()

  const filter = { shopId }
  if (paymentMethod) filter.paymentMethod = paymentMethod

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

  const { items, customerName, paymentMethod, taxCents } = req.body ?? {}
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' })
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' })
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
  const totalCents = subtotalCents + safeTaxCents

  const receipt = await Receipt.create({
    shopId,
    cashierUserId,
    customerName: customerName ? String(customerName) : null,
    paymentMethod,
    items: normalizedItems,
    subtotalCents,
    taxCents: safeTaxCents,
    totalCents,
    paidAt: new Date(),
    status: 'paid',
  })

  const stockUpdates = normalizedItems
    .filter((i) => i.productId)
    .map((i) => ({ productId: i.productId, qty: i.qty }))

  for (const u of stockUpdates) {
    await Product.updateOne({ _id: u.productId, shopId }, { $inc: { stockQty: -u.qty } })
  }

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
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const receiptId = req.params.receiptId
  if (!objectIdRe.test(receiptId)) {
    return res.status(400).json({ error: 'Invalid receiptId' })
  }

  const { reason } = req.body ?? {}

  const receipt = await Receipt.findOne({ _id: receiptId, shopId })
  if (!receipt) {
    return res.status(404).json({ error: 'Not found' })
  }
  if (receipt.status === 'refunded') {
    return res.status(400).json({ error: 'Already refunded' })
  }

  receipt.status = 'refunded'
  receipt.refundedAt = new Date()
  receipt.refundReason = reason ? String(reason) : null
  await receipt.save()

  const stockUpdates = (receipt.items ?? [])
    .filter((i) => i.productId)
    .map((i) => ({ productId: i.productId, qty: i.qty }))
  for (const u of stockUpdates) {
    await Product.updateOne({ _id: u.productId, shopId }, { $inc: { stockQty: u.qty } })
  }

  res.status(200).json({ item: receipt.toObject() })
}

module.exports = { listReceipts, createReceipt, getReceipt, refundReceipt }

