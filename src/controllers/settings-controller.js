const { Shop } = require('../schemas/shop')

function normalizeRolePermissions(input) {
  const defaults = {
    admin: {
      dashboard: true,
      terminal: true,
      receipts: true,
      analytics: true,
      inventory: true,
      employees: true,
      settings: true,
    },
    cashier: {
      dashboard: true,
      terminal: true,
      receipts: true,
      analytics: false,
      inventory: false,
      employees: false,
      settings: false,
    },
  }

  const allowedKeys = ['dashboard', 'terminal', 'receipts', 'analytics', 'inventory', 'employees', 'settings']

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
      rolePermissions: normalizeRolePermissions(shop.rolePermissions),
    },
  })
}

async function updateSettings(req, res) {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const updates = {}
  const allowed = ['name', 'currency', 'businessName', 'businessLogoUrl', 'address', 'phone', 'rolePermissions']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  if ('rolePermissions' in updates) {
    updates.rolePermissions = normalizeRolePermissions(updates.rolePermissions)
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
      rolePermissions: normalizeRolePermissions(shop.rolePermissions),
    },
  })
}

module.exports = { getSettings, updateSettings }

