const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, default: 'cashier' },
    shopIds: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    salaryOrWage: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

const User = mongoose.models.User ?? mongoose.model('User', userSchema)

module.exports = { User }
