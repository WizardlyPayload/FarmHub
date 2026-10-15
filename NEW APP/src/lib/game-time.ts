/** Format in-game clock for landing / nav — mirrors legacy environment.getGameTimeDisplay. */
import { formatProfileClock, type SaveProfileDisplay } from "@/lib/profile-display";

export function formatGameTimeMinutes(dayTimeMinutes: number, profile?: SaveProfileDisplay | null): string {
  return formatProfileClock(dayTimeMinutes, profile);
}

export function formatGameTimeDisplay(gameTime: unknown, profile?: SaveProfileDisplay | null): string | null {
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
    return formatProfileClock(hour * 60 + minute, profile);
  }

  if (gt.dayTime !== undefined && (gt.currentDay !== undefined || gt.day !== undefined)) {
    let dayTimeMinutes = parseInt(String(gt.dayTime), 10) || 0;
    if (dayTimeMinutes > 1440) {
      dayTimeMinutes = Math.floor(dayTimeMinutes / 1000 / 60);
    }
    return formatGameTimeMinutes(dayTimeMinutes, profile);
  }

  return null;
}
