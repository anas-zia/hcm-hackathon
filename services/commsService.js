import Announcement from '../models/Announcement.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import { required } from '../utils/validate.js';
import audit from '../utils/audit.js';

async function listAnnouncements() {
  return Announcement.find().sort({ createdAt: -1 }).limit(50);
}

async function postAnnouncement(user, body) {
  required(body, ['title', 'body']);
  const item = await Announcement.create({
    title: body.title, body: body.body, postedBy: user.name, postedByRole: user.role,
  });
  await audit(user, 'create', 'announcement', item._id, null, { title: item.title });
  return item;
}

// Notifications are always limited to the logged-in user
async function listNotifications(user) {
  return Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(30);
}

async function markAllRead(user) {
  await Notification.updateMany({ user: user._id, read: false }, { read: true });
  return { ok: true };
}

async function listAudit({ entity } = {}) {
  const filter = {};
  if (entity) filter.entity = entity;
  return AuditLog.find(filter).sort({ createdAt: -1 }).limit(200);
}

export { listAnnouncements, postAnnouncement, listNotifications, markAllRead, listAudit };
