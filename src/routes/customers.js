const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const customersController = require('../controllers/customers-controller')

const customersRouter = express.Router({ mergeParams: true })

customersRouter.get(
  '/',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['customers', 'terminal']),
  customersController.listCustomers,
)

customersRouter.post(
  '/',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['customers', 'terminal']),
  customersController.createCustomer,
)

customersRouter.get('/:customerId', requireAuth, requireShopAccess, requireShopPermission('customers'), customersController.getCustomer)

customersRouter.get(
  '/:customerId/activity',
  requireAuth,
  requireShopAccess,
  requireShopPermission(['customers', 'receipts']),
  customersController.getCustomerActivity,
)

customersRouter.patch('/:customerId', requireAuth, requireShopAccess, requireShopPermission('customers'), customersController.updateCustomer)

customersRouter.delete(
  '/:customerId',
  requireAuth,
  requireShopAccess,
  requireShopPermission('customers'),
  customersController.deleteCustomer,
)

module.exports = { customersRouter }
