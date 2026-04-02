const { Shop } = require('../schemas/shop')
const { User } = require('../schemas/user')

function normalizeRolePermissions(input) {
  const defaults = {
    admin: {
      dashboard: true,
      terminal: true,
      customers: true,
      receipts: true,
      analytics: true,
      inventory: true,
      employees: true,
      settings: true,
    },
    cashier: {
      dashboard: true,
      terminal: true,
      customers: false,
      receipts: true,
      analytics: false,
      inventory: false,
      employees: false,
      settings: false,
    },
  }

  const allowedKeys = ['dashboard', 'terminal', 'customers', 'receipts', 'analytics', 'inventory', 'employees', 'settings']

  const src = input && typeof input === 'object' ? input : {}
  const out = {}

  for (const [role, roleObj] of Object.entries(src)) {
    if (!roleObj || typeof roleObj !== 'object') continue
    if (role === 'admin') continue
    if (role === 'super_admin') continue

    const base = role === 'cashier' ? { ...defaults.cashier } : Object.fromEntries(allowedKeys.map((k) => [k, true]))
    for (const key of allowedKeys) {
      if (key in roleObj) base[key] = Boolean(roleObj[key])
    }
    out[role] = base
  }

  out.cashier = { ...defaults.cashier, ...(out.cashier ?? {}) }
  out.admin = { ...defaults.admin }

  return out
}

function normalizeRoleKey(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function makeAllEnabledPermissions() {
  return {
    dashboard: true,
    terminal: true,
    customers: true,
    receipts: true,
    analytics: true,
    inventory: true,
    employees: true,
    settings: true,
  }
}

async function getSettings(req, res) {
  const shopId = req.params.shopId
  const shop = await Shop.findById(shopId).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({
    settings: {
      shopId: String(shop._id),
      name: shop.name,
      currency: shop.currency,
      businessName: shop.businessName,
      businessLogoUrl: shop.businessLogoUrl,
      address: shop.address,
      phone: shop.phone,
      taxRateBps: typeof shop.taxRateBps === 'number' && Number.isFinite(shop.taxRateBps) ? shop.taxRateBps : 0,
      allowNegativeStock: shop.allowNegativeStock === true,
      rolePermissions: normalizeRolePermissions(shop.rolePermissions),
    },
  })
}

async function updateSettings(req, res) {
  const shopId = req.params.shopId
  const updates = {}
  const allowed = [
    'name',
    'currency',
    'businessName',
    'businessLogoUrl',
    'address',
    'phone',
    'rolePermissions',
    'taxRateBps',
    'allowNegativeStock',
  ]
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('rolePermissions' in updates) {
    updates.rolePermissions = normalizeRolePermissions(updates.rolePermissions)
  }
  if ('taxRateBps' in updates) {
    const n = Number(updates.taxRateBps)
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      return res.status(400).json({ error: 'taxRateBps must be between 0 and 10000' })
    }
    updates.taxRateBps = Math.round(n)
  }
  if ('allowNegativeStock' in updates) {
    updates.allowNegativeStock = updates.allowNegativeStock === true
  }

  const shop = await Shop.findByIdAndUpdate(shopId, { $set: updates }, { new: true }).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({
    settings: {
      shopId: String(shop._id),
      name: shop.name,
      currency: shop.currency,
      businessName: shop.businessName,
      businessLogoUrl: shop.businessLogoUrl,
      address: shop.address,
      phone: shop.phone,
      taxRateBps: typeof shop.taxRateBps === 'number' && Number.isFinite(shop.taxRateBps) ? shop.taxRateBps : 0,
      allowNegativeStock: shop.allowNegativeStock === true,
      rolePermissions: normalizeRolePermissions(shop.rolePermissions),
    },
  })
}

async function listRoles(req, res) {
  const shopId = req.params.shopId
  const shop = await Shop.findById(shopId).select({ rolePermissions: 1 }).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ rolePermissions: normalizeRolePermissions(shop.rolePermissions) })
}

async function createRole(req, res) {
  const shopId = req.params.shopId
  const roleKey = normalizeRoleKey(req.body?.roleKey)
  if (!roleKey) {
    return res.status(400).json({ error: 'roleKey is required' })
  }
  if (roleKey === 'admin' || roleKey === 'super_admin' || roleKey === 'cashier') {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const shop = await Shop.findById(shopId).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }

  const rolePermissions = normalizeRolePermissions(shop.rolePermissions)
  if (roleKey in rolePermissions) {
    return res.status(409).json({ error: 'Role already exists' })
  }

  rolePermissions[roleKey] = makeAllEnabledPermissions()

  const updated = await Shop.findByIdAndUpdate(
    shopId,
    { $set: { rolePermissions } },
    { new: true },
  ).lean()

  res.status(201).json({ rolePermissions: normalizeRolePermissions(updated?.rolePermissions) })
}

async function updateRole(req, res) {
  const shopId = req.params.shopId
  const fromRoleKey = normalizeRoleKey(req.params.roleKey)
  if (!fromRoleKey) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  if (fromRoleKey === 'admin' || fromRoleKey === 'super_admin') {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const shop = await Shop.findById(shopId).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }

  const rolePermissions = normalizeRolePermissions(shop.rolePermissions)
  if (!(fromRoleKey in rolePermissions)) {
    return res.status(404).json({ error: 'Role not found' })
  }

  const requestedRoleKey = 'roleKey' in (req.body ?? {}) ? normalizeRoleKey(req.body?.roleKey) : null
  const nextRoleKey = requestedRoleKey && requestedRoleKey !== fromRoleKey ? requestedRoleKey : fromRoleKey
  if (!nextRoleKey) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  if (nextRoleKey === 'admin' || nextRoleKey === 'super_admin' || nextRoleKey === 'cashier') {
    return res.status(400).json({ error: 'Invalid role' })
  }
  if (nextRoleKey !== fromRoleKey && nextRoleKey in rolePermissions) {
    return res.status(409).json({ error: 'Role already exists' })
  }

  const nextPermissions = { ...rolePermissions[fromRoleKey] }
  const patch = req.body?.permissions
  if (patch && typeof patch === 'object') {
    for (const key of Object.keys(makeAllEnabledPermissions())) {
      if (key in patch) nextPermissions[key] = Boolean(patch[key])
    }
  }

  if (nextRoleKey !== fromRoleKey) {
    delete rolePermissions[fromRoleKey]
  }
  rolePermissions[nextRoleKey] = nextPermissions

  await Shop.findByIdAndUpdate(shopId, { $set: { rolePermissions } }, { new: false })

  if (nextRoleKey !== fromRoleKey) {
    await User.updateMany({ shopIds: shopId, role: fromRoleKey }, { $set: { role: nextRoleKey } })
  }

  res.status(200).json({ rolePermissions: normalizeRolePermissions(rolePermissions) })
}

async function deleteRole(req, res) {
  const shopId = req.params.shopId
  const roleKey = normalizeRoleKey(req.params.roleKey)
  if (!roleKey || roleKey === 'admin' || roleKey === 'super_admin' || roleKey === 'cashier') {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const shop = await Shop.findById(shopId).lean()
  if (!shop) {
    return res.status(404).json({ error: 'Not found' })
  }

  const rolePermissions = normalizeRolePermissions(shop.rolePermissions)
  if (!(roleKey in rolePermissions)) {
    return res.status(404).json({ error: 'Role not found' })
  }

  delete rolePermissions[roleKey]
  await Shop.findByIdAndUpdate(shopId, { $set: { rolePermissions } }, { new: false })
  await User.updateMany({ shopIds: shopId, role: roleKey }, { $set: { role: 'cashier' } })

  res.status(200).json({ rolePermissions: normalizeRolePermissions(rolePermissions) })
}

module.exports = { getSettings, updateSettings, listRoles, createRole, updateRole, deleteRole }

