const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess } = require('../utils/require-shop-access')
const receiptsController = require('../controllers/receipts-controller')

const receiptsRouter = express.Router({ mergeParams: true })

receiptsRouter.get('/', requireAuth, requireShopAccess, receiptsController.listReceipts)

receiptsRouter.post('/', requireAuth, requireShopAccess, receiptsController.createReceipt)

receiptsRouter.get('/:receiptId', requireAuth, requireShopAccess, receiptsController.getReceipt)

receiptsRouter.post('/:receiptId/refund', requireAuth, requireShopAccess, receiptsController.refundReceipt)

module.exports = { receiptsRouter }
