const state = {
  projects: [],
  tasks: [],
  current: null,
  totals: null,
  quickProjectFilter: "all",
  editingProjectId: null,
  editingTaskId: null,
};

let liveTimerInterval = null;
let syncInterval = null;

const projectAccentPalette = [
  "#0f766e",
  "#c26543",
  "#8d5fd3",
  "#4176b5",
  "#0d8d67",
  "#ba4f8a",
  "#967122",
  "#2f8579",
];

function formatLocalDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMinutes(totalMinutes) {
  const safe = Math.max(0, Number(totalMinutes) || 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
}

function formatSeconds(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function notifyError(error) {
  const message = error?.message || "Request failed.";
  window.alert(message);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createEmptyState(text) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = text;
  return p;
}

function getProjectAccent(index, isNoProject = false) {
  if (isNoProject) {
    return "#637381";
  }
  return projectAccentPalette[index % projectAccentPalette.length];
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isCurrentTask(taskId) {
  return state.current && state.current.taskId === taskId;
}

function getTaskStatus(taskId) {
  if (!isCurrentTask(taskId)) {
    return "idle";
  }
  return state.current.state;
}

function getCurrentElapsedSeconds(current = state.current) {
  if (!current) {
    return 0;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const startedSeconds = Number(current.startedMinute || 0) * 60;
  const pausedSeconds = Number(current.pausedTotalMinutes || 0) * 60;
  const ongoingPauseSeconds = current.pausedStartedMinute == null
    ? 0
    : Math.max(0, nowSeconds - Number(current.pausedStartedMinute) * 60);

  return Math.max(0, nowSeconds - startedSeconds - pausedSeconds - ongoingPauseSeconds);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      // No body.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function loadState() {
  const [projectsRes, tasksRes, currentRes, totalsRes] = await Promise.all([
    api("/api/projects"),
    api("/api/tasks"),
    api("/api/timer/current"),
    api("/api/timer/totals/today"),
  ]);

  state.projects = projectsRes.projects;
  state.tasks = tasksRes.tasks;
  state.current = currentRes.current;
  state.totals = totalsRes;
  normalizeEditingState();
  render();
}

function normalizeEditingState() {
  if (state.editingProjectId != null && !state.projects.some((project) => project.id === state.editingProjectId)) {
    state.editingProjectId = null;
  }
  if (state.editingTaskId != null && !state.tasks.some((task) => task.id === state.editingTaskId)) {
    state.editingTaskId = null;
  }
}

function getTaskMinutesMap() {
  const map = new Map();
  for (const row of state.totals?.taskTotals || []) {
    map.set(row.taskId, row.minutes);
  }
  return map;
}

function getProjectMinutesMap() {
  const map = new Map();
  for (const row of state.totals?.projectTotals || []) {
    map.set(row.projectId == null ? "none" : String(row.projectId), row.minutes);
  }
  return map;
}

function renderProjectSelects() {
  const taskProjectSelect = document.getElementById("taskProjectSelect");
  const quickProjectSelect = document.getElementById("quickProjectSelect");

  const projectOptions = [
    { value: "", label: "No Project" },
    ...state.projects.map((project) => ({ value: String(project.id), label: project.name })),
  ];

  taskProjectSelect.innerHTML = "";
  quickProjectSelect.innerHTML = "";

  for (const option of projectOptions) {
    const taskOption = document.createElement("option");
    taskOption.value = option.value;
    taskOption.textContent = option.label;
    taskProjectSelect.appendChild(taskOption);
  }

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Projects";
  quickProjectSelect.appendChild(allOption);

  for (const option of projectOptions) {
    const quickOption = document.createElement("option");
    quickOption.value = option.value || "none";
    quickOption.textContent = option.label;
    quickProjectSelect.appendChild(quickOption);
  }

  if (!["all", "none", ...state.projects.map((project) => String(project.id))].includes(state.quickProjectFilter)) {
    state.quickProjectFilter = "all";
  }
  quickProjectSelect.value = state.quickProjectFilter;

  const editingTask = state.tasks.find((task) => task.id === state.editingTaskId);
  taskProjectSelect.value = editingTask?.projectId == null ? "" : String(editingTask.projectId);
}

function getFilteredQuickTasks() {
  if (state.quickProjectFilter === "all") {
    return state.tasks;
  }
  if (state.quickProjectFilter === "none") {
    return state.tasks.filter((task) => task.projectId == null);
  }
  return state.tasks.filter((task) => String(task.projectId) === state.quickProjectFilter);
}

function renderQuickTaskSelect() {
  const quickTaskSelect = document.getElementById("quickTaskSelect");
  const filtered = getFilteredQuickTasks();
  const previous = quickTaskSelect.value;
  quickTaskSelect.innerHTML = "";

  if (filtered.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No tasks available";
    quickTaskSelect.appendChild(option);
    return;
  }

  for (const task of filtered) {
    const option = document.createElement("option");
    option.value = String(task.id);
    option.textContent = task.projectName ? `${task.name} (${task.projectName})` : task.name;
    quickTaskSelect.appendChild(option);
  }

  quickTaskSelect.value = filtered.some((task) => String(task.id) === previous)
    ? previous
    : String(filtered[0].id);
}

function renderProjectFormState() {
  const input = document.getElementById("projectName");
  const submitBtn = document.getElementById("projectSubmitBtn");
  const cancelBtn = document.getElementById("projectCancelBtn");

  const editingProject = state.projects.find((project) => project.id === state.editingProjectId);
  if (editingProject) {
    input.value = editingProject.name;
    submitBtn.textContent = "Save Project";
    cancelBtn.hidden = false;
  } else {
    input.value = "";
    submitBtn.textContent = "Add Project";
    cancelBtn.hidden = true;
  }
}

function renderTaskFormState() {
  const input = document.getElementById("taskName");
  const select = document.getElementById("taskProjectSelect");
  const submitBtn = document.getElementById("taskSubmitBtn");
  const cancelBtn = document.getElementById("taskCancelBtn");

  const editingTask = state.tasks.find((task) => task.id === state.editingTaskId);
  if (editingTask) {
    input.value = editingTask.name;
    select.value = editingTask.projectId == null ? "" : String(editingTask.projectId);
    submitBtn.textContent = "Save Task";
    cancelBtn.hidden = false;
  } else {
    input.value = "";
    select.value = "";
    submitBtn.textContent = "Add Task";
    cancelBtn.hidden = true;
  }
}

function renderProjectsList() {
  const container = document.getElementById("projectsList");
  container.innerHTML = "";

  if (state.projects.length === 0) {
    container.appendChild(createEmptyState("No projects yet."));
    return;
  }

  const projectMinutesMap = getProjectMinutesMap();

  state.projects.forEach((project, index) => {
    const item = document.createElement("div");
    item.className = "list-item";
    const isEditing = state.editingProjectId === project.id;
    item.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(project.name)}</div>
        <div class="list-item-subtitle">Today: ${formatMinutes(projectMinutesMap.get(String(project.id)) || 0)}</div>
      </div>
      <div class="list-actions">
        <button data-action="edit-project" data-id="${project.id}">${isEditing ? "Editing" : "Edit"}</button>
        <button class="delete" data-action="delete-project" data-id="${project.id}">Delete</button>
      </div>
    `;
    item.style.setProperty("--panel-accent", getProjectAccent(index));
    container.appendChild(item);
  });
}

function renderTasksList() {
  const container = document.getElementById("tasksList");
  container.innerHTML = "";

  if (state.tasks.length === 0) {
    container.appendChild(createEmptyState("No tasks yet."));
    return;
  }

  const taskMinutesMap = getTaskMinutesMap();

  state.tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "list-item";
    const subtitle = task.projectName || "No Project";
    const status = getTaskStatus(task.id);
    const isEditing = state.editingTaskId === task.id;
    item.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(task.name)}</div>
        <div class="list-item-subtitle">${escapeHtml(subtitle)} | ${formatMinutes(taskMinutesMap.get(task.id) || 0)} | ${status}</div>
      </div>
      <div class="list-actions">
        <button data-action="start-task" data-id="${task.id}">Start</button>
        <button data-action="edit-task" data-id="${task.id}">${isEditing ? "Editing" : "Edit"}</button>
        <button class="delete" data-action="delete-task" data-id="${task.id}">Delete</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderCurrent() {
  const current = state.current;
  const title = document.getElementById("currentTaskName");
  const meta = document.getElementById("currentTaskMeta");
  const elapsed = document.getElementById("currentElapsed");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const endBtn = document.getElementById("endBtn");
  const badge = document.getElementById("currentStateBadge");

  if (!current) {
    title.textContent = "No active task";
    meta.textContent = "Start by selecting a task below.";
    elapsed.textContent = "00:00:00";
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    endBtn.disabled = true;
    badge.textContent = "Idle";
    badge.className = "state-badge idle";
    return;
  }

  title.textContent = current.taskName;
  meta.textContent = `${current.projectName || "No Project"} | ${current.state}`;
  elapsed.textContent = formatSeconds(getCurrentElapsedSeconds(current));
  pauseBtn.disabled = current.state !== "running";
  resumeBtn.disabled = current.state !== "paused";
  endBtn.disabled = false;
  badge.textContent = current.state === "paused" ? "Paused" : "Running";
  badge.className = `state-badge ${current.state}`;
}

function renderProjectGroups() {
  const container = document.getElementById("projectGroups");
  container.innerHTML = "";

  const taskMinutesMap = getTaskMinutesMap();
  const projectMinutesMap = getProjectMinutesMap();
  const groups = state.projects.map((project) => ({
    key: String(project.id),
    name: project.name,
    projectId: project.id,
    tasks: state.tasks.filter((task) => task.projectId === project.id),
    accent: getProjectAccent(state.projects.findIndex((item) => item.id === project.id)),
    totalMinutes: projectMinutesMap.get(String(project.id)) || 0,
    isNoProject: false,
  }));

  const noProjectTasks = state.tasks.filter((task) => task.projectId == null);
  if (noProjectTasks.length > 0 || projectMinutesMap.has("none")) {
    groups.push({
      key: "none",
      name: "No Project",
      projectId: null,
      tasks: noProjectTasks,
      accent: getProjectAccent(0, true),
      totalMinutes: projectMinutesMap.get("none") || 0,
      isNoProject: true,
    });
  }

  if (groups.length === 0) {
    container.appendChild(createEmptyState("Create a project or task to start organizing your day."));
    return;
  }

  groups.forEach((group) => {
    const panel = document.createElement("section");
    panel.className = "project-panel";
    panel.style.setProperty("--panel-accent", group.accent);
    panel.style.setProperty("--panel-soft", hexToRgba(group.accent, 0.10));
    panel.style.setProperty("--panel-softer", hexToRgba(group.accent, 0.16));

    const tasksMarkup = group.tasks.length === 0
      ? '<p class="empty-state">No tasks in this group yet.</p>'
      : group.tasks
          .map((task) => {
            const status = getTaskStatus(task.id);
            const liveMarkup = isCurrentTask(task.id)
              ? `<span class="task-live js-live-elapsed" data-task-id="${task.id}">${status === "paused" ? "Paused at" : "Running"} ${formatSeconds(getCurrentElapsedSeconds())}</span>`
              : "";

            return `
              <div class="project-task-row">
                <div>
                  <div class="list-item-title">${escapeHtml(task.name)}</div>
                  <div class="project-task-meta">
                    <span class="task-time">${formatMinutes(taskMinutesMap.get(task.id) || 0)}</span>
                    <span class="status-pill ${status}">${status}</span>
                    ${liveMarkup}
                  </div>
                </div>
                <button class="btn primary" data-action="start-task" data-id="${task.id}">Start</button>
              </div>
            `;
          })
          .join("");

    panel.innerHTML = `
      <div class="project-panel-head">
        <div class="project-title-row">
          <h4>${escapeHtml(group.name)}</h4>
          <div class="project-total">${formatMinutes(group.totalMinutes)}</div>
        </div>
        <span class="project-chip">${group.tasks.length} task${group.tasks.length === 1 ? "" : "s"}</span>
      </div>
      <div class="project-task-list">${tasksMarkup}</div>
    `;
    container.appendChild(panel);
  });
}

function renderTaskTable() {
  const body = document.getElementById("taskTableBody");
  body.innerHTML = "";

  const taskMinutesMap = getTaskMinutesMap();

  if (state.tasks.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="empty-state">No tasks to display.</td>';
    body.appendChild(row);
    return;
  }

  state.tasks.forEach((task) => {
    const status = getTaskStatus(task.id);
    const tr = document.createElement("tr");
    const liveCell = isCurrentTask(task.id)
      ? `<div class="task-live js-live-elapsed" data-task-id="${task.id}">${status === "paused" ? "Paused at" : "Running"} ${formatSeconds(getCurrentElapsedSeconds())}</div>`
      : "";

    tr.innerHTML = `
      <td>${escapeHtml(task.name)}</td>
      <td>${escapeHtml(task.projectName || "No Project")}</td>
      <td>${formatMinutes(taskMinutesMap.get(task.id) || 0)}</td>
      <td>
        <span class="status-pill ${status}">${status}</span>
        ${liveCell}
      </td>
      <td>
        <button class="btn primary" data-action="start-task" data-id="${task.id}">Start</button>
      </td>
    `;
    body.appendChild(tr);
  });
}

function renderTotals() {
  renderTotalsList("totalsByTask", state.totals?.taskTotals || [], (item) => `${item.taskName}: ${formatMinutes(item.minutes)}`);
  renderTotalsList("totalsByProject", state.totals?.projectTotals || [], (item) => `${item.projectName}: ${formatMinutes(item.minutes)}`);
  renderTotalsList(
    "totalsTaskPerProject",
    state.totals?.taskPerProjectTotals || [],
    (item) => `${item.projectName} -> ${item.taskName}: ${formatMinutes(item.minutes)}`
  );
}

function renderTotalsList(containerId, items, lineBuilder) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (items.length === 0) {
    container.appendChild(createEmptyState("No tracked time yet."));
    return;
  }

  const list = document.createElement("ul");
  list.className = "compact-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = lineBuilder(item);
    list.appendChild(li);
  });
  container.appendChild(list);
}

function updateLiveTimerViews() {
  const elapsed = document.getElementById("currentElapsed");
  if (elapsed) {
    elapsed.textContent = state.current ? formatSeconds(getCurrentElapsedSeconds(state.current)) : "00:00:00";
  }

  document.querySelectorAll(".js-live-elapsed").forEach((element) => {
    if (!state.current) {
      element.textContent = "";
      return;
    }

    const taskId = Number(element.dataset.taskId);
    if (taskId !== state.current.taskId) {
      return;
    }

    const prefix = state.current.state === "paused" ? "Paused at" : "Running";
    element.textContent = `${prefix} ${formatSeconds(getCurrentElapsedSeconds(state.current))}`;
  });
}

function cancelProjectEdit() {
  state.editingProjectId = null;
  renderProjectFormState();
}

function cancelTaskEdit() {
  state.editingTaskId = null;
  renderTaskFormState();
}

async function submitProject(event) {
  event.preventDefault();
  const input = document.getElementById("projectName");
  const name = input.value.trim();
  if (!name) {
    return;
  }

  if (state.editingProjectId != null) {
    await api(`/api/projects/${state.editingProjectId}`, { method: "PATCH", body: { name } });
    state.editingProjectId = null;
  } else {
    await api("/api/projects", { method: "POST", body: { name } });
  }

  await refreshAll();
}

async function submitTask(event) {
  event.preventDefault();
  const nameInput = document.getElementById("taskName");
  const projectSelect = document.getElementById("taskProjectSelect");
  const name = nameInput.value.trim();
  if (!name) {
    return;
  }

  const projectId = projectSelect.value ? Number(projectSelect.value) : null;
  if (state.editingTaskId != null) {
    await api(`/api/tasks/${state.editingTaskId}`, { method: "PATCH", body: { name, projectId } });
    state.editingTaskId = null;
  } else {
    await api("/api/tasks", { method: "POST", body: { name, projectId } });
  }

  await refreshAll();
}

async function refreshTimerAndTotals() {
  const [currentRes, totalsRes] = await Promise.all([
    api("/api/timer/current"),
    api("/api/timer/totals/today"),
  ]);
  state.current = currentRes.current;
  state.totals = totalsRes;
  renderCurrent();
  renderProjectGroups();
  renderTaskTable();
  renderTasksList();
  renderTotals();
  updateLiveTimerViews();
}

async function refreshAll() {
  await loadState();
}

async function handleQuickStart() {
  const taskSelect = document.getElementById("quickTaskSelect");
  const taskId = Number(taskSelect.value);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return;
  }

  await api("/api/timer/start", { method: "POST", body: { taskId } });
  await refreshTimerAndTotals();
}

async function handlePause() {
  await api("/api/timer/pause", { method: "POST" });
  await refreshTimerAndTotals();
}

async function handleResume() {
  await api("/api/timer/resume", { method: "POST" });
  await refreshTimerAndTotals();
}

async function handleEnd() {
  await api("/api/timer/end", { method: "POST" });
  await refreshTimerAndTotals();
}

async function handleActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const id = Number(button.dataset.id);

  if (action === "start-task") {
    await api("/api/timer/start", { method: "POST", body: { taskId: id } });
    await refreshTimerAndTotals();
    return;
  }

  if (action === "edit-project") {
    state.editingProjectId = id;
    renderProjectFormState();
    document.getElementById("projectName").focus();
    return;
  }

  if (action === "delete-project") {
    if (!window.confirm("Delete this project? Associated tasks will become unassigned.")) {
      return;
    }
    await api(`/api/projects/${id}`, { method: "DELETE" });
    if (state.editingProjectId === id) {
      state.editingProjectId = null;
    }
    await refreshAll();
    return;
  }

  if (action === "edit-task") {
    state.editingTaskId = id;
    renderTaskFormState();
    document.getElementById("taskName").focus();
    return;
  }

  if (action === "delete-task") {
    if (!window.confirm("Delete this task?")) {
      return;
    }
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    if (state.editingTaskId === id) {
      state.editingTaskId = null;
    }
    await refreshAll();
  }
}

function attachHandlers() {
  document.getElementById("projectForm").addEventListener("submit", (event) => {
    submitProject(event).catch(notifyError);
  });

  document.getElementById("taskForm").addEventListener("submit", (event) => {
    submitTask(event).catch(notifyError);
  });

  document.getElementById("projectCancelBtn").addEventListener("click", cancelProjectEdit);
  document.getElementById("taskCancelBtn").addEventListener("click", cancelTaskEdit);

  document.body.addEventListener("click", (event) => {
    handleActionClick(event).catch(notifyError);
  });

  document.getElementById("quickProjectSelect").addEventListener("change", (event) => {
    state.quickProjectFilter = event.target.value;
    renderQuickTaskSelect();
  });

  document.getElementById("quickStartBtn").addEventListener("click", () => {
    handleQuickStart().catch(notifyError);
  });

  document.getElementById("pauseBtn").addEventListener("click", () => {
    handlePause().catch(notifyError);
  });

  document.getElementById("resumeBtn").addEventListener("click", () => {
    handleResume().catch(notifyError);
  });

  document.getElementById("endBtn").addEventListener("click", () => {
    handleEnd().catch(notifyError);
  });
}

function render() {
  document.getElementById("todayDate").textContent = formatLocalDate();
  renderProjectSelects();
  renderQuickTaskSelect();
  renderProjectFormState();
  renderTaskFormState();
  renderProjectsList();
  renderTasksList();
  renderCurrent();
  renderProjectGroups();
  renderTaskTable();
  renderTotals();
  updateLiveTimerViews();
}

function beginLiveClock() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
  }

  liveTimerInterval = setInterval(() => {
    if (state.current) {
      updateLiveTimerViews();
    }
  }, 1000);
}

function beginSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(() => {
    if (state.current) {
      refreshTimerAndTotals().catch(console.error);
    }
  }, 15000);
}

async function init() {
  attachHandlers();
  await loadState();
  beginLiveClock();
  beginSync();
}

init().catch(notifyError);
