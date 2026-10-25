import AuditLog from '../models/AuditLog.js';

// Write one audit row. Never throws: a failed log must not break the real action.
async function audit(user, action, entity, entityId, before, after) {
  try {
    await AuditLog.create({
      actor: user ? user._id : undefined,
      actorName: user ? user.name : 'system',
      actorRole: user ? user.role : 'system',
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      before,
      after,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

export default audit;
