const express = require("express");
const {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} = require("../services/taskService");

const router = express.Router();

router.get("/", (_req, res, next) => {
  try {
    res.json({ tasks: listTasks() });
  } catch (error) {
    next(error);
  }
});

router.post("/", (req, res, next) => {
  try {
    const task = createTask(req.body?.name, req.body?.projectId ?? null);
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", (req, res, next) => {
  try {
    const task = updateTask(req.params.id, req.body?.name, req.body?.projectId ?? null);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", (req, res, next) => {
  try {
    deleteTask(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
