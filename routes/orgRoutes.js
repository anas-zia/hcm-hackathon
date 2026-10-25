import express from 'express';
import * as c from '../controllers/orgController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.get('/settings', c.getSettings);
router.put('/settings', role('ADMIN'), c.updateSettings);
router.get('/departments', c.listDepartments);
router.post('/departments', role('ADMIN'), c.createDepartment);
router.get('/users', role('ADMIN'), c.listUsers);
router.post('/hr', role('ADMIN'), c.createHr);
router.patch('/users/:id/reset-password', role('ADMIN'), c.resetPassword);
router.patch('/users/:id/active', role('ADMIN'), c.setActive);

export default router;
