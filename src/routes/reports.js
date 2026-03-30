const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const reportsController = require('../controllers/reports-controller')

const reportsRouter = express.Router({ mergeParams: true })

reportsRouter.get('/summary', requireAuth, requireShopAccess, requireShopPermission('analytics'), reportsController.summary)

reportsRouter.get('/sales-by-day', requireAuth, requireShopAccess, requireShopPermission('analytics'), reportsController.salesByDay)

reportsRouter.get('/top-products', requireAuth, requireShopAccess, requireShopPermission('analytics'), reportsController.topProducts)

module.exports = { reportsRouter }
