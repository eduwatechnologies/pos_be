const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const { requireShopAccess, requireShopPermission } = require('../utils/require-shop-access')
const employeesController = require('../controllers/employees-controller')

const employeesRouter = express.Router({ mergeParams: true })

employeesRouter.get('/', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.listEmployees)

employeesRouter.post('/', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.createEmployee)

employeesRouter.get('/:employeeId', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.getEmployee)

employeesRouter.patch('/:employeeId', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.updateEmployee)

employeesRouter.delete('/:employeeId', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.deleteEmployee)

employeesRouter.patch('/:employeeId/status', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.setEmployeeStatus)

employeesRouter.patch('/:employeeId/password', requireAuth, requireShopAccess, requireShopPermission('employees'), employeesController.setEmployeePassword)

module.exports = { employeesRouter }
