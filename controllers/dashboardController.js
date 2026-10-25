import asyncHandler from '../utils/asyncHandler.js';
import * as dashboard from '../services/dashboardService.js';

export const admin = asyncHandler(async (req, res) => res.json(await dashboard.adminDashboard(req.query)));
export const hr = asyncHandler(async (req, res) => res.json(await dashboard.hrDashboard(req.query)));
export const employee = asyncHandler(async (req, res) => res.json(await dashboard.employeeDashboard(req.user)));
