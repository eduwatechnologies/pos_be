const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const productsController = require('../controllers/products-controller')

const productsRouter = express.Router({ mergeParams: true })

productsRouter.get('/', requireAuth, requireShopAccess, requireShopPermission(['inventory', 'terminal']), productsController.listProducts)

productsRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('inventory'), productsController.createProduct)

productsRouter.get('/:productId', requireAuth, requireShopAccess, requireShopPermission(['inventory', 'terminal']), productsController.getProduct)

productsRouter.patch('/:productId', requireAuth, requireShopAccess, requireShopPermission('inventory'), productsController.updateProduct)

productsRouter.delete('/:productId', requireAuth, requireShopAccess, requireShopPermission('inventory'), productsController.deleteProduct)

productsRouter.post('/:productId/adjust-stock', requireAuth, requireShopAccess, requireShopPermission('inventory'), productsController.adjustStock)

module.exports = { productsRouter }
