const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const purchasesController = require('../controllers/purchases-controller')

const purchasesRouter = express.Router({ mergeParams: true })

purchasesRouter.get(
  '/',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['inventory', 'terminal']),
  purchasesController.listPurchases,
)

purchasesRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('inventory'), purchasesController.createPurchase)

purchasesRouter.get(
  '/:purchaseId',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['inventory', 'terminal']),
  purchasesController.getPurchase,
)

purchasesRouter.post(
  '/:purchaseId/void',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  purchasesController.voidPurchase,
)

module.exports = { purchasesRouter }
