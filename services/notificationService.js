import Notification from '../models/Notification.js';
import User from '../models/User.js';

async function notifyUser(userId, message) {
  if (!userId) return;
  await Notification.create({ user: userId, message });
}

async function notifyRole(role, message) {
  const users = await User.find({ role, active: true }).select('_id');
  if (users.length) await Notification.insertMany(users.map((u) => ({ user: u._id, message })));
}

export { notifyUser, notifyRole };
