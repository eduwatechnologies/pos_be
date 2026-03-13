const { Product } = require('../schemas/product')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listProducts(req, res) {
  const shopId = req.params.shopId
  const q = String(req.query.q ?? '').trim()
  const barcode = String(req.query.barcode ?? '').trim()

  const filter = { shopId }
  if (barcode) {
    filter.barcode = barcode
  }
  if (q) {
    filter.name = { $regex: escapeRegex(q), $options: 'i' }
  }

  const items = await Product.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function createProduct(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const { name, sku, barcode, priceCents, stockQty, lowStockThreshold, isActive } = req.body ?? {}

  if (!name || typeof priceCents !== 'number') {
    return res.status(400).json({ error: 'name and priceCents are required' })
  }

  const product = await Product.create({
    shopId,
    name,
    sku: sku ?? null,
    barcode: barcode ?? null,
    priceCents,
    stockQty: typeof stockQty === 'number' ? stockQty : 0,
    lowStockThreshold: typeof lowStockThreshold === 'number' ? lowStockThreshold : 0,
    isActive: typeof isActive === 'boolean' ? isActive : true,
  })

  res.status(201).json({ item: product })
}

async function getProduct(req, res) {
  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const item = await Product.findOne({ _id: productId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function updateProduct(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const updates = {}
  const allowed = ['name', 'sku', 'barcode', 'priceCents', 'stockQty', 'lowStockThreshold', 'isActive']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  const item = await Product.findOneAndUpdate(
    { _id: productId, shopId },
    { $set: updates },
    { new: true },
  ).lean()

  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

async function deleteProduct(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const deleted = await Product.findOneAndDelete({ _id: productId, shopId }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ ok: true })
}

async function adjustStock(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const { delta } = req.body ?? {}
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return res.status(400).json({ error: 'delta must be a number' })
  }

  const item = await Product.findOneAndUpdate(
    { _id: productId, shopId },
    { $inc: { stockQty: delta } },
    { new: true },
  ).lean()

  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

module.exports = { listProducts, createProduct, getProduct, updateProduct, deleteProduct, adjustStock }

