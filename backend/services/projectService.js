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
    throw makeError(400, "Name is required.");
  }
  if (cleanName.length > 100) {
    throw makeError(400, "Name must be 100 characters or fewer.");
  }
  return cleanName;
}

function listProjects() {
  return db
    .prepare(
      `SELECT id, name, created_at, updated_at
       FROM projects
       WHERE deleted_at IS NULL
       ORDER BY lower(name), id`
    )
    .all();
}

function createProject(name) {
  const cleanName = validateName(name);
  const now = toIsoTimestamp();

  try {
    const result = db
      .prepare(
        `INSERT INTO projects (name, created_at, updated_at)
         VALUES (?, ?, ?)`
      )
      .run(cleanName, now, now);

    return db
      .prepare(
        `SELECT id, name, created_at, updated_at
         FROM projects
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw makeError(409, "Project name already exists.");
    }
    throw error;
  }
}

function updateProject(id, name) {
  const cleanName = validateName(name);
  const projectId = Number(id);
  const now = toIsoTimestamp();

  const existing = db
    .prepare(
      `SELECT id
       FROM projects
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId);

  if (!existing) {
    throw makeError(404, "Project not found.");
  }

  try {
    db.prepare(
      `UPDATE projects
       SET name = ?, updated_at = ?
       WHERE id = ?`
    ).run(cleanName, now, projectId);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw makeError(409, "Project name already exists.");
    }
    throw error;
  }

  return db
    .prepare(
      `SELECT id, name, created_at, updated_at
       FROM projects
       WHERE id = ?`
    )
    .get(projectId);
}

function deleteProject(id) {
  const projectId = Number(id);
  const now = toIsoTimestamp();

  const existing = db
    .prepare(
      `SELECT id
       FROM projects
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId);

  if (!existing) {
    throw makeError(404, "Project not found.");
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE projects
       SET deleted_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, now, projectId);

    db.prepare(
      `UPDATE tasks
       SET project_id = NULL, updated_at = ?
       WHERE project_id = ? AND deleted_at IS NULL`
    ).run(now, projectId);
  });

  tx();
}

module.exports = {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
};
