import express from 'express';
import * as c from '../controllers/payrollController.js';
import auth from '../middleware/authMiddleware.js';
import role from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(auth);
router.post('/run', role('HR'), c.run);
router.get('/my', role('EMPLOYEE'), c.myPayslips);   // must stay above '/:id'
router.get('/', role('ADMIN', 'HR'), c.list);
router.get('/:id', role('ADMIN', 'HR'), c.getOne);
router.post('/:id/finalize', role('ADMIN'), c.finalize);

export default router;
