const { Shop } = require('../schemas/shop')
const { User } = require('../schemas/user')

const objectIdRe = /^[0-9a-fA-F]{24}$/

async function listShops(req, res) {
  if (req.user.role === 'super_admin') {
    const items = await Shop.find({}).sort({ createdAt: -1 }).limit(200).lean()
    return res.status(200).json({ items })
  }

  const shopIds = (Array.isArray(req.user.shopIds) ? req.user.shopIds : []).filter((id) =>
    objectIdRe.test(String(id)),
  )
  if (shopIds.length === 0) {
    return res.status(200).json({ items: [] })
  }

  const items = await Shop.find({ _id: { $in: shopIds } }).sort({ createdAt: -1 }).limit(200).lean()
  return res.status(200).json({ items })
}

async function createShop(req, res) {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { name, currency, businessName, businessLogoUrl, address, phone } = req.body ?? {}
  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }

  const shop = await Shop.create({
    name,
    currency: currency ?? 'NGN',
    businessName: businessName ?? 'ScanSell POS',
    businessLogoUrl: businessLogoUrl ?? null,
    address: address ?? null,
    phone: phone ?? null,
  })

  await User.findByIdAndUpdate(req.user.sub, { $addToSet: { shopIds: String(shop._id) } })

  res.status(201).json({ item: shop })
}

async function getShop(req, res) {
  const shopId = req.params.shopId
  if (!objectIdRe.test(shopId)) {
    return res.status(400).json({ error: 'Invalid shopId' })
  }

  if (req.user.role !== 'super_admin') {
    const shopIds = Array.isArray(req.user.shopIds) ? req.user.shopIds : []
    if (!shopIds.includes(shopId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
  }

  const item = await Shop.findById(shopId).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(200).json({ item })
}

async function updateShop(req, res) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  if (!objectIdRe.test(shopId)) {
    return res.status(400).json({ error: 'Invalid shopId' })
  }

  const updates = {}
  const allowed = ['name', 'currency', 'businessName', 'businessLogoUrl', 'address', 'phone']
  for (const key of allowed) {
    if (key in (req.body ?? {})) updates[key] = req.body[key]
  }

  const item = await Shop.findByIdAndUpdate(shopId, { $set: updates }, { new: true }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  res.status(200).json({ item })
}

async function deleteShop(req, res) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const shopId = req.params.shopId
  if (!objectIdRe.test(shopId)) {
    return res.status(400).json({ error: 'Invalid shopId' })
  }

  const deleted = await Shop.findByIdAndDelete(shopId).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }

  await User.updateMany({ shopIds: shopId }, { $pull: { shopIds: shopId } })

  res.status(200).json({ ok: true })
}

module.exports = { listShops, createShop, getShop, updateShop, deleteShop }
