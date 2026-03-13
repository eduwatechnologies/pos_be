function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Not found' })
}

function errorHandler(err, _req, res, _next) {
  const status = typeof err?.status === 'number' ? err.status : 500
  const message = status === 500 ? 'Internal server error' : err.message
  res.status(status).json({ error: message })
}

module.exports = { notFoundHandler, errorHandler }

