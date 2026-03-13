const state = {
  projects: [],
  tasks: [],
  current: null,
  totals: null,
  quickProjectFilter: "all",
};

let tickTimer = null;

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

function notifyError(error) {
  const message = error?.message || "Request failed.";
  window.alert(message);
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
      // No additional message.
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
  render();
}

function getTaskMinutesMap() {
  const map = new Map();
  for (const row of state.totals?.taskTotals || []) {
    map.set(row.taskId, row.minutes);
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

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Projects";
  quickProjectSelect.appendChild(allOption);

  for (const option of projectOptions) {
    const taskOption = document.createElement("option");
    taskOption.value = option.value;
    taskOption.textContent = option.label;
    taskProjectSelect.appendChild(taskOption);

    const quickOption = document.createElement("option");
    quickOption.value = option.value || "none";
    quickOption.textContent = option.label;
    quickProjectSelect.appendChild(quickOption);
  }

  if (!["all", "none", ...state.projects.map((p) => String(p.id))].includes(state.quickProjectFilter)) {
    state.quickProjectFilter = "all";
  }
  quickProjectSelect.value = state.quickProjectFilter;
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
}

function renderProjectsList() {
  const container = document.getElementById("projectsList");
  container.innerHTML = "";

  if (state.projects.length === 0) {
    container.appendChild(createEmptyState("No projects yet."));
    return;
  }

  for (const project of state.projects) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <div class="list-item-title">${escapeHtml(project.name)}</div>
      </div>
      <div class="list-actions">
        <button data-action="edit-project" data-id="${project.id}">Edit</button>
        <button class="delete" data-action="delete-project" data-id="${project.id}">Delete</button>
      </div>
    `;
    container.appendChild(item);
  }
}

function renderTasksList() {
  const container = document.getElementById("tasksList");
  container.innerHTML = "";

  if (state.tasks.length === 0) {
    container.appendChild(createEmptyState("No tasks yet."));
    return;
  }

  for (const task of state.tasks) {
    const item = document.createElement("div");
    item.className = "list-item";
    const subtitle = task.projectName || "No Project";
    item.innerHTML = `
      <div>
        <div class="list-item-title">${escapeHtml(task.name)}</div>
        <div class="list-item-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      <div class="list-actions">
        <button data-action="start-task" data-id="${task.id}">Start</button>
        <button data-action="edit-task" data-id="${task.id}">Edit</button>
        <button class="delete" data-action="delete-task" data-id="${task.id}">Delete</button>
      </div>
    `;
    container.appendChild(item);
  }
}

function renderCurrent() {
  const current = state.current;
  const title = document.getElementById("currentTaskName");
  const meta = document.getElementById("currentTaskMeta");
  const elapsed = document.getElementById("currentElapsed");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const endBtn = document.getElementById("endBtn");

  if (!current) {
    title.textContent = "No active task";
    meta.textContent = "Start by selecting a task below.";
    elapsed.textContent = "00h 00m";
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    endBtn.disabled = true;
    return;
  }

  title.textContent = current.taskName;
  meta.textContent = `${current.projectName || "No Project"} | ${current.state}`;
  elapsed.textContent = formatMinutes(current.elapsedMinutes);

  const isRunning = current.state === "running";
  const isPaused = current.state === "paused";
  pauseBtn.disabled = !isRunning;
  resumeBtn.disabled = !isPaused;
  endBtn.disabled = false;
}

function renderTaskTable() {
  const body = document.getElementById("taskTableBody");
  body.innerHTML = "";

  const taskMinutesMap = getTaskMinutesMap();

  for (const task of state.tasks) {
    const tr = document.createElement("tr");
    const isCurrent = state.current && state.current.taskId === task.id;
    const status = !isCurrent ? "idle" : state.current.state;
    tr.innerHTML = `
      <td>${escapeHtml(task.name)}</td>
      <td>${escapeHtml(task.projectName || "No Project")}</td>
      <td>${formatMinutes(taskMinutesMap.get(task.id) || 0)}</td>
      <td>
        <button class="btn primary" data-action="start-task" data-id="${task.id}">Start</button>
        <span class="status-pill">${status}</span>
      </td>
    `;
    body.appendChild(tr);
  }

  if (state.tasks.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="empty-state">No tasks to display.</td>';
    body.appendChild(row);
  }
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
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = lineBuilder(item);
    list.appendChild(li);
  }
  container.appendChild(list);
}

function createEmptyState(text) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = text;
  return p;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function submitProject(event) {
  event.preventDefault();
  const input = document.getElementById("projectName");
  const name = input.value.trim();
  if (!name) {
    return;
  }

  await api("/api/projects", { method: "POST", body: { name } });
  input.value = "";
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
  await api("/api/tasks", { method: "POST", body: { name, projectId } });
  nameInput.value = "";
  projectSelect.value = "";
  await refreshAll();
}

async function handleActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "start-task") {
    await api("/api/timer/start", { method: "POST", body: { taskId: Number(id) } });
    await refreshTimerAndTotals();
    return;
  }

  if (action === "edit-project") {
    const project = state.projects.find((item) => String(item.id) === id);
    if (!project) {
      return;
    }
    const nextName = window.prompt("Project name", project.name);
    if (nextName == null) {
      return;
    }
    await api(`/api/projects/${id}`, { method: "PATCH", body: { name: nextName } });
    await refreshAll();
    return;
  }

  if (action === "delete-project") {
    if (!window.confirm("Delete this project? Associated tasks will become unassigned.")) {
      return;
    }
    await api(`/api/projects/${id}`, { method: "DELETE" });
    await refreshAll();
    return;
  }

  if (action === "edit-task") {
    const task = state.tasks.find((item) => String(item.id) === id);
    if (!task) {
      return;
    }
    const nextName = window.prompt("Task name", task.name);
    if (nextName == null) {
      return;
    }
    const projectPrompt = window.prompt(
      "Project ID (leave blank for no project)",
      task.projectId == null ? "" : String(task.projectId)
    );
    if (projectPrompt == null) {
      return;
    }
    const projectId = projectPrompt.trim() === "" ? null : Number(projectPrompt.trim());
    await api(`/api/tasks/${id}`, { method: "PATCH", body: { name: nextName, projectId } });
    await refreshAll();
    return;
  }

  if (action === "delete-task") {
    if (!window.confirm("Delete this task?")) {
      return;
    }
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    await refreshAll();
  }
}

async function refreshTimerAndTotals() {
  const [currentRes, totalsRes] = await Promise.all([
    api("/api/timer/current"),
    api("/api/timer/totals/today"),
  ]);
  state.current = currentRes.current;
  state.totals = totalsRes;
  renderCurrent();
  renderTaskTable();
  renderTotals();
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

function attachHandlers() {
  document.getElementById("projectForm").addEventListener("submit", (event) => {
    submitProject(event).catch(notifyError);
  });

  document.getElementById("taskForm").addEventListener("submit", (event) => {
    submitTask(event).catch(notifyError);
  });

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
  renderProjectsList();
  renderTasksList();
  renderCurrent();
  renderTaskTable();
  renderTotals();
}

function beginTicker() {
  if (tickTimer) {
    clearInterval(tickTimer);
  }

  tickTimer = setInterval(() => {
    if (state.current) {
      refreshTimerAndTotals().catch(console.error);
    }
  }, 15000);
}

async function init() {
  attachHandlers();
  await loadState();
  beginTicker();
}

init().catch(notifyError);
