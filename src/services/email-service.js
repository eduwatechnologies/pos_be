const { Resend } = require('resend')
const { requireEnv } = require('../utils/require-env')

let resendClient = null

function getResendClient() {
  if (resendClient) return resendClient
  const apiKey = requireEnv('RESENDER_KEY')
  resendClient = new Resend(apiKey)
  return resendClient
}

async function sendEmail({ to, subject, html, text, from, replyTo }) {
  try {
    const resend = getResendClient()
    const fromEmail = from || process.env.EMAIL_FROM || 'Kounter <noreply@kounter.ng>'
    const payload = {
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }
    if (replyTo) payload.replyTo = replyTo

    const result = await resend.emails.send(payload)
    return { success: true, data: result }
  } catch (error) {
    console.error('Email send failed:', error.message)
    return { success: false, error: error.message }
  }
}

async function sendOrderConfirmation({ to, orderDetails }) {
  const { orderNumber, customerName, items, totalCents, shopName } = orderDetails
  const total = (totalCents / 100).toFixed(2)

  const itemsHtml = items
    .map(
      (item) =>
        `<tr><td style="padding:8px;border:1px solid #ddd;">${item.name}</td><td style="padding:8px;border:1px solid #ddd;">${item.qty}</td><td style="padding:8px;border:1px solid #ddd;">₦${(item.unitPriceCents / 100).toFixed(2)}</td></tr>`,
    )
    .join('')

  const html = `
    <h2>Order Confirmation</h2>
    <p>Hi ${customerName},</p>
    <p>Thank you for your order from ${shopName}!</p>
    <p><strong>Order Number:</strong> ${orderNumber}</p>
    <table style="border-collapse:collapse;width:100%;max-width:400px;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Item</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Qty</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Price</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p><strong>Total: ₦${total}</strong></p>
    <p>We'll notify you when your order is ready.</p>
  `

  return sendEmail({
    to,
    subject: `Order Confirmation - ${orderNumber}`,
    html,
    text: `Order ${orderNumber} confirmed. Total: ₦${total}`,
  })
}

async function sendLowStockAlert({ to, productDetails }) {
  const { productName, stockQty, lowStockThreshold, shopName } = productDetails

  const html = `
    <h2>Low Stock Alert</h2>
    <p><strong>Shop:</strong> ${shopName}</p>
    <p><strong>Product:</strong> ${productName}</p>
    <p><strong>Current Stock:</strong> ${stockQty} units</p>
    <p><strong>Low Stock Threshold:</strong> ${lowStockThreshold} units</p>
    <p style="color:#d97706;">This product is running low and may need restocking.</p>
  `

  return sendEmail({
    to,
    subject: `Low Stock Alert - ${productName}`,
    html,
    text: `Low stock alert: ${productName} has ${stockQty} units left (threshold: ${lowStockThreshold})`,
  })
}

async function sendPasswordReset({ to, resetToken, userName }) {
  const resetUrl = process.env.PASSWORD_RESET_URL || `https://admin.kounter.ng/reset-password?token=${resetToken}`

  const html = `
    <h2>Password Reset</h2>
    <p>Hi ${userName},</p>
    <p>You requested a password reset. Click the link below to reset your password:</p>
    <p><a href="${resetUrl}" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;">Reset Password</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `

  return sendEmail({
    to,
    subject: 'Reset Your Password - Kounter',
    html,
    text: `Reset your password: ${resetUrl}`,
  })
}

async function sendNotification({ to, subject, message }) {
  const html = `<p>${message.replace(/\n/g, '<br>')}</p>`

  return sendEmail({
    to,
    subject,
    html,
    text: message,
  })
}

module.exports = {
  sendEmail,
  sendOrderConfirmation,
  sendLowStockAlert,
  sendPasswordReset,
  sendNotification,
}
