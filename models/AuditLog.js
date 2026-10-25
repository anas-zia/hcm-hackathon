import mongoose from 'mongoose';

// Only ever created, never updated or deleted (no route exists for that).
export default mongoose.model('AuditLog', new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  actorRole: String,
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
}, { timestamps: true }));
