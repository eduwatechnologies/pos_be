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

  if (user.role === 'admin') {
    return next()
  }

  const shopIds = Array.isArray(user.shopIds) ? user.shopIds : []
  if (!shopIds.includes(shopId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  return next()
}

module.exports = { requireShopAccess }
