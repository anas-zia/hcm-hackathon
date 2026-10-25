import express from 'express';
import * as c from '../controllers/aiController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.post('/chat', c.chat);
router.post('/summary', role('ADMIN', 'HR'), c.summary);
router.post('/smart-leave', role('EMPLOYEE'), c.smartLeave);

export default router;
