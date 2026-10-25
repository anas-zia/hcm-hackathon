import express from 'express';
import * as c from '../controllers/employeeController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.get('/', c.list);                                   // Employee: scoped to own row inside the service
router.post('/', role('HR'), c.create);
router.get('/:id', c.getOne);                              // Employee: only own id
router.put('/:id', role('HR', 'EMPLOYEE'), c.update);      // Admin is view-only

export default router;
