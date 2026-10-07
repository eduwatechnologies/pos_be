const express = require('express')
const { Customer } = require('../schemas/customer')
const { Receipt } = require('../schemas/receipt')
const { Product } = require('../schemas/product')
const { Shop } = require('../schemas/shop')
const { requireAuth } = require('../utils/require-auth')

const storefrontRouter = express.Router({ mergeParams: true })

const objectIdRe = /^[0-9a-fA-F]{24}$/
const validOrderStatuses = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'completed', 'canceled']

async function resolveShopRef(ref) {
  const raw = String(ref ?? '').trim()
  if (!raw) return null
  if (objectIdRe.test(raw)) {
    const byId = await Shop.findById(raw).lean()
    if (byId) return byId
  }
  return await Shop.findOne({ storefrontSlug: raw }).lean()
}

function serializeProductForPublic(product) {
  return {
    id: String(product._id),
    name: product.name,
    category: product.category ?? 'General',
    description: product.description ?? null,
    imageUrl: product.imageUrl ?? null,
    priceCents: Number(product.priceCents ?? 0),
    stockQty: Number(product.stockQty ?? 0),
    lowStockThreshold: Number(product.lowStockThreshold ?? 0),
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
    isActive: product.isActive !== false,
  }
}

async function getPublicStorefront(req, res) {
  const shop = await resolveShopRef(req.params.shopId)
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }

  if (shop.storefrontEnabled !== true) {
    return res.status(403).json({ error: 'Storefront is disabled' })
  }

  const shopId = String(shop._id)
  const products = await Product.find({ shopId, isActive: true }).sort({ createdAt: -1 }).lean()

  return res.status(200).json({
    shop: {
      id: shopId,
      name: shop.name,
      currency: shop.currency ?? 'NGN',
      businessName: shop.businessName ?? 'Kounter',
      businessLogoUrl: shop.businessLogoUrl ?? null,
      address: shop.address ?? null,
      phone: shop.phone ?? null,
      storefrontEnabled: true,
      storefrontSlug: shop.storefrontSlug ?? null,
      storefrontDescription: shop.storefrontDescription ?? null,
      storefrontPrimaryColor: shop.storefrontPrimaryColor ?? '#0f172a',
      storefrontBannerUrl: shop.storefrontBannerUrl ?? null,
      storefrontDeliveryFeeCents: Number(shop.storefrontDeliveryFeeCents ?? 0),
      storefrontPickupOnly: shop.storefrontPickupOnly !== false,
    },
    products: products.map(serializeProductForPublic),
  })
}

async function listPublicProducts(req, res) {
  const shop = await resolveShopRef(req.params.shopId)
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }

  if (shop.storefrontEnabled !== true) {
    return res.status(403).json({ error: 'Storefront is disabled' })
  }

  const shopId = String(shop._id)
  const products = await Product.find({ shopId, isActive: true }).sort({ createdAt: -1 }).lean()
  return res.status(200).json({
    products: products.map(serializeProductForPublic),
  })
}

function serializeOrderForAdmin(receipt) {
  const id = String(receipt._id)
  return {
    id,
    orderId: id,
    orderNumber: `ORD-${id.slice(-8).toUpperCase()}`,
    customerName: receipt.customerName ?? null,
    customerPhone: receipt.customerPhone ?? null,
    customerEmail: receipt.customerEmail ?? null,
    paymentMethod: receipt.paymentMethod ?? 'cash',
    status: receipt.status ?? 'paid',
    orderStatus: receipt.orderStatus ?? 'pending',
    totalCents: Number(receipt.totalCents ?? 0),
    subtotalCents: Number(receipt.subtotalCents ?? 0),
    taxCents: Number(receipt.taxCents ?? 0),
    createdAt: receipt.createdAt ?? receipt.paidAt ?? new Date().toISOString(),
    paidAt: receipt.paidAt ?? receipt.createdAt ?? new Date().toISOString(),
    notes: receipt.notes ?? null,
    items: Array.isArray(receipt.items)
      ? receipt.items.map((item) => ({
          productId: item.productId ? String(item.productId) : null,
          name: item.name,
          qty: Number(item.qty ?? 0),
          unitPriceCents: Number(item.unitPriceCents ?? 0),
          lineTotalCents: Number(item.lineTotalCents ?? 0),
        }))
      : [],
  }
}

async function listOnlineOrders(req, res) {
  const shop = await resolveShopRef(req.params.shopId)
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }
  const shopId = String(shop._id)

  const filter = { shopId, source: 'online' }

  const status = String(req.query?.orderStatus ?? req.query?.status ?? '').trim()
  if (validOrderStatuses.includes(status)) {
    filter.orderStatus = status
  }

  const q = String(req.query?.q ?? '').trim()
  if (q) {
    const regex = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const clauses = [
      { customerName: regex },
      { customerPhone: regex },
      { customerEmail: regex },
    ]
    if (objectIdRe.test(q)) clauses.push({ _id: q })
    filter.$or = clauses
  }

  const orders = await Receipt.find(filter).sort({ createdAt: -1 }).lean()
  return res.status(200).json({ items: orders.map(serializeOrderForAdmin) })
}

async function getOnlineOrder(req, res) {
  const { shopId: shopRef, orderId } = req.params
  if (!objectIdRe.test(orderId)) {
    return res.status(400).json({ error: 'Invalid orderId' })
  }
  const shop = await resolveShopRef(shopRef)
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }
  const shopId = String(shop._id)

  const order = await Receipt.findOne({ _id: orderId, shopId, source: 'online' }).lean()
  if (!order) {
    return res.status(404).json({ error: 'Order not found' })
  }

  return res.status(200).json({ item: serializeOrderForAdmin(order) })
}

async function updateOnlineOrderStatus(req, res) {
  const { shopId: shopRef, orderId } = req.params
  const { orderStatus } = req.body ?? {}
  if (!objectIdRe.test(orderId)) {
    return res.status(400).json({ error: 'Invalid orderId' })
  }
  if (!validOrderStatuses.includes(String(orderStatus ?? ''))) {
    return res.status(400).json({ error: 'Invalid orderStatus' })
  }
  const shop = await resolveShopRef(shopRef)
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }
  const shopId = String(shop._id)

  const order = await Receipt.findOneAndUpdate(
    { _id: orderId, shopId, source: 'online' },
    { $set: { orderStatus: String(orderStatus) } },
    { new: true },
  ).lean()

  if (!order) {
    return res.status(404).json({ error: 'Order not found' })
  }

  return res.status(200).json({ item: serializeOrderForAdmin(order) })
}

async function createOnlineOrder(req, res) {
  const shop = await resolveShopRef(req.params.shopId)
  const { items, customerName, customerEmail, customerPhone, paymentMethod, notes } = req.body ?? {}

  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
  }
  const shopId = String(shop._id)

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' })
  }

  const normalizedNotes = String(notes ?? '').trim().slice(0, 1000) || null

  const normalizedPaymentMethod = String(paymentMethod ?? 'cash').trim().toLowerCase()
  if (!['cash', 'card', 'transfer', 'other'].includes(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Invalid paymentMethod' })
  }

  if (shop.storefrontEnabled !== true) {
    return res.status(403).json({ error: 'Storefront is disabled' })
  }

  const incomingItems = items.slice(0, 200)
  const productIds = incomingItems.map((i) => i?.productId).filter(Boolean)
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds }, shopId, isActive: true }).lean()
    : []
  const productsById = new Map(products.map((p) => [String(p._id), p]))

  const normalizedItems = []
  for (const raw of incomingItems) {
    const qty = Number(raw?.qty ?? 0)
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Each item must have qty >= 1' })
    }
    if (qty > 999) {
      return res.status(400).json({ error: 'Each item qty must be <= 999' })
    }

    const productId = raw?.productId ? String(raw.productId) : null
    const product = productId ? productsById.get(productId) : null
    if (productId && !product) {
      return res.status(400).json({ error: 'One or more products not found or unavailable' })
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
  const taxCents = 0
  const discountCents = 0
  const totalCents = subtotalCents - discountCents + taxCents

  const allowNegativeStock = shop.allowNegativeStock === true

  const qtyByProductId = new Map()
  for (const i of normalizedItems) {
    const productId = i.productId ? String(i.productId) : ''
    if (!productId) continue
    qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + Number(i.qty ?? 0))
  }

  const stockOps = Array.from(qtyByProductId.entries()).map(([productId, qty]) => ({
    updateOne: {
      filter: allowNegativeStock ? { _id: productId, shopId } : { _id: productId, shopId, stockQty: { $gte: qty } },
      update: { $inc: { stockQty: -qty } },
    },
  }))

  let customerId = null
  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : ''
  const normalizedPhone = customerPhone ? String(customerPhone).trim() : ''
  const normalizedName = customerName ? String(customerName).trim() : 'Guest Customer'

  if (normalizedEmail) {
    let customer = await Customer.findOne({ shopId, email: normalizedEmail }).lean()
    if (!customer) {
      customer = await Customer.create({
        shopId,
        name: normalizedName,
        email: normalizedEmail || null,
        phone: normalizedPhone || null,
        address: null,
        notes: 'Created from online store',
        isActive: true,
      })
    }
    customerId = String(customer._id)
  } else if (normalizedPhone) {
    let customer = await Customer.findOne({ shopId, phone: normalizedPhone }).lean()
    if (!customer) {
      customer = await Customer.create({
        shopId,
        name: normalizedName,
        email: null,
        phone: normalizedPhone || null,
        address: null,
        notes: 'Created from online store',
        isActive: true,
      })
    }
    customerId = String(customer._id)
  }

  const receiptData = {
    shopId,
    cashierUserId: null,
    customerId,
    customerName: normalizedName,
    customerPhone: normalizedPhone || null,
    customerEmail: normalizedEmail || null,
    paymentMethod: normalizedPaymentMethod,
    items: normalizedItems,
    subtotalCents,
    taxCents,
    discountCents,
    totalCents,
    status: 'paid',
    source: 'online',
    orderStatus: 'pending',
    notes: normalizedNotes,
    paidAt: new Date(),
  }

  if (stockOps.length > 0) {
    await Product.bulkWrite(stockOps)
  }

  const receipt = await Receipt.create(receiptData)

  res.status(201).json({
    orderId: String(receipt._id),
    orderNumber: `ORD-${receipt._id.toString().slice(-8).toUpperCase()}`,
    totalCents,
    customerName: normalizedName,
    paidAt: receipt.paidAt,
  })
}

storefrontRouter.get('/', getPublicStorefront)
storefrontRouter.get('/products', listPublicProducts)
storefrontRouter.get('/orders', requireAuth, listOnlineOrders)
storefrontRouter.get('/orders/:orderId', requireAuth, getOnlineOrder)
storefrontRouter.patch('/orders/:orderId/status', requireAuth, updateOnlineOrderStatus)
storefrontRouter.post('/orders', createOnlineOrder)

module.exports = { storefrontRouter }
