const { SubscriptionPlan } = require('../schemas/subscription-plan')
const { StoreSubscription } = require('../schemas/store-subscription')
const { Invoice } = require('../schemas/invoice')
const { Shop } = require('../schemas/shop')
const { User } = require('../schemas/user')
const { requireEnv } = require('../utils/require-env')
const crypto = require('crypto')

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
  if (plan.isActive === false) return res.status(400).json({ error: 'Plan is disabled' })

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

async function listShopPlans(req, res) {
  const items = await SubscriptionPlan.find({ isActive: true }).sort({ priceMonthly: 1, createdAt: -1 }).limit(200).lean()
  res.status(200).json({ items })
}

async function getShopSubscription(req, res) {
  const shopId = req.params.shopId
  const item = await StoreSubscription.findOne({ shopId: String(shopId), status: { $in: ['active', 'past_due', 'canceled'] } })
    .sort({ createdAt: -1 })
    .lean()
  res.status(200).json({ item: item ?? null })
}

function computeNextPeriod(subscription) {
  const now = new Date()
  const base = subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() > now.getTime()
    ? new Date(subscription.currentPeriodEnd)
    : now
  const periodStart = base
  const periodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
  return { now, periodStart, periodEnd }
}

async function initializePaystackPayment(req, res) {
  const shopId = req.params.shopId
  const { planId, redirectUrl } = req.body ?? {}

  if (!planId) return res.status(400).json({ error: 'planId is required' })
  if (!objectIdRe.test(String(planId))) return res.status(400).json({ error: 'Invalid planId' })

  const shop = await Shop.findById(String(shopId)).lean()
  if (!shop) return res.status(404).json({ error: 'Shop not found' })

  const plan = await SubscriptionPlan.findById(String(planId)).lean()
  if (!plan || plan.isActive === false) return res.status(404).json({ error: 'Plan not found' })

  const user = await User.findById(req.user.sub).select({ email: 1 }).lean()
  const email = user?.email ? String(user.email) : ''
  if (!email) return res.status(400).json({ error: 'User email is required' })

  const existing = await StoreSubscription.findOne({
    shopId: String(shopId),
    status: { $in: ['active', 'past_due'] },
  })
    .sort({ createdAt: -1 })
    .lean()

  const subscription =
    existing ??
    (await StoreSubscription.create({
      shopId: String(shopId),
      planId: String(planId),
      status: 'past_due',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }))

  const { now, periodStart, periodEnd } = computeNextPeriod(subscription)

  const amount = Number(plan.priceMonthly ?? 0)
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Invalid plan price' })

  const reference = `BSCAN_${crypto.randomBytes(12).toString('hex')}`.toUpperCase()
  const invoice = await Invoice.create({
    shopId: String(shopId),
    subscriptionId: String(subscription._id),
    planId: String(planId),
    currency: String(plan.currency ?? 'NGN'),
    amount,
    status: 'unpaid',
    paymentProvider: 'paystack',
    paymentReference: reference,
    paymentMetadata: null,
    periodStart,
    periodEnd,
    dueDate: now,
    paidAt: null,
    notes: null,
  })

  const paystackSecret = requireEnv('PAYSTACK_SECRET_KEY')
  const payload = {
    email,
    amount: Math.round(amount * 100),
    currency: String(plan.currency ?? 'NGN'),
    reference,
    callback_url: redirectUrl ? String(redirectUrl) : undefined,
    metadata: {
      shopId: String(shopId),
      invoiceId: String(invoice._id),
      planId: String(planId),
      subscriptionId: String(subscription._id),
    },
  }

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await resp.json().catch(() => null)
  if (!resp.ok || !data?.status) {
    await Invoice.findByIdAndUpdate(String(invoice._id), { $set: { status: 'void', paymentMetadata: data ?? null } })
    return res.status(502).json({ error: 'Failed to initialize Paystack transaction' })
  }

  await Invoice.findByIdAndUpdate(String(invoice._id), { $set: { paymentMetadata: data?.data ?? null } })

  res.status(200).json({
    authorizationUrl: String(data?.data?.authorization_url ?? ''),
    reference,
    invoiceId: String(invoice._id),
  })
}

async function applyPaystackPayment(reference, paystackData) {
  const invoice = await Invoice.findOne({ paymentProvider: 'paystack', paymentReference: reference }).lean()
  if (!invoice) return { invoice: null, subscription: null }
  if (invoice.status === 'paid') {
    const subscription = await StoreSubscription.findById(String(invoice.subscriptionId)).lean()
    return { invoice, subscription }
  }

  const status = String(paystackData?.status ?? '')
  if (status !== 'success') return { invoice: null, subscription: null }

  const paidAmount = Number(paystackData?.amount ?? NaN)
  const expectedAmount = Math.round(Number(invoice.amount ?? 0) * 100)
  if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) return { invoice: null, subscription: null }

  const paidAt = paystackData?.paid_at ? new Date(paystackData.paid_at) : new Date()

  const updatedInvoice = await Invoice.findByIdAndUpdate(
    String(invoice._id),
    { $set: { status: 'paid', paidAt, paymentMetadata: paystackData } },
    { new: true },
  ).lean()

  const updatedSubscription = await StoreSubscription.findByIdAndUpdate(
    String(invoice.subscriptionId),
    {
      $set: {
        status: 'active',
        planId: String(invoice.planId),
        currentPeriodStart: invoice.periodStart,
        currentPeriodEnd: invoice.periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    },
    { new: true },
  ).lean()

  return { invoice: updatedInvoice, subscription: updatedSubscription }
}

async function verifyPaystackPayment(req, res) {
  const shopId = req.params.shopId
  const reference = String(req.query.reference ?? req.query.trxref ?? '').trim()
  if (!reference) return res.status(400).json({ error: 'reference is required' })

  const paystackSecret = requireEnv('PAYSTACK_SECRET_KEY')
  const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret}` },
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok || !data?.status) return res.status(502).json({ error: 'Unable to verify payment' })

  const paystackTx = data?.data ?? null
  const invoice = await Invoice.findOne({ paymentProvider: 'paystack', paymentReference: reference }).lean()
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' })
  if (String(invoice.shopId) !== String(shopId)) return res.status(403).json({ error: 'Forbidden' })

  const applied = await applyPaystackPayment(reference, paystackTx)
  if (!applied.invoice) return res.status(400).json({ error: 'Payment not completed' })

  res.status(200).json({ invoice: applied.invoice, subscription: applied.subscription })
}

async function paystackWebhook(req, res) {
  const signature = String(req.headers['x-paystack-signature'] ?? '')
  if (!signature) return res.status(400).json({ error: 'Missing signature' })

  const secret = requireEnv('PAYSTACK_SECRET_KEY')
  const raw = req.rawBody
  if (!raw) return res.status(400).json({ error: 'Missing payload' })

  const computed = crypto.createHmac('sha512', secret).update(raw).digest('hex')
  if (computed !== signature) return res.status(400).json({ error: 'Invalid signature' })

  const event = req.body ?? {}
  const eventType = String(event?.event ?? '')
  const reference = String(event?.data?.reference ?? '').trim()

  if (!reference) return res.status(200).json({ ok: true })
  if (eventType !== 'charge.success' && eventType !== 'transaction.success') return res.status(200).json({ ok: true })

  await applyPaystackPayment(reference, event?.data ?? null)
  res.status(200).json({ ok: true })
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
  listShopPlans,
  getShopSubscription,
  initializePaystackPayment,
  verifyPaystackPayment,
  paystackWebhook,
}
