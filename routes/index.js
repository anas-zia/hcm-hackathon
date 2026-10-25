import express from 'express';
import { notFound } from '../middleware/errorMiddleware.js';
import authRoutes from './authRoutes.js';
import orgRoutes from './orgRoutes.js';
import employeeRoutes from './employeeRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import leaveRoutes from './leaveRoutes.js';
import payrollRoutes from './payrollRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import aiRoutes from './aiRoutes.js';
import commsRoutes from './commsRoutes.js';

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));
router.use('/auth', authRoutes);
router.use('/org', orgRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/payroll', payrollRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/ai', aiRoutes);
router.use(commsRoutes);   // /announcements, /notifications, /audit (keep it after the others: it applies auth to everything below)
router.use(notFound);

export default router;
