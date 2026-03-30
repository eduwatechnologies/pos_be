const cors = require('cors')
require('express-async-errors')
const express = require('express')
const helmet = require('helmet')
const morgan = require('morgan')

const { apiRouter } = require('./routes')
const { notFoundHandler, errorHandler } = require('./utils/http-errors')

function createApp() {
  const app = express()

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://possuperadmin-production.up.railway.app',
    'https://posadmin-production.up.railway.app'
  ]
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      return callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors(corsOptions))
  app.options('*', cors(corsOptions))
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf
      },
    }),
  )
  app.use(morgan('dev'))

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  app.use('/api/v1', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return { app }
}

module.exports = { createApp }
