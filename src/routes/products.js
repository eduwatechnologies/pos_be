const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess } = require('../utils/require-shop-access')
const productsController = require('../controllers/products-controller')

const productsRouter = express.Router({ mergeParams: true })

productsRouter.get('/', requireAuth, requireShopAccess, productsController.listProducts)

productsRouter.post('/', requireAuth, requireShopAccess, productsController.createProduct)

productsRouter.get('/:productId', requireAuth, requireShopAccess, productsController.getProduct)

productsRouter.patch('/:productId', requireAuth, requireShopAccess, productsController.updateProduct)

productsRouter.delete('/:productId', requireAuth, requireShopAccess, productsController.deleteProduct)

productsRouter.post('/:productId/adjust-stock', requireAuth, requireShopAccess, productsController.adjustStock)

module.exports = { productsRouter }
