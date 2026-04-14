const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const settingsController = require('../controllers/settings-controller')

const settingsRouter = express.Router({ mergeParams: true })

settingsRouter.get('/', requireAuth, requireShopAccess, settingsController.getSettings)

settingsRouter.patch('/', requireAuth, requireShopAccess, requireShopPermission('settings'), settingsController.updateSettings)

settingsRouter.get('/roles', requireAuth, requireShopAccess, requireShopPermission('settings'), settingsController.listRoles)
settingsRouter.post('/roles', requireAuth, requireShopAccess, requireShopPermission('settings'), settingsController.createRole)
settingsRouter.patch('/roles/:roleKey', requireAuth, requireShopAccess, requireShopPermission('settings'), settingsController.updateRole)
settingsRouter.delete('/roles/:roleKey', requireAuth, requireShopAccess, requireShopPermission('settings'), settingsController.deleteRole)

module.exports = { settingsRouter }
