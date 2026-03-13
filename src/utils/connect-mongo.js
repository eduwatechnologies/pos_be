const mongoose = require('mongoose')

async function connectMongo({ mongoUri }) {
  mongoose.set('bufferCommands', false)

  if (!mongoUri) {
    const err = new Error('Missing MONGODB_URI')
    err.status = 500
    throw err
  }

  if (mongoose.connection.readyState === 1) {
    return { connected: true }
  }

  await mongoose.connect(mongoUri)
  return { connected: true }
}

module.exports = { connectMongo }
