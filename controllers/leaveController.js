import asyncHandler from '../utils/asyncHandler.js';
import * as leaves from '../services/leaveService.js';

export const apply = asyncHandler(async (req, res) => {
  res.status(201).json(await leaves.applyLeave(req.user, req.body));
});

export const list = asyncHandler(async (req, res) => {
  res.json(await leaves.listLeaves(req.user, req.query));
});

export const balance = asyncHandler(async (req, res) => {
  // Employees always get their OWN balance; the id in the URL is ignored for them
  const id = req.user.role === 'EMPLOYEE' ? req.user.employee : req.query.employeeId;
  res.json(await leaves.getBalance(id));
});

export const approve = asyncHandler(async (req, res) => {
  res.json(await leaves.decideLeave(req.user, req.params.id, 'approved', req.body.comment));
});

export const reject = asyncHandler(async (req, res) => {
  res.json(await leaves.decideLeave(req.user, req.params.id, 'rejected', req.body.comment));
});

export const cancel = asyncHandler(async (req, res) => {
  res.json(await leaves.cancelLeave(req.user, req.params.id));
});
