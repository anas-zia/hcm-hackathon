import mongoose from 'mongoose';

export default mongoose.model('AiLog', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: String, // chat | summary | smart_leave
  prompt: String,
  toolsUsed: [String],
  answer: String,
  success: Boolean,
  error: String,
}, { timestamps: true }));
