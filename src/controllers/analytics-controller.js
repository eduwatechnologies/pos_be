const { Receipt } = require('../schemas/receipt')

async function revenue(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const match = { shopId, status: 'paid' }
  if (from || to) {
    match.paidAt = {}
    if (from) match.paidAt.$gte = new Date(from)
    if (to) match.paidAt.$lte = new Date(to)
  }

  const [summary] = await Receipt.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSalesCents: { $sum: '$totalCents' },
        totalTransactions: { $sum: 1 },
        averageOrderValueCents: { $avg: '$totalCents' },
      },
    },
    { $project: { _id: 0 } },
  ])

  res.status(200).json({
    totalSalesCents: summary?.totalSalesCents ?? 0,
    totalTransactions: summary?.totalTransactions ?? 0,
    averageOrderValueCents: Math.round(summary?.averageOrderValueCents ?? 0),
  })
}

async function bestSellers(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const match = { shopId, status: 'paid' }
  if (from || to) {
    match.paidAt = {}
    if (from) match.paidAt.$gte = new Date(from)
    if (to) match.paidAt.$lte = new Date(to)
  }

  const items = await Receipt.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        qty: { $sum: '$items.qty' },
        revenueCents: { $sum: '$items.lineTotalCents' },
      },
    },
    { $sort: { revenueCents: -1 } },
    { $limit: 20 },
    { $project: { _id: 0, name: '$_id', qty: 1, revenueCents: 1 } },
  ])

  res.status(200).json({ items })
}

async function paymentBreakdown(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const match = { shopId, status: 'paid' }
  if (from || to) {
    match.paidAt = {}
    if (from) match.paidAt.$gte = new Date(from)
    if (to) match.paidAt.$lte = new Date(to)
  }

  const items = await Receipt.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalCents: { $sum: '$totalCents' },
      },
    },
    { $sort: { totalCents: -1 } },
    { $project: { _id: 0, paymentMethod: '$_id', count: 1, totalCents: 1 } },
  ])

  res.status(200).json({ items })
}

async function employeePerformance(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const match = { shopId, status: 'paid' }
  if (from || to) {
    match.paidAt = {}
    if (from) match.paidAt.$gte = new Date(from)
    if (to) match.paidAt.$lte = new Date(to)
  }

  const items = await Receipt.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$cashierUserId',
        totalSalesCents: { $sum: '$totalCents' },
        totalTransactions: { $sum: 1 },
      },
    },
    { $sort: { totalSalesCents: -1 } },
    { $limit: 50 },
    { $project: { _id: 0, cashierUserId: '$_id', totalSalesCents: 1, totalTransactions: 1 } },
  ])

  res.status(200).json({ items })
}

module.exports = { revenue, bestSellers, paymentBreakdown, employeePerformance }

