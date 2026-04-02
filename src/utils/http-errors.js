function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Not found' })
}

function errorHandler(err, _req, res, _next) {
  let status = typeof err?.status === 'number' ? err.status : 500
  if (err?.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
  }
  const isProd = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production'
  const message = status === 500 && isProd ? 'Internal server error' : err?.message || 'Internal server error'
  if (status === 500) {
    console.error(err)
  }
  res.status(status).json({ error: message })
}

module.exports = { notFoundHandler, errorHandler }
