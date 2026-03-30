const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const expensesController = require('../controllers/expenses-controller')

const expensesRouter = express.Router({ mergeParams: true })

expensesRouter.get('/', requireAuth, requireShopAccess, requireShopPermission('analytics'), expensesController.listExpenses)

expensesRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('analytics'), expensesController.createExpense)

expensesRouter.get('/:expenseId', requireAuth, requireShopAccess, requireShopPermission('analytics'), expensesController.getExpense)

expensesRouter.patch('/:expenseId', requireAuth, requireShopAccess, requireShopPermission('analytics'), expensesController.updateExpense)

expensesRouter.delete('/:expenseId', requireAuth, requireShopAccess, requireShopPermission('analytics'), expensesController.deleteExpense)

module.exports = { expensesRouter }
