import mongoose from 'mongoose';

export default mongoose.model('Department', new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
}, { timestamps: true }));
