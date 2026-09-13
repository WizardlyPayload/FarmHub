/** Format in-game clock for landing / nav — mirrors legacy environment.getGameTimeDisplay. */

export function formatGameTimeMinutes(dayTimeMinutes: number): string {
  const hours = Math.floor(dayTimeMinutes / 60);
  const minutes = Math.floor(dayTimeMinutes % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatGameTimeDisplay(gameTime: unknown): string | null {
  if (gameTime == null) return null;
  if (typeof gameTime === "string") {
    const s = gameTime.trim();
    return s || null;
  }
  if (typeof gameTime !== "object") return null;
  const gt = gameTime as Record<string, unknown>;

  if (
    (gt.hour !== undefined || gt.minute !== undefined) &&
    (gt.currentDay !== undefined || gt.day !== undefined)
  ) {
    const hour = parseInt(String(gt.hour ?? 0), 10) || 0;
    const minute = parseInt(String(gt.minute ?? 0), 10) || 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  if (gt.dayTime !== undefined && (gt.currentDay !== undefined || gt.day !== undefined)) {
    let dayTimeMinutes = parseInt(String(gt.dayTime), 10) || 0;
    if (dayTimeMinutes > 1440) {
      dayTimeMinutes = Math.floor(dayTimeMinutes / 1000 / 60);
    }
    return formatGameTimeMinutes(dayTimeMinutes);
  }

  return null;
}
