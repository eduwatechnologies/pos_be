const express = require('express')

const { requireAuth } = require('../utils/require-auth')
const usersController = require('../controllers/users-controller')

const usersRouter = express.Router()

usersRouter.get('/', requireAuth, usersController.listUsers)
usersRouter.post('/', requireAuth, usersController.createUser)
usersRouter.get('/:userId', requireAuth, usersController.getUser)
usersRouter.patch('/:userId', requireAuth, usersController.updateUser)

module.exports = { usersRouter }

