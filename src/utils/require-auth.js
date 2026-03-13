const jwt = require('jsonwebtoken')

const { requireEnv } = require('./require-env')

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization ?? ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const jwtSecret = requireEnv('JWT_SECRET')
    const payload = jwt.verify(token, jwtSecret)
    req.user = payload
    return next()
  } catch (err) {
    if (String(err?.message ?? '').startsWith('Missing required env var:')) {
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

module.exports = { requireAuth }
