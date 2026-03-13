const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const shopsController = require('../controllers/shops-controller')

const shopsRouter = express.Router()

shopsRouter.get('/', requireAuth, shopsController.listShops)

shopsRouter.post('/', requireAuth, shopsController.createShop)

shopsRouter.get('/:shopId', requireAuth, shopsController.getShop)

shopsRouter.patch('/:shopId', requireAuth, shopsController.updateShop)

shopsRouter.delete('/:shopId', requireAuth, shopsController.deleteShop)

module.exports = { shopsRouter }
