/**
 * Calendar dates here are labels only. The API owns the timezone's UTC week boundaries. Week keys
 * are ISO dates (`2026-09-28`), so they also compare correctly as strings.
 */
const calendarDay = (value: string): Date => new Date(`${value}T00:00:00Z`);
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function shiftPredictionWeek(monday: string, weeks: number): string {
  const day = calendarDay(monday);
  day.setUTCDate(day.getUTCDate() + weeks * 7);
  return isoDay(day);
}

export function currentPredictionWeek(serverNow: string, siteTimeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: siteTimeZone,
  }).formatToParts(new Date(serverNow));
  const part = (name: string) => Number(parts.find(value => value.type === name)?.value);
  const day = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return isoDay(day);
}

/** "Sep 28 – Oct 4, 2026": the year once, unless the week spans two. */
export function predictionWeekLabel(monday: string): string {
  const start = calendarDay(monday);
  const end = calendarDay(shiftPredictionWeek(monday, 1));
  end.setUTCDate(end.getUTCDate() - 1);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const format = (date: Date, withYear: boolean) => new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC",
  }).format(date);
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}
