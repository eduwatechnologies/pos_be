const cors = require('cors')
require('express-async-errors')
const express = require('express')
const helmet = require('helmet')
const morgan = require('morgan')

const { apiRouter } = require('./routes')
const { notFoundHandler, errorHandler } = require('./utils/http-errors')

function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
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
