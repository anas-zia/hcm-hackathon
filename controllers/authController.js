import asyncHandler from '../utils/asyncHandler.js';
import * as auth from '../services/authService.js';

export const setupStatus = asyncHandler(async (req, res) => {
  res.json({ setupDone: await auth.isSetupDone() });
});

export const setup = asyncHandler(async (req, res) => {
  res.status(201).json(await auth.firstRunSetup(req.body));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await auth.login(req.body.email, req.body.password));
});

export const changePassword = asyncHandler(async (req, res) => {
  res.json({ user: await auth.changePassword(req.user, req.body.currentPassword, req.body.newPassword) });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});
