const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const categoriesController = require('../controllers/categories-controller')

const categoriesRouter = express.Router({ mergeParams: true })

categoriesRouter.get('/', requireAuth, requireShopAccess, requireShopPermission(['inventory', 'terminal']), categoriesController.listCategories)
categoriesRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('inventory'), categoriesController.createCategory)
categoriesRouter.patch('/:categoryId', requireAuth, requireShopAccess, requireShopPermission('inventory'), categoriesController.updateCategory)
categoriesRouter.delete('/:categoryId', requireAuth, requireShopAccess, requireShopPermission('inventory'), categoriesController.deleteCategory)

module.exports = { categoriesRouter }
