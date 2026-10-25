import asyncHandler from '../utils/asyncHandler.js';
import * as payroll from '../services/payrollService.js';

export const run = asyncHandler(async (req, res) => {
  res.status(201).json(await payroll.runPayroll(req.user, req.body.month));
});

export const list = asyncHandler(async (req, res) => {
  res.json(await payroll.listRuns());
});

export const getOne = asyncHandler(async (req, res) => {
  res.json(await payroll.getRun(req.params.id));
});

export const finalize = asyncHandler(async (req, res) => {
  res.json(await payroll.finalizePayroll(req.user, req.params.id));
});

export const myPayslips = asyncHandler(async (req, res) => {
  res.json(await payroll.myPayslips(req.user));
});
