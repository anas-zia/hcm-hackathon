import asyncHandler from '../utils/asyncHandler.js';
import * as comms from '../services/commsService.js';

export const listAnnouncements = asyncHandler(async (req, res) => {
  res.json(await comms.listAnnouncements());
});

export const postAnnouncement = asyncHandler(async (req, res) => {
  res.status(201).json(await comms.postAnnouncement(req.user, req.body));
});

export const listNotifications = asyncHandler(async (req, res) => {
  res.json(await comms.listNotifications(req.user));
});

export const markAllRead = asyncHandler(async (req, res) => {
  res.json(await comms.markAllRead(req.user));
});

export const listAudit = asyncHandler(async (req, res) => {
  res.json(await comms.listAudit(req.query));
});
