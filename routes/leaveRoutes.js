import express from 'express';
import * as c from '../controllers/leaveController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.post('/', role('EMPLOYEE'), c.apply);
router.get('/', c.list);                  // Employee: own only (scoped in service)
router.get('/balance', c.balance);
router.patch('/:id/approve', role('HR'), c.approve);
router.patch('/:id/reject', role('HR'), c.reject);
router.patch('/:id/cancel', role('EMPLOYEE'), c.cancel);

export default router;
