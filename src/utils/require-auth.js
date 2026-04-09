const jwt = require('jsonwebtoken')

const { requireEnv } = require('./require-env')
const { User } = require('../schemas/user')

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization ?? ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const jwtSecret = requireEnv('JWT_SECRET')
    const payload = jwt.verify(token, jwtSecret)
    const userId = payload?.sub ? String(payload.sub) : ''
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const user = await User.findById(userId).select({ email: 1, name: 1, role: 1, shopIds: 1, isActive: 1 }).lean()
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account disabled' })
    }

    req.user = {
      ...payload,
      sub: userId,
      email: user.email,
      name: user.name,
      role: user.role,
      shopIds: Array.isArray(user.shopIds) ? user.shopIds : [],
      isActive: user.isActive !== false,
    }
    return next()
  } catch (err) {
    if (String(err?.message ?? '').startsWith('Missing required env var:')) {
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

module.exports = { requireAuth }
