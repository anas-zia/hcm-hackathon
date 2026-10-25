import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'HR', 'EMPLOYEE'], required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // only for EMPLOYEE role
  mustChangePassword: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('User', schema);
