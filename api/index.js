require('dotenv').config()

const { createApp } = require('../src/app')
const { connectMongo } = require('../src/utils/connect-mongo')

let expressApp = null
let mongoReady = false

async function ensureReady() {
  if (!mongoReady) {
    await connectMongo({ mongoUri: process.env.MONGODB_URI })
    mongoReady = true
  }
}

async function getApp() {
  if (!expressApp) {
    expressApp = createApp().app
  }

  await ensureReady()
  return expressApp
}

module.exports = async function handler(req, res) {
  const app = await getApp()
  return app(req, res)
}
