import express from 'express';
import * as c from '../controllers/attendanceController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.post('/check-in', role('EMPLOYEE'), c.checkIn);
router.post('/check-out', role('EMPLOYEE'), c.checkOut);
router.get('/me', role('EMPLOYEE'), c.myMonth);
router.get('/board', role('ADMIN', 'HR'), c.board);

export default router;
