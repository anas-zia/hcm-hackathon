// All dates in the app are plain "YYYY-MM-DD" strings in server local time (TZ in .env).

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateStr(str) {
  return new Date(str + 'T00:00:00');
}

function todayStr() {
  return toDateStr(new Date());
}

// Every date string from start to end (inclusive)
function eachDay(start, end) {
  const days = [];
  const cursor = fromDateStr(start);
  const last = fromDateStr(end);
  while (cursor <= last) {
    days.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// settings.weekendDays uses JS numbers: 0 = Sunday ... 6 = Saturday
function isWorkingDay(dateStr, settings) {
  const day = fromDateStr(dateStr).getDay();
  if (settings.weekendDays.includes(day)) return false;
  return !settings.holidays.some((h) => h.date === dateStr);
}

function workingDaysBetween(start, end, settings) {
  return eachDay(start, end).filter((d) => isWorkingDay(d, settings));
}

function monthRange(month) {
  // month = "YYYY-MM"
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

function hoursBetween(a, b) {
  return (b - a) / (1000 * 60 * 60);
}

export { toDateStr, fromDateStr, todayStr, eachDay, isWorkingDay, workingDaysBetween, monthRange, hoursBetween };
