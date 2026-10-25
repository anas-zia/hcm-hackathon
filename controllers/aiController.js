import asyncHandler from '../utils/asyncHandler.js';
import * as ai from '../services/aiService.js';

export const chat = asyncHandler(async (req, res) => {
  res.json(await ai.chat(req.user, req.body.message, req.body.history));
});

export const summary = asyncHandler(async (req, res) => {
  res.json(await ai.summarize(req.user, req.body));
});

export const smartLeave = asyncHandler(async (req, res) => {
  res.json(await ai.smartLeave(req.user, req.body.sentence));
});
