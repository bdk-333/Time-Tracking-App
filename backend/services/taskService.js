const { db } = require("../db");
const { toIsoTimestamp } = require("../timeUtils");

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateName(name) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) {
    throw makeError(400, "Task name is required.");
  }
  if (cleanName.length > 100) {
    throw makeError(400, "Task name must be 100 characters or fewer.");
  }
  return cleanName;
}

function normalizeProjectId(projectId) {
  if (projectId === null || projectId === undefined || projectId === "") {
    return null;
  }
  const parsed = Number(projectId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw makeError(400, "projectId must be a positive integer or null.");
  }
  return parsed;
}

function assertProjectExists(projectId) {
  if (projectId == null) {
    return;
  }

  const project = db
    .prepare(
      `SELECT id
       FROM projects
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId);

  if (!project) {
    throw makeError(400, "Associated project not found.");
  }
}

function listTasks() {
  return db
    .prepare(
      `SELECT t.id, t.name, t.project_id AS projectId, p.name AS projectName, t.created_at, t.updated_at
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       WHERE t.deleted_at IS NULL
       ORDER BY lower(t.name), t.id`
    )
    .all();
}

function createTask(name, projectId) {
  const cleanName = validateName(name);
  const normalizedProjectId = normalizeProjectId(projectId);
  assertProjectExists(normalizedProjectId);

  const now = toIsoTimestamp();

  try {
    const result = db
      .prepare(
        `INSERT INTO tasks (name, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(cleanName, normalizedProjectId, now, now);

    return db
      .prepare(
        `SELECT t.id, t.name, t.project_id AS projectId, p.name AS projectName, t.created_at, t.updated_at
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
         WHERE t.id = ?`
      )
      .get(result.lastInsertRowid);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw makeError(409, "Task name already exists for this project.");
    }
    throw error;
  }
}

function updateTask(id, name, projectId) {
  const taskId = Number(id);
  const cleanName = validateName(name);
  const normalizedProjectId = normalizeProjectId(projectId);
  assertProjectExists(normalizedProjectId);

  const existing = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(taskId);

  if (!existing) {
    throw makeError(404, "Task not found.");
  }

  const now = toIsoTimestamp();

  try {
    db.prepare(
      `UPDATE tasks
       SET name = ?, project_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(cleanName, normalizedProjectId, now, taskId);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw makeError(409, "Task name already exists for this project.");
    }
    throw error;
  }

  return db
    .prepare(
      `SELECT t.id, t.name, t.project_id AS projectId, p.name AS projectName, t.created_at, t.updated_at
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       WHERE t.id = ?`
    )
    .get(taskId);
}

function deleteTask(id) {
  const taskId = Number(id);

  const task = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(taskId);

  if (!task) {
    throw makeError(404, "Task not found.");
  }

  const openEntry = db
    .prepare(
      `SELECT id
       FROM time_entries
       WHERE task_id = ? AND ended_minute IS NULL AND deleted_at IS NULL`
    )
    .get(taskId);

  if (openEntry) {
    throw makeError(400, "Cannot delete an active task. End it first.");
  }

  const now = toIsoTimestamp();
  db.prepare(
    `UPDATE tasks
     SET deleted_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(now, now, taskId);
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
};
