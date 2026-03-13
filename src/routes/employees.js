const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess } = require('../utils/require-shop-access')
const employeesController = require('../controllers/employees-controller')

const employeesRouter = express.Router({ mergeParams: true })

employeesRouter.get('/', requireAuth, requireShopAccess, employeesController.listEmployees)

employeesRouter.post('/', requireAuth, requireShopAccess, employeesController.createEmployee)

employeesRouter.get('/:employeeId', requireAuth, requireShopAccess, employeesController.getEmployee)

employeesRouter.patch('/:employeeId', requireAuth, requireShopAccess, employeesController.updateEmployee)

employeesRouter.delete('/:employeeId', requireAuth, requireShopAccess, employeesController.deleteEmployee)

employeesRouter.patch('/:employeeId/status', requireAuth, requireShopAccess, employeesController.setEmployeeStatus)

module.exports = { employeesRouter }
