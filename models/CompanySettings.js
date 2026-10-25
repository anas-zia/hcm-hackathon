import mongoose from 'mongoose';

// One document only. Created by the first-run setup.
const schema = new mongoose.Schema({
  companyName: { type: String, required: true },
  officeStart: { type: String, default: '09:00' }, // HH:mm
  graceMinutes: { type: Number, default: 15 },
  halfDayHours: { type: Number, default: 5 },
  weekendDays: { type: [Number], default: [0, 6] }, // Sat-Sun (0 = Sunday)
  officeLat: Number,
  officeLng: Number,
  officeRadius: { type: Number, default: 150 },
  leaveQuotas: {
    annual: { type: Number, default: 14 },
    sick: { type: Number, default: 8 },
    casual: { type: Number, default: 10 },
  },
  designations: { type: [String], default: [] },
  holidays: { type: [{ date: String, name: String }], default: [] },
}, { timestamps: true });

export default mongoose.model('CompanySettings', schema);
