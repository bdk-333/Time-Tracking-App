const { db } = require("../db");
const {
  nowMinute,
  toIsoTimestamp,
  toLocalDateKeyFromMinute,
  endOfDateKeyMinute,
  getElapsedMinutes,
} = require("../timeUtils");

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getTaskById(taskId) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.project_id AS projectId, p.name AS projectName
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       WHERE t.id = ? AND t.deleted_at IS NULL`
    )
    .get(taskId);
}

function getOpenEntry() {
  return db
    .prepare(
      `SELECT te.id, te.task_id AS taskId, te.date_key AS dateKey,
              te.started_minute AS startedMinute,
              te.ended_minute AS endedMinute,
              te.paused_total_minutes AS pausedTotalMinutes,
              te.paused_started_minute AS pausedStartedMinute,
              t.name AS taskName,
              t.project_id AS projectId,
              p.name AS projectName
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id AND t.deleted_at IS NULL
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       WHERE te.ended_minute IS NULL AND te.deleted_at IS NULL
       ORDER BY te.id DESC
       LIMIT 1`
    )
    .get();
}

function closeCrossDayEntries(currentMinute) {
  const todayKey = toLocalDateKeyFromMinute(currentMinute);
  const openEntries = db
    .prepare(
      `SELECT id, date_key AS dateKey, paused_total_minutes AS pausedTotalMinutes,
              paused_started_minute AS pausedStartedMinute, started_minute AS startedMinute
       FROM time_entries
       WHERE ended_minute IS NULL AND deleted_at IS NULL`
    )
    .all();

  const now = toIsoTimestamp();

  const updateStmt = db.prepare(
    `UPDATE time_entries
     SET ended_minute = ?, paused_total_minutes = ?, paused_started_minute = NULL, updated_at = ?
     WHERE id = ?`
  );

  for (const entry of openEntries) {
    if (entry.dateKey === todayKey) {
      continue;
    }

    const forcedEndMinute = Math.max(entry.startedMinute, endOfDateKeyMinute(entry.dateKey));
    const pausedAdjustment = entry.pausedStartedMinute == null
      ? 0
      : Math.max(0, forcedEndMinute - entry.pausedStartedMinute);

    updateStmt.run(
      forcedEndMinute,
      entry.pausedTotalMinutes + pausedAdjustment,
      now,
      entry.id
    );
  }
}

function closeEntry(entry, endMinute) {
  const now = toIsoTimestamp();
  const pausedAdjustment = entry.pausedStartedMinute == null
    ? 0
    : Math.max(0, endMinute - entry.pausedStartedMinute);

  db.prepare(
    `UPDATE time_entries
     SET ended_minute = ?,
         paused_total_minutes = ?,
         paused_started_minute = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(
    Math.max(entry.startedMinute, endMinute),
    entry.pausedTotalMinutes + pausedAdjustment,
    now,
    entry.id
  );
}

function formatCurrent(entry, currentMinute = nowMinute()) {
  if (!entry) {
    return null;
  }

  return {
    entryId: entry.id,
    taskId: entry.taskId,
    taskName: entry.taskName,
    projectId: entry.projectId,
    projectName: entry.projectName,
    state: entry.pausedStartedMinute == null ? "running" : "paused",
    startedMinute: entry.startedMinute,
    pausedTotalMinutes: entry.pausedTotalMinutes,
    pausedStartedMinute: entry.pausedStartedMinute,
    dateKey: entry.dateKey,
    elapsedMinutes: getElapsedMinutes(
      {
        started_minute: entry.startedMinute,
        ended_minute: entry.endedMinute,
        paused_total_minutes: entry.pausedTotalMinutes,
        paused_started_minute: entry.pausedStartedMinute,
      },
      currentMinute
    ),
  };
}

function startTask(rawTaskId) {
  const taskId = Number(rawTaskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw makeError(400, "taskId must be a positive integer.");
  }

  const task = getTaskById(taskId);
  if (!task) {
    throw makeError(404, "Task not found.");
  }

  const minute = nowMinute();
  closeCrossDayEntries(minute);

  const tx = db.transaction(() => {
    const existingOpen = getOpenEntry();

    if (existingOpen && existingOpen.taskId === taskId && existingOpen.pausedStartedMinute == null) {
      return formatCurrent(existingOpen, minute);
    }

    if (existingOpen) {
      closeEntry(existingOpen, minute);
    }

    const now = toIsoTimestamp();
    const dateKey = toLocalDateKeyFromMinute(minute);

    const result = db
      .prepare(
        `INSERT INTO time_entries (
          task_id,
          date_key,
          started_minute,
          ended_minute,
          paused_total_minutes,
          paused_started_minute,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, NULL, 0, NULL, ?, ?)`
      )
      .run(taskId, dateKey, minute, now, now);

    const inserted = db
      .prepare(
        `SELECT te.id, te.task_id AS taskId, te.date_key AS dateKey,
                te.started_minute AS startedMinute,
                te.ended_minute AS endedMinute,
                te.paused_total_minutes AS pausedTotalMinutes,
                te.paused_started_minute AS pausedStartedMinute,
                t.name AS taskName,
                t.project_id AS projectId,
                p.name AS projectName
         FROM time_entries te
         JOIN tasks t ON t.id = te.task_id AND t.deleted_at IS NULL
         LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
         WHERE te.id = ?`
      )
      .get(result.lastInsertRowid);

    return formatCurrent(inserted, minute);
  });

  return tx();
}

function pauseCurrent() {
  const minute = nowMinute();
  closeCrossDayEntries(minute);
  const current = getOpenEntry();

  if (!current) {
    throw makeError(400, "No running task to pause.");
  }
  if (current.pausedStartedMinute != null) {
    return formatCurrent(current, minute);
  }

  const now = toIsoTimestamp();
  db.prepare(
    `UPDATE time_entries
     SET paused_started_minute = ?, updated_at = ?
     WHERE id = ?`
  ).run(minute, now, current.id);

  const updated = getOpenEntry();
  return formatCurrent(updated, minute);
}

function resumeCurrent() {
  const minute = nowMinute();
  closeCrossDayEntries(minute);
  const current = getOpenEntry();

  if (!current) {
    throw makeError(400, "No paused task to resume.");
  }
  if (current.pausedStartedMinute == null) {
    return formatCurrent(current, minute);
  }

  const pausedAddition = Math.max(0, minute - current.pausedStartedMinute);
  const now = toIsoTimestamp();

  db.prepare(
    `UPDATE time_entries
     SET paused_total_minutes = ?, paused_started_minute = NULL, updated_at = ?
     WHERE id = ?`
  ).run(current.pausedTotalMinutes + pausedAddition, now, current.id);

  const updated = getOpenEntry();
  return formatCurrent(updated, minute);
}

function endCurrent() {
  const minute = nowMinute();
  closeCrossDayEntries(minute);
  const current = getOpenEntry();

  if (!current) {
    throw makeError(400, "No active task to end.");
  }

  closeEntry(current, minute);
  return null;
}

function getCurrent() {
  const minute = nowMinute();
  closeCrossDayEntries(minute);
  return formatCurrent(getOpenEntry(), minute);
}

function getTodayTotals() {
  const minute = nowMinute();
  closeCrossDayEntries(minute);
  const dateKey = toLocalDateKeyFromMinute(minute);

  const entries = db
    .prepare(
      `SELECT te.id,
              te.started_minute AS startedMinute,
              te.ended_minute AS endedMinute,
              te.paused_total_minutes AS pausedTotalMinutes,
              te.paused_started_minute AS pausedStartedMinute,
              t.id AS taskId,
              t.name AS taskName,
              t.project_id AS projectId,
              p.name AS projectName
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id AND t.deleted_at IS NULL
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       WHERE te.date_key = ? AND te.deleted_at IS NULL`
    )
    .all(dateKey);

  const byTask = new Map();
  const byProject = new Map();
  const byTaskProject = new Map();

  for (const entry of entries) {
    const minutes = getElapsedMinutes(
      {
        started_minute: entry.startedMinute,
        ended_minute: entry.endedMinute,
        paused_total_minutes: entry.pausedTotalMinutes,
        paused_started_minute: entry.pausedStartedMinute,
      },
      minute
    );

    const projectId = entry.projectId == null ? null : entry.projectId;
    const projectName = entry.projectName || "No Project";

    const taskKey = String(entry.taskId);
    if (!byTask.has(taskKey)) {
      byTask.set(taskKey, {
        taskId: entry.taskId,
        taskName: entry.taskName,
        projectId,
        projectName,
        minutes: 0,
      });
    }
    byTask.get(taskKey).minutes += minutes;

    const projectKey = projectId == null ? "none" : String(projectId);
    if (!byProject.has(projectKey)) {
      byProject.set(projectKey, {
        projectId,
        projectName,
        minutes: 0,
      });
    }
    byProject.get(projectKey).minutes += minutes;

    const taskProjectKey = `${projectKey}:${taskKey}`;
    if (!byTaskProject.has(taskProjectKey)) {
      byTaskProject.set(taskProjectKey, {
        projectId,
        projectName,
        taskId: entry.taskId,
        taskName: entry.taskName,
        minutes: 0,
      });
    }
    byTaskProject.get(taskProjectKey).minutes += minutes;
  }

  const taskTotals = Array.from(byTask.values()).sort((a, b) => b.minutes - a.minutes || a.taskName.localeCompare(b.taskName));
  const projectTotals = Array.from(byProject.values()).sort((a, b) => b.minutes - a.minutes || a.projectName.localeCompare(b.projectName));
  const taskPerProjectTotals = Array.from(byTaskProject.values()).sort((a, b) => {
    const projectCmp = a.projectName.localeCompare(b.projectName);
    if (projectCmp !== 0) {
      return projectCmp;
    }
    if (b.minutes !== a.minutes) {
      return b.minutes - a.minutes;
    }
    return a.taskName.localeCompare(b.taskName);
  });

  const overallMinutes = taskTotals.reduce((sum, item) => sum + item.minutes, 0);

  return {
    dateKey,
    overallMinutes,
    taskTotals,
    projectTotals,
    taskPerProjectTotals,
  };
}

module.exports = {
  startTask,
  pauseCurrent,
  resumeCurrent,
  endCurrent,
  getCurrent,
  getTodayTotals,
};
