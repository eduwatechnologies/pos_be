const { Receipt } = require('../schemas/receipt')
const { Expense } = require('../schemas/expense')

function parseDate(input) {
  if (!input) return null
  const d = new Date(String(input))
  if (Number.isNaN(d.getTime())) return null
  return d
}

function buildRange(field, from, to) {
  const fromDate = parseDate(from)
  const toDate = parseDate(to)
  if (!fromDate && !toDate) return null
  const range = {}
  if (fromDate) range.$gte = fromDate
  if (toDate) range.$lte = toDate
  return { [field]: range }
}

async function summary(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const salesMatch = { shopId }
  const salesRange = buildRange('paidAt', from, to)
  if (salesRange) Object.assign(salesMatch, salesRange)

  const expenseMatch = { shopId }
  const expenseRange = buildRange('occurredAt', from, to)
  if (expenseRange) Object.assign(expenseMatch, expenseRange)

  const [salesAgg] = await Receipt.aggregate([
    { $match: salesMatch },
    {
      $group: {
        _id: null,
        grossSalesCents: { $sum: '$totalCents' },
        grossSubtotalCents: { $sum: '$subtotalCents' },
        grossTaxCents: { $sum: '$taxCents' },
        transactions: { $sum: 1 },
        refundedSalesCents: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$totalCents', 0] } },
        refundedCount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
      },
    },
    { $project: { _id: 0 } },
  ])

  const [expenseAgg] = await Expense.aggregate([
    { $match: expenseMatch },
    { $group: { _id: null, expensesCents: { $sum: '$amountCents' }, expenseCount: { $sum: 1 } } },
    { $project: { _id: 0 } },
  ])

  const grossSalesCents = Number(salesAgg?.grossSalesCents ?? 0)
  const refundedSalesCents = Number(salesAgg?.refundedSalesCents ?? 0)
  const netSalesCents = grossSalesCents - refundedSalesCents
  const expensesCents = Number(expenseAgg?.expensesCents ?? 0)
  const netCents = netSalesCents - expensesCents
  const transactions = Number(salesAgg?.transactions ?? 0)

  res.status(200).json({
    grossSalesCents,
    grossSubtotalCents: Number(salesAgg?.grossSubtotalCents ?? 0),
    grossTaxCents: Number(salesAgg?.grossTaxCents ?? 0),
    refundedSalesCents,
    refundedCount: Number(salesAgg?.refundedCount ?? 0),
    netSalesCents,
    transactions,
    averageOrderValueCents: transactions ? Math.round(netSalesCents / transactions) : 0,
    expensesCents,
    expenseCount: Number(expenseAgg?.expenseCount ?? 0),
    netCents,
  })
}

async function salesByDay(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const match = { shopId }
  const range = buildRange('paidAt', from, to)
  if (range) Object.assign(match, range)

  const items = await Receipt.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
        grossSalesCents: { $sum: '$totalCents' },
        transactions: { $sum: 1 },
        refundedSalesCents: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$totalCents', 0] } },
        refundedCount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
      },
    },
    { $addFields: { date: '$_id', netSalesCents: { $subtract: ['$grossSalesCents', '$refundedSalesCents'] } } },
    { $project: { _id: 0 } },
    { $sort: { date: 1 } },
  ])

  res.status(200).json({ items })
}

async function topProducts(req, res) {
  const shopId = req.params.shopId
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()
  const limitRaw = Number(req.query.limit ?? 20)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20

  const match = { shopId }
  const range = buildRange('paidAt', from, to)
  if (range) Object.assign(match, range)

  const items = await Receipt.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: { productId: '$items.productId', name: '$items.name' },
        qty: {
          $sum: {
            $cond: [{ $eq: ['$status', 'refunded'] }, { $multiply: ['$items.qty', -1] }, '$items.qty'],
          },
        },
        revenueCents: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'refunded'] },
              { $multiply: ['$items.lineTotalCents', -1] },
              '$items.lineTotalCents',
            ],
          },
        },
      },
    },
    { $sort: { revenueCents: -1 } },
    { $limit: limit },
    { $project: { _id: 0, productId: '$_id.productId', name: '$_id.name', qty: 1, revenueCents: 1 } },
  ])

  res.status(200).json({ items })
}

module.exports = { summary, salesByDay, topProducts }
