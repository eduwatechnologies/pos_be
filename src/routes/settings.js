const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess } = require('../utils/require-shop-access')
const settingsController = require('../controllers/settings-controller')

const settingsRouter = express.Router({ mergeParams: true })

settingsRouter.get('/', requireAuth, requireShopAccess, settingsController.getSettings)

settingsRouter.patch('/', requireAuth, requireShopAccess, settingsController.updateSettings)

module.exports = { settingsRouter }
