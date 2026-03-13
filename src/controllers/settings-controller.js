const { Shop } = require('../schemas/shop')

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
    },
  })
}

async function updateSettings(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  const updates = {}
  const allowed = ['name', 'currency', 'businessName', 'businessLogoUrl', 'address', 'phone']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
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
    },
  })
}

module.exports = { getSettings, updateSettings }

