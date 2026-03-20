const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const receiptsController = require('../controllers/receipts-controller')

const receiptsRouter = express.Router({ mergeParams: true })

receiptsRouter.get('/', requireAuth, requireShopAccess, requireShopPermission('receipts'), receiptsController.listReceipts)

receiptsRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('terminal'), receiptsController.createReceipt)

receiptsRouter.get('/:receiptId', requireAuth, requireShopAccess, requireShopPermission('receipts'), receiptsController.getReceipt)

receiptsRouter.post('/:receiptId/refund', requireAuth, requireShopAccess, requireShopPermission('receipts'), receiptsController.refundReceipt)

module.exports = { receiptsRouter }
