const { User } = require('../schemas/user')
const { hashPassword } = require('../utils/password')
const { Shop } = require('../schemas/shop')
const { StoreSubscription } = require('../schemas/store-subscription')
const { SubscriptionPlan } = require('../schemas/subscription-plan')

const objectIdRe = /^[0-9a-fA-F]{24}$/
const protectedRoles = ['admin', 'super_admin']

function parseLimitNumber(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < 0) return null
  return Math.floor(n)
}

async function listEmployees(req, res) {
  const shopId = req.params.shopId
  const items = await User.find({ shopIds: shopId, role: { $nin: protectedRoles } })
    .sort({ createdAt: -1 })
    .limit(200)
    .select({ passwordHash: 0 })
    .lean()
  res.status(200).json({ items })
}

async function createEmployee(req, res) {
  const shopId = req.params.shopId
  const { email, password, name, role, salaryOrWage } = req.body ?? {}

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' })
  }

  const normalizedEmail = String(email).toLowerCase().trim()
  const normalizedName = String(name).trim()
  if (!normalizedEmail || !normalizedName) {
    return res.status(400).json({ error: 'email, password, and name are required' })
  }

  const shop = await Shop.findById(shopId).select({ rolePermissions: 1 }).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }

  const rolePermissions = shop?.rolePermissions && typeof shop.rolePermissions === 'object' ? shop.rolePermissions : {}
  const requestedRole = role ? String(role) : 'cashier'
  if (protectedRoles.includes(requestedRole)) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  if (!(requestedRole in rolePermissions)) {
    return res.status(400).json({ error: 'Unknown role' })
  }

  const parsedSalaryOrWage = salaryOrWage == null ? 0 : Number(salaryOrWage)
  if (!Number.isFinite(parsedSalaryOrWage) || parsedSalaryOrWage < 0) {
    return res.status(400).json({ error: 'salaryOrWage must be a non-negative number' })
  }

  if (req.user?.role !== 'super_admin') {
    const subscription = await StoreSubscription.findOne({
      shopId: String(shopId),
      status: { $in: ['active', 'past_due', 'canceled'] },
    })
      .sort({ createdAt: -1 })
      .select({ planId: 1 })
      .lean()

    if (subscription?.planId) {
      const plan = await SubscriptionPlan.findById(String(subscription.planId))
        .select({ features: 1 })
        .lean()

      const maxEmployees = parseLimitNumber(plan?.features?.maxEmployees)
      if (typeof maxEmployees === 'number') {
        const employeeCount = await User.countDocuments({ shopIds: shopId, role: { $nin: protectedRoles } })
        if (employeeCount >= maxEmployees) {
          return res.status(403).json({
            error: 'Employee limit reached for your plan. Upgrade to add more staff.',
            code: 'PLAN_LIMIT',
            limitKey: 'maxEmployees',
            limit: maxEmployees,
          })
        }
      }
    }
  }

  const existing = await User.findOne({ email: normalizedEmail }).lean()
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' })
  }

  const passwordHash = await hashPassword(password)
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    name: normalizedName,
    role: requestedRole,
    shopIds: [shopId],
    isActive: true,
    salaryOrWage: parsedSalaryOrWage,
  })

  res.status(201).json({
    item: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      shopIds: user.shopIds,
      isActive: user.isActive !== false,
      salaryOrWage: user.salaryOrWage,
    },
  })
}

async function getEmployee(req, res) {
  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const item = await User.findOne({ _id: employeeId, shopIds: shopId, role: { $nin: protectedRoles } })
    .select({ passwordHash: 0 })
    .lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function updateEmployee(req, res) {
  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const updates = {}
  const allowed = ['name', 'email', 'role', 'salaryOrWage']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('name' in updates) {
    const normalizedName = String(updates.name ?? '').trim()
    if (!normalizedName) {
      return res.status(400).json({ error: 'name is required' })
    }
    updates.name = normalizedName
  }

  if ('email' in updates) {
    const normalizedEmail = String(updates.email ?? '').toLowerCase().trim()
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'email is required' })
    }
    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: employeeId } }).select({ _id: 1 }).lean()
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' })
    }
    updates.email = normalizedEmail
  }

  if ('role' in updates) {
    const shop = await Shop.findById(shopId).select({ rolePermissions: 1 }).lean()
    if (!shop) {
      return res.status(404).json({ error: 'Not found' })
    }

    const rolePermissions = shop?.rolePermissions && typeof shop.rolePermissions === 'object' ? shop.rolePermissions : {}
    const requestedRole = updates.role ? String(updates.role) : ''
    if (!requestedRole || protectedRoles.includes(requestedRole) || !(requestedRole in rolePermissions)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    updates.role = requestedRole
  }

  if ('salaryOrWage' in updates) {
    const parsedSalaryOrWage = Number(updates.salaryOrWage)
    if (!Number.isFinite(parsedSalaryOrWage) || parsedSalaryOrWage < 0) {
      return res.status(400).json({ error: 'salaryOrWage must be a non-negative number' })
    }
    updates.salaryOrWage = parsedSalaryOrWage
  }

  const item = await User.findOneAndUpdate(
    { _id: employeeId, shopIds: shopId, role: { $nin: protectedRoles } },
    { $set: updates },
    { new: true },
  )
    .select({ passwordHash: 0 })
    .lean()

  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

async function deleteEmployee(req, res) {
  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const deleted = await User.findOneAndDelete({ _id: employeeId, shopIds: shopId, role: { $nin: protectedRoles } }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ ok: true })
}

async function setEmployeeStatus(req, res) {
  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const { isActive } = req.body ?? {}
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be boolean' })
  }

  const item = await User.findOneAndUpdate(
    { _id: employeeId, shopIds: shopId, role: { $nin: protectedRoles } },
    { $set: { isActive } },
    { new: true },
  )
    .select({ passwordHash: 0 })
    .lean()

  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

async function setEmployeePassword(req, res) {
  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const { password } = req.body ?? {}
  const nextPassword = String(password ?? '')
  if (!nextPassword) {
    return res.status(400).json({ error: 'password is required' })
  }

  const passwordHash = await hashPassword(nextPassword)
  const updated = await User.findOneAndUpdate(
    { _id: employeeId, shopIds: shopId, role: { $nin: protectedRoles } },
    { $set: { passwordHash } },
    { new: true },
  )
    .select({ _id: 1 })
    .lean()

  if (!updated) {
    return res.status(404).json({ error: 'Not found' })
  }

  return res.status(200).json({ ok: true })
}

module.exports = {
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  setEmployeeStatus,
  setEmployeePassword,
}
