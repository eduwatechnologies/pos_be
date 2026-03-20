const express = require('express')

const { authRouter } = require('./auth')
const { shopsRouter } = require('./shops')
const { productsRouter } = require('./products')
const { categoriesRouter } = require('./categories')
const { employeesRouter } = require('./employees')
const { receiptsRouter } = require('./receipts')
const { analyticsRouter } = require('./analytics')
const { settingsRouter } = require('./settings')
const { usersRouter } = require('./users')
const { billingRouter } = require('./billing')

const apiRouter = express.Router()

apiRouter.use('/auth', authRouter)
apiRouter.use('/shops', shopsRouter)
apiRouter.use('/shops/:shopId/products', productsRouter)
apiRouter.use('/shops/:shopId/categories', categoriesRouter)
apiRouter.use('/shops/:shopId/employees', employeesRouter)
apiRouter.use('/shops/:shopId/receipts', receiptsRouter)
apiRouter.use('/shops/:shopId/analytics', analyticsRouter)
apiRouter.use('/shops/:shopId/settings', settingsRouter)
apiRouter.use('/users', usersRouter)
apiRouter.use('/billing', billingRouter)

module.exports = { apiRouter }
