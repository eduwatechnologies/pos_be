const { User } = require('../schemas/user')
const { hashPassword } = require('../utils/password')

const objectIdRe = /^[0-9a-fA-F]{24}$/

async function listEmployees(req, res) {
  const shopId = req.params.shopId
  const items = await User.find({ shopIds: shopId, role: 'cashier' })
    .sort({ createdAt: -1 })
    .limit(200)
    .select({ passwordHash: 0 })
    .lean()
  res.status(200).json({ items })
}

async function createEmployee(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const { email, password, name } = req.body ?? {}

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' })
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
    role: 'cashier',
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

  const item = await User.findOne({ _id: employeeId, shopIds: shopId, role: 'cashier' })
    .select({ passwordHash: 0 })
    .lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function updateEmployee(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const updates = {}
  const allowed = ['name', 'email']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  const item = await User.findOneAndUpdate(
    { _id: employeeId, shopIds: shopId, role: 'cashier' },
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
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const employeeId = req.params.employeeId
  if (!objectIdRe.test(employeeId)) {
    return res.status(400).json({ error: 'Invalid employeeId' })
  }

  const deleted = await User.findOneAndDelete({ _id: employeeId, shopIds: shopId, role: 'cashier' }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ ok: true })
}

async function setEmployeeStatus(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

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
    { _id: employeeId, shopIds: shopId, role: 'cashier' },
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

