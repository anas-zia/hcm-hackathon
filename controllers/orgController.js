import asyncHandler from '../utils/asyncHandler.js';
import * as org from '../services/orgService.js';
import * as auth from '../services/authService.js';
import { getSettings as loadSettings } from '../services/settingsService.js';

export const getSettings = asyncHandler(async (req, res) => {
  res.json(await loadSettings());
});

export const updateSettings = asyncHandler(async (req, res) => {
  res.json(await org.updateSettings(req.user, req.body));
});

export const listDepartments = asyncHandler(async (req, res) => {
  res.json(await org.listDepartments());
});

export const createDepartment = asyncHandler(async (req, res) => {
  res.status(201).json(await org.createDepartment(req.user, req.body));
});

export const listUsers = asyncHandler(async (req, res) => {
  res.json(await org.listUsers());
});

export const createHr = asyncHandler(async (req, res) => {
  res.status(201).json(await auth.createHr(req.user, req.body));
});

export const resetPassword = asyncHandler(async (req, res) => {
  res.json(await auth.resetPassword(req.user, req.params.id));
});

export const setActive = asyncHandler(async (req, res) => {
  res.json(await auth.setActive(req.user, req.params.id, Boolean(req.body.active)));
});
