const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const suppliersController = require('../controllers/suppliers-controller')

const suppliersRouter = express.Router({ mergeParams: true })

suppliersRouter.get(
  '/',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['inventory', 'terminal']),
  suppliersController.listSuppliers,
)

suppliersRouter.post(
  '/',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  suppliersController.createSupplier,
)

suppliersRouter.get(
  '/:supplierId',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['inventory', 'terminal']),
  suppliersController.getSupplier,
)

suppliersRouter.patch(
  '/:supplierId',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  suppliersController.updateSupplier,
)

suppliersRouter.delete(
  '/:supplierId',
  requireAuth,
  requireShopAccess,
  requireShopPermission('inventory'),
  suppliersController.deleteSupplier,
)

module.exports = { suppliersRouter }
