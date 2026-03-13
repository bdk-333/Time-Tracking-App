const MINUTE_MS = 60 * 1000;

function nowMinute() {
  return Math.floor(Date.now() / MINUTE_MS);
}

function minuteToDate(minute) {
  return new Date(minute * MINUTE_MS);
}

function toIsoTimestamp(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function toLocalDateKeyFromMinute(minute) {
  const date = minuteToDate(minute);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
  return toLocalDateKeyFromMinute(nowMinute());
}

function endOfDateKeyMinute(dateKey) {
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const endDate = new Date(year, month - 1, day, 23, 59, 0, 0);
  return Math.floor(endDate.getTime() / MINUTE_MS);
}

function minutesToDisplay(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
}

function getElapsedMinutes(entry, minute = nowMinute()) {
  const endMinute = entry.ended_minute == null ? minute : entry.ended_minute;
  const pausedOngoing = entry.paused_started_minute == null ? 0 : Math.max(0, minute - entry.paused_started_minute);
  return Math.max(0, endMinute - entry.started_minute - entry.paused_total_minutes - pausedOngoing);
}

module.exports = {
  MINUTE_MS,
  nowMinute,
  toIsoTimestamp,
  toLocalDateKeyFromMinute,
  getTodayDateKey,
  endOfDateKeyMinute,
  minutesToDisplay,
  getElapsedMinutes,
};
