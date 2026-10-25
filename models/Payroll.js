import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: String,
  employeeCode: String,
  department: String,
  basic: Number,
  hra: Number,
  medical: Number,
  gross: Number,
  workingDays: Number,    // working days in the month
  payableDays: Number,    // working days the employee was employed (joiners/leavers)
  absentDays: Number,
  unpaidDays: Number,
  halfDays: Number,
  deduction: Number,
  tax: Number,
  net: Number,
}, { _id: false });

const schema = new mongoose.Schema({
  month: { type: String, required: true, unique: true }, // YYYY-MM
  status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
  items: [itemSchema],
  totalGross: Number,
  totalNet: Number,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedAt: Date,
}, { timestamps: true });

export default mongoose.model('Payroll', schema);
