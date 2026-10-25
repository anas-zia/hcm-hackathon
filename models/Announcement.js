import mongoose from 'mongoose';

export default mongoose.model('Announcement', new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  postedBy: String,
  postedByRole: String,
}, { timestamps: true }));
