import express from 'express';
import * as c from '../controllers/commsController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.get('/announcements', c.listAnnouncements);
router.post('/announcements', role('ADMIN', 'HR'), c.postAnnouncement);
router.get('/notifications', c.listNotifications);
router.patch('/notifications/read', c.markAllRead);
router.get('/audit', role('ADMIN'), c.listAudit);

export default router;
