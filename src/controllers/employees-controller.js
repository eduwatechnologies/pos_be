const { User } = require('../schemas/user')
const { hashPassword } = require('../utils/password')
const { Shop } = require('../schemas/shop')

const objectIdRe = /^[0-9a-fA-F]{24}$/
const protectedRoles = ['admin', 'super_admin']

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
  const { email, password, name, role } = req.body ?? {}

  if (!email || !password || !name) {
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

  const existing = await User.findOne({ email }).lean()
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' })
  }

  const passwordHash = await hashPassword(password)
  const user = await User.create({
    email,
    passwordHash,
    name,
    role: requestedRole,
    shopIds: [shopId],
    isActive: true,
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
  const allowed = ['name', 'email', 'role']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
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

module.exports = {
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  setEmployeeStatus,
}
