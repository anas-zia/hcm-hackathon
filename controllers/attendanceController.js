import asyncHandler from '../utils/asyncHandler.js';
import * as attendance from '../services/attendanceService.js';
import { todayStr } from '../utils/dateUtils.js';

export const checkIn = asyncHandler(async (req, res) => {
  res.status(201).json(await attendance.checkIn(req.user));
});

export const checkOut = asyncHandler(async (req, res) => {
  res.json(await attendance.checkOut(req.user));
});

export const myMonth = asyncHandler(async (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7);
  res.json(await attendance.getMyMonth(req.user, month));
});

export const board = asyncHandler(async (req, res) => {
  res.json(await attendance.getDailyBoard(req.query.date || todayStr(), req.query.department));
});
