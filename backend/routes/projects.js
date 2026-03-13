const express = require("express");
const {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
} = require("../services/projectService");

const router = express.Router();

router.get("/", (_req, res, next) => {
  try {
    res.json({ projects: listProjects() });
  } catch (error) {
    next(error);
  }
});

router.post("/", (req, res, next) => {
  try {
    const project = createProject(req.body?.name);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", (req, res, next) => {
  try {
    const project = updateProject(req.params.id, req.body?.name);
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", (req, res, next) => {
  try {
    deleteProject(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
