const express = require('express')
const { Customer } = require('../schemas/customer')
const { Receipt } = require('../schemas/receipt')
const { Product } = require('../schemas/product')
const { Shop } = require('../schemas/shop')
const { requireAuth } = require('../utils/require-auth')

const storefrontRouter = express.Router()

const objectIdRe = /^[0-9a-fA-F]{24}$/

async function createOnlineOrder(req, res) {
  const shopId = req.params.shopId
  const { items, customerName, customerEmail, customerPhone, paymentMethod } = req.body ?? {}

  if (!objectIdRe.test(shopId)) {
    return res.status(400).json({ error: 'Invalid shopId' })
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' })
  }

  const normalizedPaymentMethod = String(paymentMethod ?? 'cash').trim().toLowerCase()
  if (!['cash', 'card', 'transfer', 'other'].includes(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Invalid paymentMethod' })
  }

  const shop = await Shop.findById(shopId).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' })
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
    paymentMethod: normalizedPaymentMethod,
    items: normalizedItems,
    subtotalCents,
    taxCents,
    discountCents,
    totalCents,
    status: 'completed',
    source: 'online',
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

storefrontRouter.post('/:shopId/orders', createOnlineOrder)

module.exports = { storefrontRouter }
