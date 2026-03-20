const express = require('express')
const { requireAuth } = require('../utils/require-auth')
const billingController = require('../controllers/billing-controller')

const billingRouter = express.Router()

billingRouter.get('/plans', requireAuth, billingController.listPlans)
billingRouter.post('/plans', requireAuth, billingController.createPlan)
billingRouter.patch('/plans/:planId', requireAuth, billingController.updatePlan)

billingRouter.get('/subscriptions', requireAuth, billingController.listSubscriptions)
billingRouter.post('/subscriptions', requireAuth, billingController.createSubscription)
billingRouter.patch('/subscriptions/:subscriptionId', requireAuth, billingController.updateSubscription)

billingRouter.get('/invoices', requireAuth, billingController.listInvoices)
billingRouter.post('/invoices/:invoiceId/pay', requireAuth, billingController.markInvoicePaid)

module.exports = { billingRouter }

