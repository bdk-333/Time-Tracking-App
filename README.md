# Time-Tracking-App

A local desktop web app for tracking how you spend time today.

## Implemented MVP Scope

This version includes only today's tracking workflow:

- Create, edit, and delete projects (name max 100 chars)
- Create, edit, and delete tasks (name max 100 chars)
- Optional project association on each task
- Start a task quickly from task list or quick-start selectors
- Switching tasks auto-stops current task and starts the new task
- Pause, resume, and end active task
- No overlapping tasks
- Minute-level time recording (start/stop/pause/resume are stored at minute precision)
- Today's totals for:
  - each task
  - each project
  - each task per project

Out of scope for this MVP:

- Historical browsing UI
- Multi-day reports/statistics
- Authentication/cloud sync

## Tech Stack

- Node.js
- Express
- SQLite (`better-sqlite3`)
- Vanilla HTML/CSS/JavaScript

## Run Locally

From the repository root:

```bash
npm install
npm start
```

Then open:

`http://localhost:3000`

## Easy Windows Launch

For day-to-day use on Windows, you can double-click:

`Launch Time Tracker.bat`

That launcher:

- starts the local server if it is not already running
- waits for the app to become available
- opens the browser automatically

## Data Storage

Data is persisted in a local SQLite file:

`data/time-tracking.db`

## Notes on Daily Behavior

- The interface is focused on today only.
- If a timer is still open on a later day, the backend automatically closes it at `23:59` of its start day to keep daily entries separate.
- Time is stored with minute precision, but the active timer is displayed live with seconds in the UI so it feels responsive while you work.
