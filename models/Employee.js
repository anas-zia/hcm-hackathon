import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  address: String,
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  designation: { type: String, required: true },
  joinDate: { type: String, required: true }, // YYYY-MM-DD
  exitDate: String,
  status: { type: String, enum: ['active', 'probation', 'exited'], default: 'active' },
  basicSalary: { type: Number, required: true, min: 1 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Employee', schema);
