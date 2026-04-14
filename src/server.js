const http = require('http')

const { createApp } = require('./app')
const { connectMongo } = require('./utils/connect-mongo')
const { seedAdminUser } = require('./seeds/admin')
const { StoreSubscription } = require('./schemas/store-subscription')

async function runSubscriptionMaintenance() {
  const now = new Date()

  await StoreSubscription.updateMany(
    {
      status: 'active',
      currentPeriodEnd: { $lt: now },
      cancelAtPeriodEnd: true,
    },
    {
      $set: {
        status: 'canceled',
        canceledAt: now,
        cancelAtPeriodEnd: false,
      },
    },
  )

  await StoreSubscription.updateMany(
    {
      status: 'active',
      currentPeriodEnd: { $lt: now },
      cancelAtPeriodEnd: { $ne: true },
    },
    {
      $set: {
        status: 'past_due',
      },
    },
  )
}

async function bootstrap() {
  require('dotenv').config()

  const port = Number(process.env.PORT ?? 8080)
  const shouldSeedAdmin = process.argv.includes('--seed-admin')

  const { app } = createApp()

  await connectMongo({
    mongoUri: process.env.MONGODB_URI,
  })

  // if (shouldSeedAdmin) {
  //   await seedAdminUser()
  //   return
  // }

  const intervalMs = Number(process.env.SUBSCRIPTION_MAINTENANCE_INTERVAL_MS ?? 6 * 60 * 60 * 1000)
  await runSubscriptionMaintenance()
  const timer = setInterval(() => {
    runSubscriptionMaintenance().catch(() => {})
  }, Number.isFinite(intervalMs) && intervalMs > 10_000 ? intervalMs : 6 * 60 * 60 * 1000)
  if (typeof timer.unref === 'function') timer.unref()

  const server = http.createServer(app)
  server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`)
  })
}

bootstrap().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
