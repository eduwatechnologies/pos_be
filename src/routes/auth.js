const express = require('express')
const { requireAuth } = require('../utils/require-auth')
const authController = require('../controllers/auth-controller')

const authRouter = express.Router()

authRouter.post('/register', authController.register)
authRouter.post('/login', authController.login)
authRouter.get('/me', requireAuth, authController.me)

module.exports = { authRouter }
