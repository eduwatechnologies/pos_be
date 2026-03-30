const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const billingController = require('../controllers/billing-controller')

const shopBillingRouter = express.Router({ mergeParams: true })

shopBillingRouter.get('/plans', requireAuth, requireShopAccess, requireShopPermission('settings'), billingController.listShopPlans)
shopBillingRouter.get(
  '/subscription',
  requireAuth,
  requireShopAccess,
  requireShopPermission('settings'),
  billingController.getShopSubscription,
)
shopBillingRouter.post(
  '/paystack/initialize',
  requireAuth,
  requireShopAccess,
  requireShopPermission('settings'),
  billingController.initializePaystackPayment,
)
shopBillingRouter.get(
  '/paystack/verify',
  requireAuth,
  requireShopAccess,
  requireShopPermission('settings'),
  billingController.verifyPaystackPayment,
)

module.exports = { shopBillingRouter }

