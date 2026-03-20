const { Product } = require('../schemas/product')

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
  const shopId = req.params.shopId
  const { name, category, sku, barcode, priceCents, stockQty, lowStockThreshold, isActive } = req.body ?? {}

  if (!name || !isFiniteNumber(priceCents)) {
    return res.status(400).json({ error: 'name and priceCents are required' })
  }
  if (priceCents < 0) {
    return res.status(400).json({ error: 'priceCents must be >= 0' })
  }

  const normalizedSku = normalizeNullableString(sku)
  const normalizedBarcode = normalizeNullableString(barcode)
  const normalizedCategory = normalizeNullableString(category) ?? 'General'

  if (normalizedSku) {
    const existingBySku = await Product.findOne({ shopId, sku: normalizedSku }).select({ _id: 1 }).lean()
    if (existingBySku) {
      return res.status(409).json({ error: 'SKU already exists' })
    }
  }
  if (normalizedBarcode) {
    const existingByBarcode = await Product.findOne({ shopId, barcode: normalizedBarcode }).select({ _id: 1 }).lean()
    if (existingByBarcode) {
      return res.status(409).json({ error: 'Barcode already exists' })
    }
  }

  const product = await Product.create({
    shopId,
    name,
    category: normalizedCategory,
    sku: normalizedSku,
    barcode: normalizedBarcode,
    priceCents,
    stockQty: isFiniteNumber(stockQty) ? stockQty : 0,
    lowStockThreshold: isFiniteNumber(lowStockThreshold) ? lowStockThreshold : 0,
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
  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const updates = {}
  const allowed = ['name', 'category', 'sku', 'barcode', 'priceCents', 'stockQty', 'lowStockThreshold', 'isActive']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('category' in updates) {
    updates.category = normalizeNullableString(updates.category) ?? 'General'
  }
  if ('sku' in updates) {
    updates.sku = normalizeNullableString(updates.sku)
    if (updates.sku) {
      const existingBySku = await Product.findOne({ shopId, sku: updates.sku, _id: { $ne: productId } })
        .select({ _id: 1 })
        .lean()
      if (existingBySku) {
        return res.status(409).json({ error: 'SKU already exists' })
      }
    }
  }
  if ('barcode' in updates) {
    updates.barcode = normalizeNullableString(updates.barcode)
    if (updates.barcode) {
      const existingByBarcode = await Product.findOne({
        shopId,
        barcode: updates.barcode,
        _id: { $ne: productId },
      })
        .select({ _id: 1 })
        .lean()
      if (existingByBarcode) {
        return res.status(409).json({ error: 'Barcode already exists' })
      }
    }
  }

  if ('priceCents' in updates) {
    if (!isFiniteNumber(updates.priceCents)) {
      return res.status(400).json({ error: 'priceCents must be a number' })
    }
    if (updates.priceCents < 0) {
      return res.status(400).json({ error: 'priceCents must be >= 0' })
    }
  }
  if ('stockQty' in updates) {
    if (!isFiniteNumber(updates.stockQty)) {
      return res.status(400).json({ error: 'stockQty must be a number' })
    }
    if (updates.stockQty < 0) {
      return res.status(400).json({ error: 'stockQty must be >= 0' })
    }
  }
  if ('lowStockThreshold' in updates) {
    if (!isFiniteNumber(updates.lowStockThreshold)) {
      return res.status(400).json({ error: 'lowStockThreshold must be a number' })
    }
    if (updates.lowStockThreshold < 0) {
      return res.status(400).json({ error: 'lowStockThreshold must be >= 0' })
    }
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
