const { Product } = require('../schemas/product')
const { Purchase } = require('../schemas/purchase')
const { Shop } = require('../schemas/shop')
const { Supplier } = require('../schemas/supplier')
const { StockMovement } = require('../schemas/stock-movement')
const { logAudit } = require('../utils/audit-log')
const { requireEnv } = require('../utils/require-env')

const objectIdRe = /^[0-9a-fA-F]{24}$/
let cloudinaryConfigured = false
let cloudinaryV2 = null

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

function getCloudinaryV2() {
  if (cloudinaryV2) return cloudinaryV2
  try {
    cloudinaryV2 = require('cloudinary').v2
    return cloudinaryV2
  } catch {
    const err = new Error('Cloudinary dependency is missing. Install it with: npm install cloudinary')
    err.status = 500
    throw err
  }
}

function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) return
  const cloudinary = getCloudinaryV2()
  cloudinary.config({
    cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
    api_key: requireEnv('CLOUDINARY_API_KEY'),
    api_secret: requireEnv('CLOUDINARY_API_SECRET'),
    secure: true,
  })
  cloudinaryConfigured = true
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
  const { name, category, sku, barcode, priceCents, stockQty, lowStockThreshold, isActive, imageUrl } = req.body ?? {}

  if (!name || !isFiniteNumber(priceCents)) {
    return res.status(400).json({ error: 'name and priceCents are required' })
  }
  if (priceCents < 0) {
    return res.status(400).json({ error: 'priceCents must be >= 0' })
  }

  const normalizedSku = normalizeNullableString(sku)
  const normalizedBarcode = normalizeNullableString(barcode)
  const normalizedCategory = normalizeNullableString(category) ?? 'General'
  const normalizedImageUrl = normalizeNullableString(imageUrl)

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
    imageUrl: normalizedImageUrl,
    priceCents,
    stockQty: isFiniteNumber(stockQty) ? stockQty : 0,
    lowStockThreshold: isFiniteNumber(lowStockThreshold) ? lowStockThreshold : 0,
    isActive: typeof isActive === 'boolean' ? isActive : true,
  })

  await logAudit(req, {
    shopId,
    action: 'create',
    entityType: 'product',
    entityId: String(product._id),
    metadata: { name: product.name },
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

async function getProductDetail(req, res) {
  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const item = await Product.findOne({ _id: productId, shopId }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  const purchaseDocs = await Purchase.find({ shopId, 'items.productId': productId }).sort({ purchasedAt: -1 }).limit(50).lean()

  const purchases = []
  const supplierIds = new Set()

  for (const p of purchaseDocs) {
    const lines = Array.isArray(p.items) ? p.items.filter((i) => String(i.productId ?? '') === productId) : []
    if (lines.length === 0) continue

    const qty = lines.reduce((sum, i) => sum + Number(i.qty ?? 0), 0)
    const lineTotalCents = lines.reduce((sum, i) => sum + Number(i.lineTotalCents ?? 0), 0)
    const unitCostCents = Number(lines[0]?.unitCostCents ?? 0)

    const sid = p.supplierId ? String(p.supplierId) : null
    if (sid) supplierIds.add(sid)

    purchases.push({
      _id: p._id,
      purchasedAt: p.purchasedAt,
      status: p.status,
      supplierId: sid,
      reference: p.reference ?? null,
      qty,
      unitCostCents,
      lineTotalCents,
      totalCostCents: p.totalCostCents,
    })
  }

  const suppliers = supplierIds.size
    ? await Supplier.find({ shopId, _id: { $in: Array.from(supplierIds) } }).select({ name: 1 }).lean()
    : []

  const movements = await StockMovement.find({ shopId, productId: String(productId) })
    .sort({ occurredAt: -1 })
    .limit(50)
    .lean()

  res.status(200).json({ item, purchases, suppliers, movements })
}

async function updateProduct(req, res) {
  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const updates = {}
  const allowed = ['name', 'category', 'sku', 'barcode', 'imageUrl', 'priceCents', 'stockQty', 'lowStockThreshold', 'isActive']
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

  if ('imageUrl' in updates) {
    updates.imageUrl = normalizeNullableString(updates.imageUrl)
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

  await logAudit(req, {
    shopId,
    action: 'update',
    entityType: 'product',
    entityId: String(productId),
    metadata: updates,
  })

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

  await logAudit(req, {
    shopId,
    action: 'delete',
    entityType: 'product',
    entityId: String(productId),
    metadata: {},
  })

  res.status(200).json({ ok: true })
}

async function adjustStock(req, res) {
  const shopId = req.params.shopId
  const productId = req.params.productId
  if (!objectIdRe.test(productId)) {
    return res.status(400).json({ error: 'Invalid productId' })
  }

  const { delta, reason } = req.body ?? {}
  if (typeof delta !== 'number' || !Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ error: 'delta must be a non-zero integer' })
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmedReason) {
    return res.status(400).json({ error: 'reason is required' })
  }

  const shop = await Shop.findById(shopId).select({ allowNegativeStock: 1 }).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }
  const allowNegativeStock = shop.allowNegativeStock === true

  const filter = { _id: productId, shopId }
  if (!allowNegativeStock && delta < 0) {
    filter.stockQty = { $gte: -delta }
  }

  const item = await Product.findOneAndUpdate(filter, { $inc: { stockQty: delta } }, { new: true }).lean()

  if (!item) {
    if (!allowNegativeStock && delta < 0) {
      const exists = await Product.findOne({ _id: productId, shopId }).select({ _id: 1 }).lean()
      if (exists) return res.status(409).json({ error: 'Insufficient stock' })
    }
    return res.status(404).json({ error: 'Not found' })
  }

  await logAudit(req, {
    shopId,
    action: 'adjust_stock',
    entityType: 'product',
    entityId: String(productId),
    metadata: { delta, reason: trimmedReason },
  })

  try {
    await StockMovement.create({
      shopId,
      productId: String(productId),
      type: 'adjustment',
      qtyDelta: Number(delta),
      sourceType: 'product',
      sourceId: String(productId),
      unitPriceCents: null,
      unitCostCents: null,
      notes: trimmedReason,
      occurredAt: new Date(),
    })
  } catch {}

  res.status(200).json({ item })
}

async function uploadProductImage(req, res) {
  ensureCloudinaryConfigured()

  const shopId = req.params.shopId
  const { dataUrl } = req.body ?? {}
  const normalizedDataUrl = typeof dataUrl === 'string' ? dataUrl.trim() : ''

  if (!normalizedDataUrl) {
    return res.status(400).json({ error: 'dataUrl is required' })
  }

  if (!normalizedDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Only image uploads are allowed' })
  }

  const folder = String(process.env.CLOUDINARY_PRODUCTS_FOLDER ?? 'kounter/products').trim() || 'kounter/products'

  try {
    const cloudinary = getCloudinaryV2()
    const result = await cloudinary.uploader.upload(normalizedDataUrl, {
      folder,
      resource_type: 'image',
      context: `shopId=${shopId}`,
    })

    console.log(`Cloudinary product image uploaded: ${result.secure_url}`)

    res.status(201).json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    })
  } catch (err) {
    const httpCode = typeof err?.http_code === 'number' ? err.http_code : null
    const status = httpCode && httpCode >= 400 && httpCode < 600 ? httpCode : 502
    const message = err?.message ? String(err.message) : 'Failed to upload image'
    console.error('Cloudinary upload failed', { status, message })
    res.status(status).json({ error: message })
  }
}

module.exports = { listProducts, createProduct, getProduct, getProductDetail, updateProduct, deleteProduct, adjustStock, uploadProductImage }
