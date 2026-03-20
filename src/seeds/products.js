const mongoose = require('mongoose')

const { connectMongo } = require('../utils/connect-mongo')
const { Shop } = require('../schemas/shop')
const { Product } = require('../schemas/product')

const objectIdRe = /^[0-9a-fA-F]{24}$/

function pad(num, size) {
  return String(num).padStart(size, '0')
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function ensureShop() {
  const preferredId = process.env.SEED_SHOP_ID ? String(process.env.SEED_SHOP_ID) : ''
  if (preferredId && objectIdRe.test(preferredId)) {
    const existing = await Shop.findById(preferredId).lean()
    if (existing) return String(existing._id)
  }

  const first = await Shop.findOne({}).sort({ createdAt: 1 }).lean()
  if (first) return String(first._id)

  const created = await Shop.create({
    name: process.env.SEED_SHOP_NAME ?? 'Main Shop',
    currency: process.env.SEED_SHOP_CURRENCY ?? 'NGN',
    businessName: process.env.SEED_BUSINESS_NAME ?? 'ScanSell POS',
    businessLogoUrl: null,
    address: process.env.SEED_SHOP_ADDRESS ?? null,
    phone: process.env.SEED_SHOP_PHONE ?? null,
  })
  return String(created._id)
}

async function seedProducts({ shopId, count = 30 }) {
  const baseNames = [
    'Rice',
    'Sugar',
    'Milk',
    'Bread',
    'Butter',
    'Eggs',
    'Flour',
    'Salt',
    'Cooking Oil',
    'Tomato Paste',
    'Spaghetti',
    'Noodles',
    'Bottled Water',
    'Soft Drink',
    'Juice',
    'Tea',
    'Coffee',
    'Biscuits',
    'Chocolate',
    'Soap',
    'Detergent',
    'Toothpaste',
    'Toothbrush',
    'Shampoo',
    'Body Lotion',
    'Tissue Paper',
    'Batteries',
    'Notebook',
    'Pen',
    'Hand Sanitizer',
  ]

  const desired = Math.max(1, Math.min(200, Number(count) || 30))
  const ops = []

  for (let i = 1; i <= desired; i += 1) {
    const nameBase = baseNames[(i - 1) % baseNames.length] ?? `Product ${i}`
    const sku = `SKU-${pad(i, 4)}`
    const barcode = `200${pad(i, 9)}`
    const priceCents = randomInt(200, 25000)
    const stockQty = randomInt(5, 120)
    const lowStockThreshold = randomInt(3, 12)

    ops.push(
      Product.updateOne(
        { shopId, sku },
        {
          $set: {
            shopId,
            name: `${nameBase} ${i}`,
            category: 'General',
            sku,
            barcode,
            priceCents,
            stockQty,
            lowStockThreshold,
            isActive: true,
          },
        },
        { upsert: true },
      ),
    )
  }

  await Promise.all(ops)
  return { seeded: ops.length }
}

async function runSeedProducts() {
  require('dotenv').config()

  await connectMongo({
    mongoUri: process.env.MONGODB_URI,
  })

  const shopId = await ensureShop()
  const { seeded } = await seedProducts({ shopId, count: process.env.SEED_PRODUCTS_COUNT ?? 30 })

  console.log(`Seeded/updated ${seeded} products for shop ${shopId}`)
  await mongoose.disconnect()
}

if (require.main === module) {
  runSeedProducts().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}

module.exports = { runSeedProducts, seedProducts }
