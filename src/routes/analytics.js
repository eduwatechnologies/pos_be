const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const analyticsController = require('../controllers/analytics-controller')

const analyticsRouter = express.Router({ mergeParams: true })

analyticsRouter.get('/revenue', requireAuth, requireShopAccess, requireShopPermission('analytics'), analyticsController.revenue)

analyticsRouter.get('/sales-trend', requireAuth, requireShopAccess, requireShopPermission('analytics'), analyticsController.salesTrend)

analyticsRouter.get('/best-sellers', requireAuth, requireShopAccess, requireShopPermission('analytics'), analyticsController.bestSellers)

analyticsRouter.get('/payment-breakdown', requireAuth, requireShopAccess, requireShopPermission('analytics'), analyticsController.paymentBreakdown)

analyticsRouter.get('/employee-performance', requireAuth, requireShopAccess, requireShopPermission('analytics'), analyticsController.employeePerformance)

module.exports = { analyticsRouter }
