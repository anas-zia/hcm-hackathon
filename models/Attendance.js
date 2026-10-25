import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: Date,
  checkOut: Date,
  status: { type: String, enum: ['present', 'late', 'half_day'], default: 'present' },
  source: { type: String, default: 'web' },
}, { timestamps: true });

// One record per employee per day (second check-in = 409)
schema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', schema);
