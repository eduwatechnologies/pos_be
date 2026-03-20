const { Category } = require('../schemas/category')
const { Product } = require('../schemas/product')

function normalizeName(input) {
  const name = String(input ?? '').trim()
  const key = name.toLowerCase()
  return { name, key }
}

async function listCategories(req, res) {
  const shopId = req.params.shopId
  const q = String(req.query.q ?? '').trim().toLowerCase()
  const includeInactive = String(req.query.includeInactive ?? '').trim() === '1'

  const filter = { shopId }
  if (!includeInactive) filter.isActive = { $ne: false }
  if (q) filter.key = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }

  const items = await Category.find(filter).sort({ createdAt: -1 }).limit(500).lean()
  res.status(200).json({ items })
}

async function createCategory(req, res) {
  const shopId = req.params.shopId
  const { name } = req.body ?? {}

  const normalized = normalizeName(name)
  if (!normalized.name) {
    return res.status(400).json({ error: 'name is required' })
  }

  const existing = await Category.findOne({ shopId, key: normalized.key }).select({ _id: 1 }).lean()
  if (existing) {
    return res.status(409).json({ error: 'Category already exists' })
  }

  const category = await Category.create({
    shopId,
    name: normalized.name,
    key: normalized.key,
    isActive: true,
  })

  res.status(201).json({ item: category })
}

async function updateCategory(req, res) {
  const shopId = req.params.shopId
  const categoryId = req.params.categoryId
  const objectIdRe = /^[0-9a-fA-F]{24}$/
  if (!objectIdRe.test(categoryId)) {
    return res.status(400).json({ error: 'Invalid categoryId' })
  }

  const existing = await Category.findOne({ _id: categoryId, shopId }).lean()
  if (!existing) {
    return res.status(404).json({ error: 'Not found' })
  }

  const updates = {}
  if ('name' in (req.body ?? {})) {
    const normalized = normalizeName(req.body.name)
    if (!normalized.name) {
      return res.status(400).json({ error: 'name is required' })
    }
    updates.name = normalized.name
    updates.key = normalized.key
  }
  if ('isActive' in (req.body ?? {})) {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be boolean' })
    }
    updates.isActive = req.body.isActive
  }

  if (updates.key && updates.key !== existing.key) {
    const duplicate = await Category.findOne({ shopId, key: updates.key, _id: { $ne: categoryId } })
      .select({ _id: 1 })
      .lean()
    if (duplicate) {
      return res.status(409).json({ error: 'Category already exists' })
    }
  }

  const item = await Category.findOneAndUpdate({ _id: categoryId, shopId }, { $set: updates }, { new: true }).lean()
  if (!item) {
    return res.status(404).json({ error: 'Not found' })
  }

  if (updates.name && updates.name !== existing.name) {
    await Product.updateMany({ shopId, category: existing.name }, { $set: { category: updates.name } })
  }

  res.status(200).json({ item })
}

async function deleteCategory(req, res) {
  const shopId = req.params.shopId
  const categoryId = req.params.categoryId
  const objectIdRe = /^[0-9a-fA-F]{24}$/
  if (!objectIdRe.test(categoryId)) {
    return res.status(400).json({ error: 'Invalid categoryId' })
  }

  const deleted = await Category.findOneAndDelete({ _id: categoryId, shopId }).lean()
  if (!deleted) {
    return res.status(404).json({ error: 'Not found' })
  }

  await Product.updateMany({ shopId, category: deleted.name }, { $set: { category: 'General' } })

  res.status(200).json({ ok: true })
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory }
