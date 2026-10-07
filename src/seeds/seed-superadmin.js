const mongoose = require('mongoose')

const { connectMongo } = require('../utils/connect-mongo')
const { requireEnv } = require('../utils/require-env')
const { User } = require('../schemas/user')
const { hashPassword } = require('../utils/password')

const SUPERADMIN_ROLE = 'super_admin'

async function seedKounterSuperAdmin() {
  const email = requireEnv('KOUTER_SUPERADMIN_EMAIL').toLowerCase().trim()
  const password = requireEnv('KOUTER_SUPERADMIN_PASSWORD')
  const name = (process.env.KOUTER_SUPERADMIN_NAME ?? 'Kounter SuperAdmin').trim()
  const shopIdsRaw = (process.env.KOUTER_SUPERADMIN_SHOP_IDS ?? '').trim()
  const shopIds = shopIdsRaw
    ? shopIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid KOUTER_SUPERADMIN_EMAIL: ${email}`)
  }

  if (password.length < 8) {
    throw new Error('KOUTER_SUPERADMIN_PASSWORD must be at least 8 characters')
  }

  const passwordHash = await hashPassword(password)

  const existing = await User.findOne({ email })

  if (!existing) {
    await User.create({
      email,
      passwordHash,
      name,
      role: SUPERADMIN_ROLE,
      shopIds,
      isActive: true,
    })
    console.log(`[seed:superadmin] ✅ Created superadmin "${name}" <${email}> (role=${SUPERADMIN_ROLE})`)
    return
  }

  existing.passwordHash = passwordHash
  existing.name = name
  existing.role = SUPERADMIN_ROLE
  existing.isActive = true
  if (shopIds.length > 0) existing.shopIds = Array.from(new Set([...(existing.shopIds ?? []), ...shopIds]))
  await existing.save()
  console.log(`[seed:superadmin] 🔁 Updated superadmin "${name}" <${email}> (role=${SUPERADMIN_ROLE})`)
}

async function runSeedSuperAdmin() {
  require('dotenv').config()

  await connectMongo({
    mongoUri: process.env.MONGODB_URI,
  })

  await seedKounterSuperAdmin()
  await mongoose.disconnect()
}

if (require.main === module) {
  runSeedSuperAdmin().catch((err) => {
    console.error('[seed:superadmin] ❌ Failed to seed superadmin:', err?.message ?? err)
    process.exitCode = 1
  })
}

module.exports = { seedKounterSuperAdmin, runSeedSuperAdmin }
