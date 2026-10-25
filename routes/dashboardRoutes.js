import express from 'express';
import * as c from '../controllers/dashboardController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.get('/admin', role('ADMIN'), c.admin);
router.get('/hr', role('HR'), c.hr);
router.get('/employee', role('EMPLOYEE'), c.employee);

export default router;
