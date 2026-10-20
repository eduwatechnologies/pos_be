const jwt = require('jsonwebtoken')

const { Shop } = require('../schemas/shop')
const { User } = require('../schemas/user')
const { SubscriptionPlan } = require('../schemas/subscription-plan')
const { StoreSubscription } = require('../schemas/store-subscription')
const { hashPassword, verifyPassword } = require('../utils/password')
const { requireEnv } = require('../utils/require-env')
const { logAudit } = require('../utils/audit-log')

async function ensureTrialPlan() {
  const existing = await SubscriptionPlan.findOne({ code: 'trial' }).lean()
  if (existing) {
    const currentDays = Number(existing?.features?.trialDays ?? NaN)
    if (currentDays !== 7) {
      const updated = await SubscriptionPlan.findByIdAndUpdate(
        existing._id,
        { $set: { features: { ...(existing.features || {}), trialDays: 7 } } },
        { new: true },
      ).lean()
      return updated ?? existing
    }
    return existing
  }
  const item = await SubscriptionPlan.create({
    name: 'Trial',
    code: 'trial',
    currency: 'NGN',
    priceMonthly: 0,
    features: { trialDays: 7 },
    isActive: false,
  })
  return item.toObject ? item.toObject() : item
}

async function register(req, res) {
  const { email, password, name, shopName, currency } = req.body ?? {}

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' })
  }

  const normalizedEmail = String(email).toLowerCase().trim()
  const normalizedName = String(name).trim()
  const normalizedShopName = (shopName ? String(shopName).trim() : '') || `${normalizedName}'s Shop`

  const existingNormalized = await User.findOne({ email: normalizedEmail }).lean()
  if (existingNormalized) {
    return res.status(409).json({ error: 'Email already exists' })
  }

  let shop = null
  let subscription = null
  try {
    shop = await Shop.create({
      name: normalizedShopName,
      currency: (currency ? String(currency).trim() : '') || 'NGN',
    })

    const trialPlan = await ensureTrialPlan()
    const trialDays = Number(trialPlan?.features?.trialDays ?? 7)
    const days = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 7
    const now = new Date()
    const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    subscription = await StoreSubscription.create({
      shopId: shop._id,
      planId: trialPlan._id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    })

    const passwordHash = await hashPassword(password)
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: normalizedName,
      role: 'admin',
      shopIds: [String(shop._id)],
      isActive: true,
    })

    const jwtSecret = requireEnv('JWT_SECRET')
    const token = jwt.sign(
      { sub: String(user._id), role: user.role, shopIds: user.shopIds, authVersion: user.authVersion ?? 0 },
      jwtSecret,
      { expiresIn: '7d' },
    )

    return res.status(201).json({
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        shopIds: user.shopIds,
        isActive: user.isActive !== false,
      },
      shop: {
        id: String(shop._id),
        name: shop.name,
        currency: shop.currency,
      },
    })
  } catch (err) {
    if (subscription?._id) {
      await StoreSubscription.findByIdAndDelete(subscription._id)
    }
    if (shop?._id) {
      await Shop.findByIdAndDelete(shop._id)
    }
    throw err
  }
}

async function login(req, res) {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const normalizedEmail = String(email).toLowerCase().trim()
  const user = await User.findOne({ email: normalizedEmail })
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  if (user.isActive === false) {
    return res.status(403).json({ error: 'Account disabled' })
  }

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const jwtSecret = requireEnv('JWT_SECRET')
  const token = jwt.sign(
    { sub: String(user._id), role: user.role, shopIds: user.shopIds, authVersion: user.authVersion ?? 0 },
    jwtSecret,
    { expiresIn: '7d' },
  )

  res.status(200).json({
    token,
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      shopIds: user.shopIds,
      isActive: user.isActive !== false,
    },
  })
}

async function me(req, res) {
  const user = await User.findById(req.user.sub).lean()
  if (!user) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      shopIds: user.shopIds,
      isActive: user.isActive !== false,
    },
  })
}

async function adminResetPassword(req, res) {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only admins can reset account passwords' })
  }

  const normalizedEmail = String(req.body?.email ?? '').toLowerCase().trim()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'A valid email is required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const passwordHash = await hashPassword(password)
  const updated = await User.findOneAndUpdate(
    { email: normalizedEmail },
    { $set: { passwordHash }, $inc: { authVersion: 1 } },
    { new: true },
  )
    .select({ _id: 1 })
    .lean()

  if (!updated) {
    return res.status(404).json({ error: 'No account found for that email' })
  }

  await logAudit(req, {
    shopId: req.user.shopIds?.[0] ?? 'global',
    action: 'password_reset',
    entityType: 'user',
    entityId: updated._id,
    metadata: { targetEmail: normalizedEmail },
  })

  return res.status(200).json({ ok: true })
}

module.exports = { register, login, me, adminResetPassword }
