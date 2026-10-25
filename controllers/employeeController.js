import asyncHandler from '../utils/asyncHandler.js';
import * as employees from '../services/employeeService.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await employees.listEmployees(req.user, req.query));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await employees.createEmployee(req.user, req.body));
});

export const getOne = asyncHandler(async (req, res) => {
  res.json(await employees.getEmployee360(req.user, req.params.id));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await employees.updateEmployee(req.user, req.params.id, req.body));
});
