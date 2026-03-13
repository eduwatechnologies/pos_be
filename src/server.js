const http = require('http')

const { createApp } = require('./app')
const { connectMongo } = require('./utils/connect-mongo')

async function bootstrap() {
  require('dotenv').config()

  const port = Number(process.env.PORT ?? 3001)

  const { app } = createApp()

  await connectMongo({
    mongoUri: process.env.MONGODB_URI,
  })

  const server = http.createServer(app)
  server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`)
  })
}

bootstrap().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
