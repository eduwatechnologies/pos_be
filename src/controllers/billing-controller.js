const { SubscriptionPlan } = require('../schemas/subscription-plan')
const { StoreSubscription } = require('../schemas/store-subscription')
const { Invoice } = require('../schemas/invoice')
const { Shop } = require('../schemas/shop')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function requireSuperAdmin(req, res) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  if (req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden' })
    return false
  }
  return true
}

async function listPlans(req, res) {
  if (!requireSuperAdmin(req, res)) return
  const items = await SubscriptionPlan.find({}).sort({ createdAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function createPlan(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const { name, code, currency, priceMonthly, features, isActive } = req.body ?? {}
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' })
  const price = Number(priceMonthly)
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'priceMonthly must be >= 0' })

  const normalizedCode = String(code).trim().toLowerCase()
  const existing = await SubscriptionPlan.findOne({ code: normalizedCode }).lean()
  if (existing) return res.status(409).json({ error: 'Plan code already exists' })

  const item = await SubscriptionPlan.create({
    name: String(name).trim(),
    code: normalizedCode,
    currency: currency ? String(currency).trim() : 'NGN',
    priceMonthly: price,
    features: typeof features === 'object' && features ? features : {},
    isActive: typeof isActive === 'boolean' ? isActive : true,
  })

  res.status(201).json({ item })
}

async function updatePlan(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const planId = req.params.planId
  if (!objectIdRe.test(String(planId))) return res.status(400).json({ error: 'Invalid planId' })

  const allowed = ['name', 'currency', 'priceMonthly', 'features', 'isActive']
  const body = req.body ?? {}
  const updates = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('priceMonthly' in updates) {
    const price = Number(updates.priceMonthly)
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'priceMonthly must be >= 0' })
    updates.priceMonthly = price
  }
  if ('name' in updates) updates.name = String(updates.name).trim()
  if ('currency' in updates) updates.currency = String(updates.currency).trim()
  if ('features' in updates) updates.features = typeof updates.features === 'object' && updates.features ? updates.features : {}

  const item = await SubscriptionPlan.findByIdAndUpdate(planId, { $set: updates }, { new: true }).lean()
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.status(200).json({ item })
}

async function listSubscriptions(req, res) {
  if (!requireSuperAdmin(req, res)) return
  const shopId = req.query.shopId
  const q = {}
  if (shopId) {
    if (!objectIdRe.test(String(shopId))) return res.status(400).json({ error: 'Invalid shopId' })
    q.shopId = String(shopId)
  }

  const items = await StoreSubscription.find(q).sort({ createdAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function createSubscription(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const { shopId, planId } = req.body ?? {}
  if (!shopId || !planId) return res.status(400).json({ error: 'shopId and planId are required' })
  if (!objectIdRe.test(String(shopId))) return res.status(400).json({ error: 'Invalid shopId' })
  if (!objectIdRe.test(String(planId))) return res.status(400).json({ error: 'Invalid planId' })

  const shop = await Shop.findById(String(shopId)).lean()
  if (!shop) return res.status(404).json({ error: 'Shop not found' })
  const plan = await SubscriptionPlan.findById(String(planId)).lean()
  if (!plan) return res.status(404).json({ error: 'Plan not found' })

  const existingActive = await StoreSubscription.findOne({
    shopId: String(shopId),
    status: { $in: ['active', 'past_due'] },
  }).lean()
  if (existingActive) return res.status(409).json({ error: 'Shop already has an active subscription' })

  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const subscription = await StoreSubscription.create({
    shopId: String(shopId),
    planId: String(planId),
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  })

  const invoice = await Invoice.create({
    shopId: String(shopId),
    subscriptionId: String(subscription._id),
    planId: String(planId),
    currency: String(plan.currency ?? 'NGN'),
    amount: Number(plan.priceMonthly ?? 0),
    status: 'unpaid',
    periodStart: now,
    periodEnd,
    dueDate: now,
    paidAt: null,
    notes: null,
  })

  res.status(201).json({ item: subscription, invoice })
}

async function updateSubscription(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const subscriptionId = req.params.subscriptionId
  if (!objectIdRe.test(String(subscriptionId))) return res.status(400).json({ error: 'Invalid subscriptionId' })

  const allowed = ['status', 'cancelAtPeriodEnd']
  const body = req.body ?? {}
  const updates = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('status' in updates) {
    const s = String(updates.status)
    if (!['active', 'past_due', 'canceled'].includes(s)) return res.status(400).json({ error: 'Invalid status' })
    updates.status = s
    if (s === 'canceled') {
      updates.canceledAt = new Date()
      updates.cancelAtPeriodEnd = false
    }
  }
  if ('cancelAtPeriodEnd' in updates) updates.cancelAtPeriodEnd = !!updates.cancelAtPeriodEnd

  const item = await StoreSubscription.findByIdAndUpdate(subscriptionId, { $set: updates }, { new: true }).lean()
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.status(200).json({ item })
}

async function listInvoices(req, res) {
  if (!requireSuperAdmin(req, res)) return
  const shopId = req.query.shopId
  const status = req.query.status
  const q = {}
  if (shopId) {
    if (!objectIdRe.test(String(shopId))) return res.status(400).json({ error: 'Invalid shopId' })
    q.shopId = String(shopId)
  }
  if (status) {
    const s = String(status)
    if (!['unpaid', 'paid', 'void'].includes(s)) return res.status(400).json({ error: 'Invalid status' })
    q.status = s
  }

  const items = await Invoice.find(q).sort({ createdAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function markInvoicePaid(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const invoiceId = req.params.invoiceId
  if (!objectIdRe.test(String(invoiceId))) return res.status(400).json({ error: 'Invalid invoiceId' })

  const item = await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: { status: 'paid', paidAt: new Date() } },
    { new: true },
  ).lean()

  if (!item) return res.status(404).json({ error: 'Not found' })
  res.status(200).json({ item })
}

module.exports = {
  listPlans,
  createPlan,
  updatePlan,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  listInvoices,
  markInvoicePaid,
}

