// FS25 FarmDashboard | navigation.js | v2.0.0

import { t } from "../i18n/i18n.js";
import {
  initFarmDashboardBackground,
  setFarmDashboardBackground,
} from "./farm-dashboard-bg.js";

function sectionHiddenMessage() {
  try {
    return t("settings.sectionHidden");
  } catch (_) {
    return "That section is turned off in Dashboard Settings.";
  }
}

export function setupEventListeners() {
  const folderInput = document.getElementById("folder-input");
  const clearFolderBtn = document.getElementById("clear-folder-btn");

  if (folderInput) {
    folderInput.addEventListener("change", (e) =>
      this.handleFolderSelection(e)
    );
  }
  if (clearFolderBtn) {
    clearFolderBtn.addEventListener("click", () => this.clearSavedData());
  }

  const landingModImagesBtn = document.getElementById("landing-import-mod-images");
  if (landingModImagesBtn && typeof window !== "undefined" && window.farmDashAPI) {
    let modShopExportInFlight = false;
    landingModImagesBtn.addEventListener("click", async () => {
      if (modShopExportInFlight) return;
      modShopExportInFlight = true;
      const originalHtml = landingModImagesBtn.innerHTML;
      landingModImagesBtn.innerHTML =
        `<i class="bi bi-hourglass-split me-1"></i>${t("landing.scanning")}`;
      let cleanupProgress = null;
      try {
        const api = window.farmDashAPI;
        if (api && typeof api.exportModStoreImages === "function") {
          if (typeof window.attachModExportProgress === "function") {
            cleanupProgress = window.attachModExportProgress(api);
          }
          await api.exportModStoreImages();
        }
      } catch (e) {
        console.error("[landing-import-mod-images]", e);
      } finally {
        if (typeof cleanupProgress === "function") cleanupProgress();
        modShopExportInFlight = false;
        landingModImagesBtn.innerHTML = originalHtml;
      }
    });
  }
  const navHomeBtn = document.getElementById("nav-home-btn");
  if (navHomeBtn) {
    navHomeBtn.addEventListener("click", () => this.showLanding());
  }
  const folderErrorBackBtn = document.getElementById("folder-error-back-home-btn");
  if (folderErrorBackBtn) {
    folderErrorBackBtn.addEventListener("click", () =>
      this.openUnifiedSettingsModal?.("servers")
    );
  }
  const folderErrorBackLink = document.getElementById("folder-error-back-home-link");
  if (folderErrorBackLink) {
    folderErrorBackLink.addEventListener("click", (e) => {
      e.preventDefault();
      this.openUnifiedSettingsModal?.("servers");
    });
  }

  window.addEventListener("farmdash-locale-changed", () => {
    try {
      this.updateNavbar();
    } catch (e) {
      /* ignore */
    }
  });

  // Notification history event listeners
  const clearNotificationsBtn = document.getElementById(
    "clearNotificationsBtn"
  );
  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener("click", () =>
      this.clearNotificationHistory()
    );
  }

  // Display notification history when modal opens
  const notificationModal = document.getElementById(
    "notificationHistoryModal"
  );
  if (notificationModal) {
    notificationModal.addEventListener("show.bs.modal", () => {
      this.displayNotificationHistory();
    });
  }
}

export function setupURLRouting() {
  // Handle hash change events for navigation
  window.addEventListener("hashchange", () => {
    this.handleHashChange();
  });

  // Handle initial load with hash
  if (window.location.hash) {
    this.handleHashChange();
  }
}

export function handleHashChange() {
  let hash = window.location.hash.substring(1); // Remove the # symbol
  if (hash === "statistics") {
    hash = "productions";
    window.history.replaceState(null, null, "#productions");
  }

  // Check if any data has been loaded (either from API or saved folder)
  if (!this.isDataLoaded && !this.savedFolderData) {
    // No data loaded yet, ignore hash navigation
    return;
  }

  if (hash) {
    // Navigate to specific section
    const validSections = [
      "livestock",
      "vehicles",
      "fields",
      "economy",
      "pastures",
      "productions",
    ];
    if (validSections.includes(hash)) {
      if (typeof this.isDashboardSectionEnabled === "function" && !this.isDashboardSectionEnabled(hash)) {
        window.history.replaceState(null, null, window.location.pathname);
        this.showLanding();
        return;
      }
      this.showSection(hash);
    } else {
      // Invalid section, go to landing page
      this.showLanding();
    }
  } else {
    // No hash, show landing page
    this.showLanding();
  }
}

export function setupTabs() {
  // Bootstrap handles tab switching automatically, no custom code needed
}

export function switchTab(tabName) {
  // Bootstrap handles this automatically with data-bs-toggle="pill"
}

export function showNavbar() {
  document.getElementById("main-navbar").classList.remove("d-none");
  this.updateNavbar();
}

export function hideNavbar() {
  document.getElementById("main-navbar").classList.add("d-none");
}

export function updateNavbar() {
  const currentSection = this.getCurrentSection();
  const sectionTitleElement = document.getElementById("navbar-section-title");
  const homeButton = document.getElementById("nav-home-btn");
  const gameTimeElement = document.getElementById("navbar-game-time");

  if (!sectionTitleElement || !homeButton) return;

  // Update section title and show/hide home button (i18n + same layout on every page)
  switch (currentSection) {
    case "landing":
    case "dashboard":
      sectionTitleElement.textContent = this.mapTitle || t("nav.section.dashboard");
      homeButton.classList.add("d-none");
      break;
    case "livestock":
      sectionTitleElement.textContent = t("nav.section.livestock");
      homeButton.classList.remove("d-none");
      break;
    case "vehicles":
      sectionTitleElement.textContent = t("nav.section.vehicles");
      homeButton.classList.remove("d-none");
      break;
    case "fields":
      sectionTitleElement.textContent = t("nav.section.fields");
      homeButton.classList.remove("d-none");
      break;
    case "economy":
      sectionTitleElement.textContent = t("nav.section.economy");
      homeButton.classList.remove("d-none");
      break;
    case "pastures":
      sectionTitleElement.textContent = t("nav.section.pastures");
      homeButton.classList.remove("d-none");
      break;
    case "productions":
      sectionTitleElement.textContent = t("nav.section.productions");
      homeButton.classList.remove("d-none");
      break;
    default:
      sectionTitleElement.textContent = t("nav.section.dashboard");
      homeButton.classList.add("d-none");
  }

  // Update game time in navbar
  if (!gameTimeElement) return;
  if (this.gameTime) {
    const timeSpan = gameTimeElement.querySelector("span");
    if (timeSpan) timeSpan.textContent = this.getGameTimeDisplay();
    gameTimeElement.classList.remove("d-none");
  } else {
    gameTimeElement.classList.add("d-none");
  }
}

export function getCurrentSection() {
  // Return the tracked section set by showSection() / showLanding().
  // Previously this inspected DOM visibility and returned hardcoded strings
  // ("livestock", "other-section") which broke farm-switching and navbar logic.
  return this.currentSection || "landing";
}

/** Move insights row to landing so replacing #section-content-dynamic cannot destroy it. */
function parkAiFarmInsightsRow() {
  const row = document.getElementById("ai-farm-insights-row");
  const landing = document.getElementById("ai-insights-slot-landing");
  if (row && landing) landing.appendChild(row);
}

/**
 * Mount #ai-farm-insights-row in the slot for the active view (home, livestock, or injected section).
 */
function positionAiFarmInsightsRow(sectionName) {
  const row = document.getElementById("ai-farm-insights-row");
  if (!row) return;
  const landing = document.getElementById("ai-insights-slot-landing");
  const dashSlot = document.getElementById("ai-insights-slot-dashboard");
  const sectionSlot = document.getElementById("ai-insights-slot-section");
  if (sectionName === "livestock" && dashSlot) {
    dashSlot.appendChild(row);
    return;
  }
  if (
    ["vehicles", "fields", "economy", "pastures", "productions"].includes(
      sectionName
    ) &&
    sectionSlot
  ) {
    sectionSlot.appendChild(row);
    return;
  }
  if (landing) landing.appendChild(row);
}

/** Show Smart suggestions row on Home (dashboard) and detail sections (Vehicles, Fields, …). */
function updateSmartSuggestionsRowVisibility(sectionName) {
  const row = document.getElementById("ai-farm-insights-row");
  const dash = document.getElementById("dashboard-content");
  const withSmart = [
    "dashboard",
    "landing",
    "livestock",
    "vehicles",
    "fields",
    "pastures",
    "economy",
    "productions",
  ];
  if (!withSmart.includes(sectionName)) {
    row?.classList.add("d-none");
    return;
  }
  row?.classList.remove("d-none");
  // Livestock uses #dashboard-content; other sections hide it. Do not depend on #ai-farm-insights-row
  // (if that node were missing, we would still need to toggle the livestock panel).
  if (sectionName === "livestock") {
    dash?.classList.remove("d-none");
  } else {
    dash?.classList.add("d-none");
  }
  if (row) {
    positionAiFarmInsightsRow(sectionName);
  }
}

export function showInfoMessage(message) {
  this.showAlert(message, "info");
}

export function showSuccessMessage(message) {
  this.showAlert(message, "success");
}

export function showAlert(message, type) {
  // Create or get the toast container
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    toastContainer.className = "toast-container";
    toastContainer.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              z-index: 1055;
              display: flex;
              flex-direction: column;
              gap: 10px;
          `;
    document.body.appendChild(toastContainer);
  }

  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
  alertDiv.style.cssText = `
          min-width: 320px;
          border-radius: 12px;
          border: 2px solid rgba(85, 107, 47, 0.3);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(15px);
          margin-bottom: 0;
      `;
  alertDiv.innerHTML = `
          <i class="bi bi-${
            type === "success" ? "check-circle" : "info-circle"
          } me-2"></i>
          ${message}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      `;

  toastContainer.appendChild(alertDiv);

  // Add click handler for close button
  const closeBtn = alertDiv.querySelector(".btn-close");
  closeBtn.addEventListener("click", () => {
    alertDiv.classList.remove("show");
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.remove();
      }
    }, 150);
  });

  // Auto-remove after timeout
  setTimeout(
    () => {
      if (alertDiv.parentNode) {
        alertDiv.classList.remove("show");
        setTimeout(() => {
          if (alertDiv.parentNode) {
            alertDiv.remove();
          }
        }, 150);
      }
    },
    type === "success" ? 3000 : 4000
  );
}

export function showDashboard() {
  this.isDataLoaded = true;
  document.getElementById("folder-selection").classList.add("d-none");
  document.getElementById("landing-page").classList.remove("d-none");
  initFarmDashboardBackground();
  setFarmDashboardBackground("home");
  this.showNavbar(); // Make sure navbar is visible
  this.updateLandingPageCounts();
  this.updateNavbar();

  if (typeof this.loadDashboardUiPreferences === "function") {
    this.loadDashboardUiPreferences();
  }

  if (!this.currentSection || this.currentSection === "landing") {
    this.currentSection = "dashboard";
  }
  updateSmartSuggestionsRowVisibility(this.currentSection);
  if (typeof window.refreshFarmDashConsultantInsights === "function") {
    window.refreshFarmDashConsultantInsights(true);
  }

  // Check for hash navigation after loading dashboard
  if (window.location.hash) {
    this.handleHashChange();
  }
}

export function updateLandingPageCounts() {
  // Update livestock count
  const livestockCount = this.animals ? this.animals.length : 0;
  document.getElementById(
    "livestock-count"
  ).textContent = `${livestockCount} Animals`;

  // Update game time display
  const gameTimeElement = document.getElementById("game-time-display");
  if (gameTimeElement) {
    gameTimeElement.innerHTML = `<i class="bi bi-clock me-1"></i>${this.getGameTimeDisplay()}`;
  }

  // Update vehicle count
  const vehicleCount = this.vehicles ? this.vehicles.length : 0;
  document.getElementById(
    "vehicle-count"
  ).textContent = `${vehicleCount} Vehicles`;

  // Update field count
  const fieldCountElement = document.getElementById("field-count");
  if (fieldCountElement) {
    const fieldCount = this.fields ? this.fields.length : 0;
    fieldCountElement.textContent = `${fieldCount} Field${
      fieldCount !== 1 ? "s" : ""
    }`;
  }

  // Update pasture count (replaced property-count)
  const pastureCountElement = document.getElementById("pasture-count");
  if (pastureCountElement) {
    // Always refresh pasture data to get current warnings and counts
    this.parsePastureData();
    const pasturesForFarm =
      typeof this.getPasturesForActiveFarm === "function"
        ? this.getPasturesForActiveFarm()
        : this.pastures || [];
    pastureCountElement.textContent = `${pasturesForFarm.length} Pastures`;

    // Update warning badge on dashboard
    const totalAllWarnings = pasturesForFarm.reduce(
      (sum, pasture) => sum + (pasture.allWarnings?.length || 0),
      0
    );
    const warningBadge = document.getElementById("pasture-warnings-badge");
    const warningCount = document.getElementById("pasture-warnings-count");
    if (warningBadge && warningCount) {
      if (totalAllWarnings > 0) {
        warningCount.textContent = totalAllWarnings;
        warningBadge.classList.remove("d-none");
      } else {
        warningBadge.classList.add("d-none");
      }
    }
  }

  const productionCountEl = document.getElementById("production-count");
  if (productionCountEl && typeof this.getOwnedProductionChainCount === "function") {
    const n = this.getOwnedProductionChainCount();
    productionCountEl.textContent = `${n} ${n === 1 ? "Chain" : "Chains"}`;
  }
}

export function showLanding() {
  // Track current section
  this.currentSection = "dashboard";

  // Clear URL hash when returning to main dashboard
  if (window.location.hash) {
    window.history.replaceState(null, null, window.location.pathname);
  }

  setFarmDashboardBackground("home");

  parkAiFarmInsightsRow();
  document.getElementById("section-content").classList.add("d-none");
  document.getElementById("dashboard-content").classList.add("d-none");
  document.getElementById("landing-page").classList.remove("d-none");
  this.updateLandingPageCounts(); // Update counts including pastures badge
  this.updateNavbar();
  updateSmartSuggestionsRowVisibility("dashboard");
  if (typeof window.refreshFarmDashConsultantInsights === "function") {
    window.refreshFarmDashConsultantInsights(true);
  }
}

export function showSection(sectionName) {
  if (typeof this.isDashboardSectionEnabled === "function" && !this.isDashboardSectionEnabled(sectionName)) {
    this.showAlert(sectionHiddenMessage(), "info");
    this.showLanding();
    return;
  }

  // Track current section
  this.currentSection = sectionName;

  if (sectionName !== "landing" && sectionName !== "dashboard") {
    setFarmDashboardBackground(sectionName);
  }

  // Update URL hash without triggering hashchange event
  if (window.location.hash.substring(1) !== sectionName) {
    window.history.replaceState(null, null, `#${sectionName}`);
  }

  parkAiFarmInsightsRow();
  document.getElementById("landing-page").classList.add("d-none");
  document.getElementById("section-content").classList.add("d-none");

  switch (sectionName) {
    case "dashboard":
    case "landing":
      // Home / card grid — same as showLanding(); must not fall through to default
      this.showLanding();
      break;
    case "livestock":
      // Show the existing livestock dashboard
      document.getElementById("dashboard-content").classList.remove("d-none");
      this.updateSummaryCards();
      this.renderAnimalsTable();
      break;
    case "vehicles":
      this.showVehiclesSection();
      break;
    case "fields":
      this.showFieldsSection();
      break;
    case "economy":
      this.showEconomySection();
      break;
    case "pastures":
      this.showPasturesSection();
      break;
    case "productions":
      this.showProductionsSection();
      break;
    default: {
      const dyn = document.getElementById("section-content-dynamic");
      if (dyn) {
        dyn.innerHTML = `
                  <div class="text-center">
                      <h3 class="text-warning">Section Under Development</h3>
                      <p class="text-muted">The ${sectionName} section is coming soon!</p>
                  </div>
              `;
      }
      document.getElementById("section-content").classList.remove("d-none");
    }
  }

  updateSmartSuggestionsRowVisibility(sectionName);

  if (typeof window.refreshFarmDashConsultantInsights === "function") {
    window.setTimeout(function () {
      try {
        window.refreshFarmDashConsultantInsights(true);
      } catch (e) {}
    }, 450);
  }

  // Update navbar after section change
  this.updateNavbar();
}


export function showFarmSelectionModal() {
  const farmList = document.getElementById("farm-selection-list");
  farmList.innerHTML = "";

  this.playerFarms.forEach((farm, index) => {
    const farmOption = document.createElement("button");
    farmOption.className = `list-group-item list-group-item-action bg-secondary text-light d-flex justify-content-between align-items-center`;
    farmOption.innerHTML = `
              <div>
                  <h6 class="mb-1">${farm.name}</h6>
                  <small class="text-muted">Farm ID: ${farm.id} (Internal: ${farm.internalId})</small>
              </div>
              <i class="bi bi-arrow-right"></i>
          `;

    farmOption.addEventListener("click", () => {
      this.selectFarm(farm);
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("farmSelectionModal")
      );
      modal.hide();
    });

    farmList.appendChild(farmOption);
  });

  // Show the modal
  const modal = new bootstrap.Modal(
    document.getElementById("farmSelectionModal")
  );
  modal.show();
}

export function selectFarm(farm) {
  this.selectedFarm = farm;
  this.selectedFarmId = farm.internalId;

  // Update the dropdown selector and proceed with data loading
  this.populateFarmSelector();
  this.proceedWithDataLoading();
}

export function populateFarmSelector() {
  const farmSelect = document.getElementById("farm-select");
  const farmSelector = document.getElementById("farm-selector");

  if (this.playerFarms.length > 0) {
    // Always show farm selector when farms are available
    farmSelector.style.display = "block";
    farmSelect.innerHTML = "";

    this.playerFarms.forEach((farm) => {
      const option = document.createElement("option");
      option.value = farm.internalId;
      option.textContent = farm.name;
      option.selected = farm.internalId === this.selectedFarmId;
      farmSelect.appendChild(option);
    });
  } else {
    farmSelector.style.display = "none";
  }
}