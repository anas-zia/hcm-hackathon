import express from 'express';
import * as c from '../controllers/authController.js';
import auth from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/setup-status', c.setupStatus);
router.post('/setup', c.setup);
router.post('/login', c.login);
router.post('/change-password', auth, c.changePassword);
router.get('/me', auth, c.me);

export default router;
