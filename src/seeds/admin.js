const mongoose = require('mongoose')

const { connectMongo } = require('../utils/connect-mongo')
const { requireEnv } = require('../utils/require-env')
const { User } = require('../schemas/user')
const { hashPassword } = require('../utils/password')

async function seedAdminUser() {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase().trim()
  const password = requireEnv('ADMIN_PASSWORD')
  const name = (process.env.ADMIN_NAME ?? 'Admin').trim()
  const role = (process.env.ADMIN_ROLE ?? 'admin').trim()
  const shopIds = (process.env.ADMIN_SHOP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const passwordHash = await hashPassword(password)

  const existing = await User.findOne({ email })

  if (!existing) {
    await User.create({
      email,
      passwordHash,
      name,
      role,
      shopIds,
      isActive: true,
    })
    console.log(`Seeded admin user: ${email}`)
    return
  }

  existing.passwordHash = passwordHash
  existing.name = name
  existing.role = role
  existing.isActive = true
  if (shopIds.length > 0) existing.shopIds = shopIds
  await existing.save()
  console.log(`Updated admin user: ${email}`)
}

async function runSeedAdmin() {
  require('dotenv').config()

  await connectMongo({
    mongoUri: process.env.MONGODB_URI,
  })

  await seedAdminUser()
  await mongoose.disconnect()
}

if (require.main === module) {
  runSeedAdmin().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}

module.exports = { seedAdminUser, runSeedAdmin }

