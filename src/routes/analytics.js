const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess } = require('../utils/require-shop-access')
const analyticsController = require('../controllers/analytics-controller')

const analyticsRouter = express.Router({ mergeParams: true })

analyticsRouter.get('/revenue', requireAuth, requireShopAccess, analyticsController.revenue)

analyticsRouter.get('/best-sellers', requireAuth, requireShopAccess, analyticsController.bestSellers)

analyticsRouter.get('/payment-breakdown', requireAuth, requireShopAccess, analyticsController.paymentBreakdown)

analyticsRouter.get('/employee-performance', requireAuth, requireShopAccess, analyticsController.employeePerformance)

module.exports = { analyticsRouter }
