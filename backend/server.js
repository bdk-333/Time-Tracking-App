const path = require("path");
const express = require("express");
const { runMigrations } = require("./db");

const projectRoutes = require("./routes/projects");
const taskRoutes = require("./routes/tasks");
const timerRoutes = require("./routes/timer");

runMigrations();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/timer", timerRoutes);

const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  const message = error.message || "Unexpected error.";
  res.status(status).json({ error: status >= 500 ? "server_error" : "request_error", message });
});

app.listen(PORT, () => {
  console.log(`Time Tracker running at http://localhost:${PORT}`);
});
