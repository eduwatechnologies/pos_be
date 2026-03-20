const http = require('http')

const { createApp } = require('./app')
const { connectMongo } = require('./utils/connect-mongo')
const { seedAdminUser } = require('./seeds/admin')

async function bootstrap() {
  require('dotenv').config()

  const port = Number(process.env.PORT ?? 8080)
  const shouldSeedAdmin = process.argv.includes('--seed-admin')

  const { app } = createApp()

  await connectMongo({
    mongoUri: process.env.MONGODB_URI,
  })

  if (shouldSeedAdmin) {
    await seedAdminUser()
    return
  }

  const server = http.createServer(app)
  server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`)
  })
}

bootstrap().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
