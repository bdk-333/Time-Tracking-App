const express = require("express");
const {
  startTask,
  pauseCurrent,
  resumeCurrent,
  endCurrent,
  getCurrent,
  getTodayTotals,
} = require("../services/timerService");

const router = express.Router();

router.get("/current", (_req, res, next) => {
  try {
    res.json({ current: getCurrent() });
  } catch (error) {
    next(error);
  }
});

router.post("/start", (req, res, next) => {
  try {
    const current = startTask(req.body?.taskId);
    res.json({ current });
  } catch (error) {
    next(error);
  }
});

router.post("/pause", (_req, res, next) => {
  try {
    const current = pauseCurrent();
    res.json({ current });
  } catch (error) {
    next(error);
  }
});

router.post("/resume", (_req, res, next) => {
  try {
    const current = resumeCurrent();
    res.json({ current });
  } catch (error) {
    next(error);
  }
});

router.post("/end", (_req, res, next) => {
  try {
    endCurrent();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/totals/today", (_req, res, next) => {
  try {
    res.json(getTodayTotals());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
