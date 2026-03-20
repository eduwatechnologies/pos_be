const { User } = require('../schemas/user')
const { hashPassword } = require('../utils/password')

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

async function listUsers(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const items = await User.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .select({ passwordHash: 0 })
    .lean()

  res.status(200).json({ items })
}

async function getUser(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const userId = req.params.userId
  if (!objectIdRe.test(String(userId))) {
    return res.status(400).json({ error: 'Invalid userId' })
  }

  const item = await User.findById(userId).select({ passwordHash: 0 }).lean()
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.status(200).json({ item })
}

async function createUser(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const { email, password, name, role, shopIds, isActive } = req.body ?? {}
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, and role are required' })
  }
  if (!['super_admin', 'admin', 'cashier'].includes(String(role))) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const existing = await User.findOne({ email: String(email).toLowerCase().trim() }).lean()
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' })
  }

  const passwordHash = await hashPassword(String(password))
  const user = await User.create({
    email: String(email).toLowerCase().trim(),
    passwordHash,
    name: String(name).trim(),
    role: String(role),
    shopIds: Array.isArray(shopIds) ? shopIds.map((s) => String(s)) : [],
    isActive: typeof isActive === 'boolean' ? isActive : true,
  })

  res.status(201).json({
    item: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      shopIds: user.shopIds,
      isActive: user.isActive !== false,
    },
  })
}

async function updateUser(req, res) {
  if (!requireSuperAdmin(req, res)) return

  const userId = req.params.userId
  if (!objectIdRe.test(String(userId))) {
    return res.status(400).json({ error: 'Invalid userId' })
  }

  const allowed = ['email', 'name', 'role', 'shopIds', 'isActive', 'password']
  const body = req.body ?? {}
  const updates = {}

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('role' in updates) {
    if (!['super_admin', 'admin', 'cashier'].includes(String(updates.role))) {
      return res.status(400).json({ error: 'Invalid role' })
    }
  }
  if ('email' in updates) {
    updates.email = String(updates.email).toLowerCase().trim()
  }
  if ('shopIds' in updates) {
    updates.shopIds = Array.isArray(updates.shopIds) ? updates.shopIds.map((s) => String(s)) : []
  }
  if ('password' in updates) {
    updates.passwordHash = await hashPassword(String(updates.password))
    delete updates.password
  }

  const item = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
    .select({ passwordHash: 0 })
    .lean()

  if (!item) return res.status(404).json({ error: 'Not found' })
  res.status(200).json({ item })
}

module.exports = { listUsers, getUser, createUser, updateUser }

