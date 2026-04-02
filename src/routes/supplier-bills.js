const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const supplierBillsController = require('../controllers/supplier-bills-controller')

const supplierBillsRouter = express.Router({ mergeParams: true })

supplierBillsRouter.get('/', requireAuth, requireShopAccess, requireShopPermission('inventory'), supplierBillsController.listBills)

supplierBillsRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('inventory'), supplierBillsController.createBill)

supplierBillsRouter.get(
  '/:billId',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  supplierBillsController.getBill,
)

supplierBillsRouter.post(
  '/:billId/pay',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  supplierBillsController.payBill,
)

supplierBillsRouter.post(
  '/:billId/void',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  supplierBillsController.voidBill,
)

module.exports = { supplierBillsRouter }
