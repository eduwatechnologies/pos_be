function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    const err = new Error(`Missing required env var: ${name}`)
    err.status = 500
    throw err
  }
  return value
}

module.exports = { requireEnv }

