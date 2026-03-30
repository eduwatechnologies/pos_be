const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const auditController = require('../controllers/audit-controller')

const auditRouter = express.Router({ mergeParams: true })

auditRouter.get('/', requireAuth, requireShopAccess, requireShopPermission('settings'), auditController.listAuditLogs)

module.exports = { auditRouter }
