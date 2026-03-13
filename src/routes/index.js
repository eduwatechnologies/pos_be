const express = require('express')

const { authRouter } = require('./auth')
const { shopsRouter } = require('./shops')
const { productsRouter } = require('./products')
const { employeesRouter } = require('./employees')
const { receiptsRouter } = require('./receipts')
const { analyticsRouter } = require('./analytics')
const { settingsRouter } = require('./settings')

const apiRouter = express.Router()

apiRouter.use('/auth', authRouter)
apiRouter.use('/shops', shopsRouter)
apiRouter.use('/shops/:shopId/products', productsRouter)
apiRouter.use('/shops/:shopId/employees', employeesRouter)
apiRouter.use('/shops/:shopId/receipts', receiptsRouter)
apiRouter.use('/shops/:shopId/analytics', analyticsRouter)
apiRouter.use('/shops/:shopId/settings', settingsRouter)

module.exports = { apiRouter }
