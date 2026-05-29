// FS25 FarmDashboard | notifications.js | v2.0.0

import { t } from "../i18n/i18n.js";

function escapeNotificationHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function addNotificationToHistory(notification) {
  // Add timestamp if not present
  if (!notification.timestamp) {
    notification.timestamp = new Date().toISOString();
  }

  // Add to beginning of array (newest first)
  this.notificationHistory.unshift(notification);

  // Keep only the latest 10 notifications
  if (this.notificationHistory.length > this.maxNotifications) {
    this.notificationHistory = this.notificationHistory.slice(
      0,
      this.maxNotifications
    );
  }

  // Update the notification bell
  this.updateNotificationBell();

  // Save to localStorage
  this.saveNotificationHistory();
}

export function updateNotificationBell() {
  const bellDiv = document.getElementById("notification-bell");
  const countBadge = document.getElementById("notification-count");

  if (bellDiv && countBadge) {
    const count = this.notificationHistory.length;

    if (count > 0) {
      bellDiv.classList.remove("d-none");
      countBadge.textContent = count > 99 ? "99+" : count.toString();
      countBadge.classList.remove("d-none");
    } else {
      countBadge.classList.add("d-none");
    }
  }
}

export function displayNotificationHistory() {
  const content = document.getElementById("notificationHistoryContent");
  if (!content) return;

  if (this.notificationHistory.length === 0) {
    content.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="bi bi-bell-slash fs-1 mb-3"></i>
        <p>${escapeNotificationHtml(t("notifications.empty"))}</p>
      </div>
    `;
    return;
  }

  const notifications = this.notificationHistory
    .map((notification) => {
      const timestamp = new Date(notification.timestamp);
      const timeAgo = this.getTimeAgo(timestamp);
      const iconClass = this.getNotificationIcon(notification.type);
      const bgClass = this.getNotificationBgClass(notification.type);

      const titleSafe = escapeNotificationHtml(notification.title);
      const bodyRaw = notification.messageHtml || notification.message;
      const bodySafe =
        notification.messageHtml && notification.messageHtmlTrusted === true
          ? bodyRaw
          : escapeNotificationHtml(bodyRaw);

      return `
      <div class="notification-item border-bottom border-secondary pb-3 mb-3">
        <div class="d-flex align-items-start">
          <div class="notification-icon me-3">
            <div class="rounded-circle d-flex align-items-center justify-content-center ${bgClass}" style="width: 40px; height: 40px;">
              <i class="${iconClass} text-white"></i>
            </div>
          </div>
          <div class="notification-content flex-grow-1">
            <div class="notification-title fw-bold mb-1">${titleSafe}</div>
            <div class="notification-message text-muted mb-2">${bodySafe}</div>
            <div class="notification-time text-muted small">
              <i class="bi bi-clock me-1"></i>
              ${timeAgo}
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  content.innerHTML = notifications;
}

export function getNotificationIcon(type) {
  switch (type) {
    case "success":
    case "added":
      return "bi bi-plus";
    case "warning":
    case "removed":
      return "bi bi-dash";
    case "info":
    case "updated":
      return "bi bi-info-circle";
    case "danger":
    case "error":
      return "bi bi-exclamation-triangle-fill";
    default:
      return "bi bi-bell";
  }
}

export function getNotificationBgClass(type) {
  switch (type) {
    case "success":
    case "added":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "info":
    case "updated":
      return "bg-info";
    case "danger":
    case "error":
    case "removed":
      return "bg-danger";
    default:
      return "bg-secondary";
  }
}

export function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return t("notifications.justNow");
  } else if (diffMinutes < 60) {
    return diffMinutes === 1
      ? t("notifications.minutesAgoOne")
      : t("notifications.minutesAgoMany", { count: diffMinutes });
  } else if (diffHours < 24) {
    return diffHours === 1
      ? t("notifications.hoursAgoOne")
      : t("notifications.hoursAgoMany", { count: diffHours });
  } else {
    return diffDays === 1
      ? t("notifications.daysAgoOne")
      : t("notifications.daysAgoMany", { count: diffDays });
  }
}

export function clearNotificationHistory() {
  this.notificationHistory = [];
  this.updateNotificationBell();
  this.displayNotificationHistory();
  this.saveNotificationHistory();

  // Hide the bell if no notifications
  const bellDiv = document.getElementById("notification-bell");
  if (bellDiv) {
    bellDiv.classList.add("d-none");
  }
}

export function saveNotificationHistory() {
  try {
    localStorage.setItem(
      "farmdashboard_notifications",
      JSON.stringify(this.notificationHistory)
    );
  } catch (error) {
    console.warn(
      "Could not save notification history to localStorage:",
      error
    );
  }
}

export function loadNotificationHistory() {
  try {
    const stored = localStorage.getItem("farmdashboard_notifications");
    if (stored) {
      this.notificationHistory = JSON.parse(stored);
      this.updateNotificationBell();
    }
  } catch (error) {
    console.warn(
      "Could not load notification history from localStorage:",
      error
    );
    this.notificationHistory = [];
  }
}