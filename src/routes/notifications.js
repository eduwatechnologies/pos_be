const express = require('express')
const { requireAuth } = require('../utils/require-auth')
const { sendEmail, sendNotification, sendLowStockAlert, sendOrderConfirmation, sendPasswordReset } = require('../services/email-service')

const notificationsRouter = express.Router()

notificationsRouter.post('/send', requireAuth, async (req, res) => {
  const { to, subject, message, html, text } = req.body ?? {}
  if (!to || !subject) {
    return res.status(400).json({ error: 'to and subject are required' })
  }
  const result = await sendEmail({ to, subject, html, text: text || message, message })
  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to send email' })
  }
  return res.status(200).json({ ok: true, data: result.data })
})

notificationsRouter.post('/notification', requireAuth, async (req, res) => {
  const { to, subject, message } = req.body ?? {}
  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'to, subject and message are required' })
  }
  const result = await sendNotification({ to, subject, message })
  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to send notification' })
  }
  return res.status(200).json({ ok: true, data: result.data })
})

notificationsRouter.post('/order-confirmation', requireAuth, async (req, res) => {
  const { to, orderDetails } = req.body ?? {}
  if (!to || !orderDetails) {
    return res.status(400).json({ error: 'to and orderDetails are required' })
  }
  const result = await sendOrderConfirmation({ to, orderDetails })
  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to send order confirmation' })
  }
  return res.status(200).json({ ok: true, data: result.data })
})

notificationsRouter.post('/low-stock', requireAuth, async (req, res) => {
  const { to, productDetails } = req.body ?? {}
  if (!to || !productDetails) {
    return res.status(400).json({ error: 'to and productDetails are required' })
  }
  const result = await sendLowStockAlert({ to, productDetails })
  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to send low stock alert' })
  }
  return res.status(200).json({ ok: true, data: result.data })
})

module.exports = { notificationsRouter }
