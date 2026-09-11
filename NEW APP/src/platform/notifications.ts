import { t } from "@/i18n/i18n";

const STORAGE_PREFIX = "farmdashboard_notifications::";
const LEGACY_STORAGE_KEY = "farmdashboard_notifications";
const MAX_NOTIFICATIONS = 10;

export interface NotificationItem {
  type?: string;
  title: string;
  message?: string;
  messageHtml?: string;
  messageHtmlTrusted?: boolean;
  timestamp?: string;
  scopeKey?: string;
}

let activeScopeKey = "default::1::default";
let history: NotificationItem[] = [];
const listeners = new Set<() => void>();

function storageKeyForScope(scopeKey: string): string {
  return `${STORAGE_PREFIX}${scopeKey}`;
}

function loadFromStorage(scopeKey: string): NotificationItem[] {
  try {
    const raw = localStorage.getItem(storageKeyForScope(scopeKey));
    if (raw) {
      const parsed = JSON.parse(raw) as NotificationItem[];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_NOTIFICATIONS) : [];
    }
    // One-time migrate legacy global history into the first scope that asks.
    if (scopeKey === activeScopeKey) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as NotificationItem[];
        if (Array.isArray(parsed) && parsed.length) {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          return parsed.slice(0, MAX_NOTIFICATIONS).map((n) => ({ ...n, scopeKey }));
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(storageKeyForScope(activeScopeKey), JSON.stringify(history));
  } catch {
    /* ignore */
  }
}

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

/** Switch bell history to a server+farm+save scope (loads that scope's history). */
export function setNotificationScope(scopeKey: string): void {
  const next = String(scopeKey || "default::1::default");
  if (next === activeScopeKey) return;
  activeScopeKey = next;
  history = loadFromStorage(activeScopeKey);
  notify();
}

export function getNotificationScope(): string {
  return activeScopeKey;
}

export function subscribeNotifications(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getNotificationHistory(): NotificationItem[] {
  return history.slice();
}

export function getNotificationCount(): number {
  return history.length;
}

export function addNotificationToHistory(notification: NotificationItem): void {
  const item: NotificationItem = {
    ...notification,
    scopeKey: activeScopeKey,
    timestamp: notification.timestamp || new Date().toISOString(),
  };
  history = [item, ...history].slice(0, MAX_NOTIFICATIONS);
  persist();
  notify();
}

export function clearNotificationHistory(): void {
  history = [];
  persist();
  notify();
}

export function getTimeAgo(timestamp: Date | string): string {
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const seconds = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (seconds < 60) return t("notifications.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1
      ? t("notifications.minutesAgoOne")
      : t("notifications.minutesAgoMany", { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1
      ? t("notifications.hoursAgoOne")
      : t("notifications.hoursAgoMany", { count: hours });
  }
  const days = Math.floor(hours / 24);
  return days === 1
    ? t("notifications.daysAgoOne")
    : t("notifications.daysAgoMany", { count: days });
}

export function notificationTone(type?: string): "default" | "accent" | "warn" | "danger" {
  if (type === "danger" || type === "error") return "danger";
  if (type === "warning" || type === "warn") return "warn";
  if (type === "success") return "accent";
  return "default";
}

// Initialize default scope from storage.
history = loadFromStorage(activeScopeKey);
