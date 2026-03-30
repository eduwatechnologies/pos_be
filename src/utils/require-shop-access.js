const { Shop } = require('../schemas/shop')

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

function requireShopAccess(req, res, next) {
  const shopId = req.params.shopId
  const user = req.user
  const objectIdRe = /^[0-9a-fA-F]{24}$/

  if (!shopId) {
    return res.status(400).json({ error: 'shopId is required' })
  }
  if (!objectIdRe.test(shopId)) {
    return res.status(400).json({ error: 'Invalid shopId' })
  }

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (user.role === 'super_admin') {
    return next()
  }

  const shopIds = Array.isArray(user.shopIds) ? user.shopIds : []
  if (!shopIds.includes(shopId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  return next()
}

function requireShopPermission(permissionKey) {
  return async function requireShopPermissionMiddleware(req, res, next) {
    const shopId = req.params.shopId
    const user = req.user

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (user.role === 'super_admin' || user.role === 'admin') {
      return next()
    }

    const shop = await Shop.findById(shopId).select({ rolePermissions: 1 }).lean()
    if (!shop) {
      return res.status(404).json({ error: 'Not found' })
    }

    const rolePermissions = normalizeRolePermissions(shop?.rolePermissions)
    const roleKey = String(user.role ?? '')
    const keys = Array.isArray(permissionKey) ? permissionKey : [permissionKey]
    const allowed = keys.some((k) => Boolean(rolePermissions?.[roleKey]?.[k]))

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    return next()
  }
}

module.exports = { requireShopAccess, requireShopPermission }
