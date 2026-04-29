// FS25 FarmDashboard | livestock.js | v2.0.0

import { t } from "../i18n/i18n.js";

export function formatGenderLabel(gender) {
  const g = String(gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m") return t("livestock.genderMale");
  if (g === "female" || g === "f") return t("livestock.genderFemale");
  return t("livestock.genderUnknown");
}

export function fmtAgeMonthsStr(m) {
  return t("livestock.fmtAgeMonths", { months: m });
}

export function fmtWeightKgStr(w, decimals = 1) {
  return t("livestock.fmtWeightKg", { kg: Number(w).toFixed(decimals) });
}

export function refreshAnimalData() {
  if (!this.savedFolderData || !this.savedFolderData.xmlData) {
    return;
  }

  // Re-parse animal data with new farm filter
  this.parseAnimalData(this.savedFolderData.xmlData);
  this.updateSummaryCards();
  this.renderAnimalsTable();
}

// Generate a hash of animal data to detect changes
export function generateAnimalsDataHash() {
  if (!this.animals || this.animals.length === 0) {
    return "empty";
  }

  // Create a string representation of key animal data
  const dataString = this.animals
    .map(
      (animal) =>
        `${animal.id}-${animal.health}-${animal.age}-${animal.isLactating}-${animal.isPregnant}-${animal.weight}`
    )
    .sort()
    .join("|");

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

export function updateSummaryCards() {
  const totalCount = this.animals.length;
  const lactatingCount = this.animals.filter((a) => a.isLactating).length;
  const pregnantCount = this.animals.filter((a) => a.isPregnant).length;
  const avgHealth =
    totalCount > 0
      ? (
          this.animals.reduce((sum, a) => sum + a.health, 0) / totalCount
        ).toFixed(0)
      : 0;

  document.getElementById("total-count").textContent = totalCount;
  document.getElementById("lactating-count").textContent = lactatingCount;
  document.getElementById("pregnant-count").textContent = pregnantCount;
  document.getElementById("avg-health").textContent = avgHealth + "%";
}

export function renderAnimalsTable() {
  // Check if data has actually changed
  const currentHash = this.generateAnimalsDataHash();
  if (this.lastAnimalsDataHash === currentHash && this.dataTable) {
    // Data hasn't changed and table exists, no need to update
    return;
  }
  this.lastAnimalsDataHash = currentHash;

  // Check if we have animals data
  if (!this.animals || this.animals.length === 0) {
    if (this.dataTable) {
      // If DataTable exists, clear it
      this.dataTable.clear().draw();
    } else {
      // If no DataTable, show empty message
      document.getElementById("animals-tbody").innerHTML =
        `<tr><td colspan="10" class="text-center text-muted">${t("livestock.noAnimalsFound")}</td></tr>`;
    }
    return;
  }

  // Prepare data for DataTables
  const tableData = this.animals.map((animal) => {
    try {
      // Create status badges
      const statusBadges = [];
      if (animal.health === 0)
        statusBadges.push(`<span class="badge bg-danger">${t("livestock.badgeError")}</span>`);
      if (animal.isPregnant)
        statusBadges.push(
          `<span class="badge status-pregnant">${t("livestock.badgePregnant")}</span>`
        );
      if (animal.isLactating)
        statusBadges.push(
          `<span class="badge status-lactating">${t("livestock.badgeLactating")}</span>`
        );
      if (animal.isParent)
        statusBadges.push(`<span class="badge status-parent">${t("livestock.badgeParent")}</span>`);

      // Create health bar
      const healthClass = this.getHealthClass(animal.health || 100);
      const healthBar = `
                <div style="display: flex; align-items: center;">
                    <div class="health-bar">
                        <div class="health-fill ${healthClass}" style="width: ${
        animal.health || 100
      }%"></div>
                    </div>
                    <span>${Math.round(animal.health || 100)}%</span>
                </div>
            `;

      // Display RealisticLivestock ID prominently
      const animalIdDisplay = animal.id
        ? `<code class="text-info" title="RealisticLivestock ID: ${animal.id}">#${animal.id}</code>`
        : `<code class="text-muted">${t("common.notAvailable")}</code>`;

      return [
        animalIdDisplay,
        this.formatAnimalType(animal.subType || t("common.unknown")),
        fmtAgeMonthsStr(animal.age || 0),
        formatGenderLabel(animal.gender),
        healthBar,
        fmtWeightKgStr(animal.weight || 0, 1),
        `$${this.calculateAnimalValue(animal).value.toLocaleString()}`,
        statusBadges.join(" ") || "-",
        this.formatLocation(
          resolveAnimalLocationLabel(animal),
          resolveAnimalLocationType(animal)
        ),
        `<button class="btn btn-sm btn-outline-success" onclick='dashboard.showAnimalDetails(${JSON.stringify(String(animal.id))})' title="${t("livestock.detailsBtnTitle")}">
                    <i class="bi bi-eye me-1"></i>${t("livestock.btnDetails")}
                </button>`,
      ];
    } catch (error) {
      // Return a safe fallback row
      return [
        `<code class="text-muted">${animal.id || t("livestock.badgeError")}</code>`,
        t("common.unknown"),
        fmtAgeMonthsStr(0),
        t("common.unknown"),
        "0%",
        fmtWeightKgStr(0, 1),
        "$0",
        t("livestock.badgeError"),
        t("common.unknown"),
        t("livestock.badgeError"),
      ];
    }
  });

  // If DataTable already exists, update the data instead of recreating
  if (this.dataTable) {
    try {
      this.dataTable.clear().rows.add(tableData).draw();
      return;
    } catch (error) {
      // If there's an error updating, destroy and recreate
      this.dataTable.destroy();
      this.dataTable = null;
    }
  }

  // Clear existing table body only when creating new DataTable
  document.getElementById("animals-tbody").innerHTML = "";

  // Initialize DataTable (only if it doesn't exist)
  try {
    this.dataTable = $("#animals-table").DataTable({
      data: tableData,
      columns: [
        { title: t("livestock.colId"), data: 0 },
        { title: t("livestock.colType"), data: 1 },
        { title: t("livestock.colAge"), data: 2 },
        { title: t("livestock.colGender"), data: 3 },
        { title: t("livestock.colHealth"), data: 4, orderable: false },
        { title: t("livestock.colWeight"), data: 5 },
        { title: t("livestock.colValue"), data: 6 },
        { title: t("livestock.colStatus"), data: 7, orderable: false },
        { title: t("livestock.colLocation"), data: 8 },
        { title: t("livestock.colActions"), data: 9, orderable: false },
      ],
      lengthMenu: [
        [10, 25, 50, 100, 200, 500, -1],
        [10, 25, 50, 100, 200, 500, t("livestock.dtAll")]
      ],
      pageLength: 25,
      responsive: true,
      order: [[0, "asc"]], // Sort by ID by default
      columnDefs: [
        {
          targets: [0], // ID column - smaller width
          width: "80px",
        },
        {
          targets: [4], // Health column
          orderable: false,
        },
        {
          targets: [7], // Status column
          orderable: false,
        },
        {
          targets: [9], // Actions column
          orderable: false,
        },
      ],
      dom: '<"d-none"B>lfrtip', 
      buttons: ["copy", "csv", "excel", "pdf", "print"],
      language: {
        search: t("livestock.dtSearch"),
        lengthMenu: t("livestock.dtLengthMenu"),
        info: t("livestock.dtInfo"),
        emptyTable: t("livestock.dtEmpty"),
      },
      initComplete: function() {
        // --- THIS IS THE NEW TELEPORTATION LOGIC ---
        // 1. Grab the generated dropdown menu
        const lengthMenu = $('#animals-table_length');
        
        // 2. Format it nicely using Bootstrap classes
        lengthMenu.addClass('mb-0 ms-auto'); 
        lengthMenu.find('label').addClass('d-flex align-items-center mb-0 gap-2 text-muted');
        lengthMenu.find('select').addClass('form-select form-select-sm w-auto');
        
        // 3. Find the closest Card Header (Title Bar) directly above this table
        const titleBar = $('#animals-table').closest('.card').find('.card-header').first();
        
        // 4. Move the dropdown into the Title Bar
        if (titleBar.length) {
            titleBar.addClass('d-flex justify-content-between align-items-center');
            lengthMenu.appendTo(titleBar);
        }
      }
    });
  } catch (error) {
    // Fallback: show data in a simple table format
    const tbody = document.getElementById("animals-tbody");
    tbody.innerHTML = tableData
      .map(
        (row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`
      )
      .join("");
  }

  // Initialize sliders for the first time or after table recreation
  this.initializeSliders();

  // After a full table rebuild, restore summary or advanced filters (realtime refresh)
  if (typeof this.reapplyLivestockFiltersAfterRender === "function") {
    this.reapplyLivestockFiltersAfterRender();
  }
}

/**
 * After renderAnimalsTable refreshes data, re-apply the user's active filter mode
 * so WebSocket/realtime updates do not reset the table to "all animals".
 */
export function reapplyLivestockFiltersAfterRender() {
  if (!this.dataTable || !this.animals?.length) return;
  const mode = this.livestockFilterMode || "none";
  try {
    if (mode === "advanced" && typeof this.applyFilters === "function") {
      this.applyFilters(true);
    } else if (
      mode === "summary" &&
      this.activeFilter &&
      this.activeFilter !== "all" &&
      typeof this.filterAnimals === "function"
    ) {
      this.filterAnimals(this.activeFilter, true);
    }
  } catch (e) {
    console.warn("[livestock] reapply filters", e);
  }
}

export function getHealthClass(health) {
  if (health >= 80) return "health-excellent";
  if (health >= 60) return "health-good";
  if (health >= 40) return "health-average";
  if (health >= 20) return "health-poor";
  return "health-critical";
}

export function formatAnimalType(subType) {
  // Convert "COW_HEREFORD" to "Hereford Cow"
  const parts = subType.split("_");
  if (parts.length > 1) {
    const type = parts[0].toLowerCase();
    const breed = parts
      .slice(1)
      .join(" ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
    return `${breed} ${this.capitalize(type)}`;
  }
  return this.capitalize(subType);
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function resolveAnimalLocationLabel(animal) {
  if (!animal || typeof animal !== "object") return "Unknown";
  const direct = String(animal.location || "").trim();
  if (direct && direct.toLowerCase() !== "unknown") return direct;
  const husbandry = String(animal.husbandryName || "").trim();
  if (husbandry && husbandry.toLowerCase() !== "unknown") return husbandry;
  return "Unknown";
}

function resolveAnimalLocationType(animal) {
  if (!animal || typeof animal !== "object") return "unknown";
  const direct = String(animal.locationType || "").trim();
  if (direct && direct.toLowerCase() !== "unknown") return direct;
  const husbandry = String(animal.husbandryName || "").trim();
  return husbandry ? "Livestock Building" : "unknown";
}

export function formatLocation(location, locationType) {
  if (!location || location === "Unknown") {
    return `<span class="badge bg-secondary">${t("livestock.locationUnknownBadge")}</span>`;
  }

  // Determine badge color based on location type
  let badgeClass = "bg-secondary";
  let icon = "bi-house";

  if (locationType && locationType.includes("Cow")) {
    badgeClass = "bg-success";
    icon = "bi-building";
  } else if (locationType && locationType.includes("Pig")) {
    badgeClass = "bg-warning text-dark";
    icon = "bi-building";
  } else if (locationType && locationType.includes("Chicken")) {
    badgeClass = "bg-info";
    icon = "bi-house-door";
  } else if (locationType && locationType.includes("Sheep")) {
    badgeClass = "bg-primary";
    icon = "bi-tree";
  }

  return `<span class="badge ${badgeClass}" title="${locationType}">
                  <i class="${icon} me-1"></i>${location}
              </span>`;
}

export function showAnimalDetails(animalId) {
  // Convert animalId to number if it's a string, to handle both string and number IDs
  const searchId =
    typeof animalId === "string" ? parseInt(animalId, 10) : animalId;
  const animal = this.animals.find(
    (a) =>
      a.id === searchId ||
      a.id === animalId ||
      String(a.id) === String(animalId)
  );
  if (!animal) {
    console.error(
      "Animal not found:",
      animalId,
      "Available IDs:",
      this.animals.map((a) => a.id)
    );
    return;
  }

  const modalTitle = document.getElementById("animalDetailsModalLabel");
  const modalContent = document.getElementById("animalDetailsContent");

  modalTitle.innerHTML = `<i class="bi bi-clipboard-data me-2"></i>${
    animal.name || `Animal #${animal.id}`
  } <span class="badge bg-info ms-2">${animal.id}</span>`;

  // Create comprehensive animal details with RealisticLivestock data
  const detailsHTML = `
          <div class="row">
              <div class="col-md-4">
                  <div class="card bg-secondary mb-3">
                      <div class="card-header bg-info text-dark">
                          <h6 class="mb-0"><i class="bi bi-tag-fill me-2"></i>${t("livestock.modalTag")}</h6>
                      </div>
                      <div class="card-body text-center">
                          <div class="livestock-tag">
                              <img src="/assests/img/tag.svg" alt="" width="120" height="160" />
                              <div class="tag-id">${animal.id}</div>
                          </div>
                          <div class="mt-3">

                              ${
                                animal.numAnimals
                                  ? `<small class="text-muted d-block">${t("livestock.labelNumAnimals")} ${animal.numAnimals}</small>`
                                  : ""
                              }
                          </div>
                      </div>
                  </div>

                  ${
                    (animal.motherId && animal.motherId !== -1) ||
                    (animal.fatherId && animal.fatherId !== -1)
                      ? `
                  <div class="card bg-secondary mb-3">
                      <div class="card-header">
                          <h6 class="mb-0"><i class="bi bi-people-fill me-2"></i>${t("livestock.modalFamily")}</h6>
                      </div>
                      <div class="card-body">
                          ${
                            animal.motherId && animal.motherId !== -1
                              ? `<p class="mb-1"><strong>${t("livestock.labelMotherId")}</strong> <code>#${animal.motherId}</code></p>`
                              : ""
                          }
                          ${
                            animal.fatherId && animal.fatherId !== -1
                              ? `<p class="mb-1"><strong>${t("livestock.labelFatherId")}</strong> <code>#${animal.fatherId}</code></p>`
                              : ""
                          }
                      </div>
                  </div>
                  `
                      : ""
                  }
              </div>

              <div class="col-md-8">
                  <div class="row">
                      <div class="col-md-6">
                          <div class="card bg-secondary mb-3">
                              <div class="card-header">
                                  <h6 class="mb-0"><i class="bi bi-info-circle me-2"></i>${t("livestock.modalBasicInfo")}</h6>
                              </div>
                              <div class="card-body">
                                  <table class="table table-sm table-borderless table-dark text-light">
                                      <tr><td><strong>${t("livestock.labelName")}</strong></td><td>${
                                        animal.name || t("livestock.nameFallback", { id: animal.id })
                                      }</td></tr>
                                      <tr><td><strong>${t("livestock.labelType")}</strong></td><td>${this.formatAnimalType(
                                        animal.subType
                                      )}</td></tr>
                                      <tr><td><strong>${t("livestock.labelGender")}</strong></td><td>${formatGenderLabel(
                                        animal.gender
                                      )}</td></tr>
                                      <tr><td><strong>${t("livestock.labelAge")}</strong></td><td>${fmtAgeMonthsStr(
                                        animal.age || 0
                                      )}</td></tr>
                                      <tr><td><strong>${t("livestock.labelLocation")}</strong></td><td>${
                                        resolveAnimalLocationLabel(animal)
                                      }</td></tr>
                                  </table>
                              </div>
                          </div>
                      </div>

                      <div class="col-md-6">
                          <div class="card bg-secondary mb-3">
                              <div class="card-header">
                                  <h6 class="mb-0"><i class="bi bi-heart-pulse me-2"></i>${t("livestock.modalHealthPhysical")}</h6>
                              </div>
                              <div class="card-body">
                                  <table class="table table-sm table-borderless table-dark text-light">
                                      <tr><td><strong>${t("livestock.labelHealth")}</strong></td><td>${Math.round(
                                        animal.health || 0
                                      )}%</td></tr>
                                      <tr><td><strong>${t("livestock.labelWeight")}</strong></td><td>${fmtWeightKgStr(
                                        animal.weight || 0,
                                        0
                                      )}</td></tr>
                                      <tr><td><strong>${t("livestock.labelReproduction")}</strong></td><td>${(animal.reproduction &&
                                      !isNaN(animal.reproduction)
                                        ? animal.reproduction
                                        : animal.genetics &&
                                          animal.genetics.fertility &&
                                          !isNaN(animal.genetics.fertility)
                                        ? animal.genetics.fertility
                                        : 0
                                      ).toFixed(2)}x</td></tr>
                                  </table>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          <div class="row">
              <div class="col-md-12">
                  <div class="card bg-secondary mb-3">
                      <div class="card-header bg-farm-accent">
                          <h6 class="mb-0"><i class="bi bi-geo-alt me-2"></i>${t("livestock.modalReproductionData")}</h6>
                      </div>
                      <div class="card-body">
                          <div class="row">
                              <div class="col-md-6">
                                  <table class="table table-sm table-borderless table-dark text-light">
                                      <tr><td><strong>${t("livestock.labelIsParent")}</strong></td><td>
                                          ${
                                            animal.isParent
                                              ? `<span class="badge bg-success">${t("common.yes")}</span>`
                                              : `<span class="badge bg-secondary">${t("common.no")}</span>`
                                          }
                                      </td></tr>
                                      <tr><td><strong>${t("livestock.labelIsPregnant")}</strong></td><td>
                                          ${
                                            animal.isPregnant
                                              ? `<span class="badge bg-warning text-dark">${t("common.yes")}</span>`
                                              : `<span class="badge bg-secondary">${t("common.no")}</span>`
                                          }
                                      </td></tr>
                                      <tr><td><strong>${t("livestock.labelIsLactating")}</strong></td><td>
                                          ${
                                            animal.isLactating
                                              ? `<span class="badge bg-info">${t("common.yes")}</span>`
                                              : `<span class="badge bg-secondary">${t("common.no")}</span>`
                                          }
                                      </td></tr>
                                      <tr><td><strong>${t("livestock.labelReproductionRate")}</strong></td><td>
                                          <div class="progress" style="height: 20px;">
                                              <div class="progress-bar bg-farm-success" role="progressbar"
                                                   style="width: ${
                                                     (animal.reproduction &&
                                                     !isNaN(
                                                       animal.reproduction
                                                     )
                                                       ? animal.reproduction
                                                       : animal.genetics &&
                                                         animal.genetics
                                                           .fertility &&
                                                         !isNaN(
                                                           animal.genetics
                                                             .fertility
                                                         )
                                                       ? animal.genetics
                                                           .fertility
                                                       : 0) * 100
                                                   }%">
                                                  ${(animal.reproduction &&
                                                  !isNaN(animal.reproduction)
                                                    ? animal.reproduction
                                                    : animal.genetics &&
                                                      animal.genetics
                                                        .fertility &&
                                                      !isNaN(
                                                        animal.genetics
                                                          .fertility
                                                      )
                                                    ? animal.genetics
                                                        .fertility
                                                    : 0
                                                  ).toFixed(2)}x
                                              </div>
                                          </div>
                                      </td></tr>
                                      <tr><td><strong>${t("livestock.labelMonthsSinceBirth")}</strong></td><td>
                                          ${
                                            animal.monthsSinceLastBirth !==
                                            undefined
                                              ? fmtAgeMonthsStr(
                                                  animal.monthsSinceLastBirth
                                                )
                                              : t("common.notAvailable")
                                          }
                                      </td></tr>
                                  </table>
                              </div>
                              <div class="col-md-6">
                                  <table class="table table-sm table-borderless table-dark text-light">
                                      ${
                                        animal.isPregnant
                                          ? this.getPregnancyDetails(animal)
                                          : ""
                                      }
                                      ${
                                        animal.impregnatedBy &&
                                        animal.impregnatedBy !== -1
                                          ? `<tr><td><strong>${t("livestock.labelImpregnatedBy")}</strong></td><td><code class="text-warning">#${animal.impregnatedBy}</code></td></tr>`
                                          : ""
                                      }
                                      ${
                                        animal.pregnancyDuration
                                          ? `<tr><td><strong>${t("livestock.labelPregnancyDuration")}</strong></td><td>${t("livestock.durationDays", { days: animal.pregnancyDuration })}</td></tr>`
                                          : ""
                                      }
                                      ${
                                        animal.offspring
                                          ? `<tr><td><strong>${t("livestock.labelExpectedOffspring")}</strong></td><td>${animal.offspring}</td></tr>`
                                          : ""
                                      }
                                  </table>
                              </div>
                          </div>
                          ${
                            animal.genetics
                              ? `
                          <div class="row mt-3">
                              <div class="col-12">
                                  <h6 class="text-farm-accent"><i class="bi bi-dna me-1"></i>${t("livestock.geneticsHeading")}</h6>
                                  <div class="row">
                                      <div class="col">
                                          <small class="text-muted">${t("livestock.geneticsShortHealth")}</small>
                                          <div class="mb-2" style="height: 15px;">
                                              <div class="text-info mb-3" style="width: ${
                                                (animal.genetics.health ||
                                                  1) * 100
                                              }%">
                                                  ${(
                                                    animal.genetics.health ||
                                                    1
                                                  ).toFixed(2)}x
                                              </div>
                                          </div>
                                      </div>
                                      <div class="col">
                                          <small class="text-muted">${t("livestock.geneticsShortFertility")}</small>
                                          <div class="mb-2" style="height: 15px;">
                                              <div class="text-info mb-3" style="width: ${
                                                (animal.genetics.fertility ||
                                                  1) * 100
                                              }%">
                                                  ${(
                                                    animal.genetics
                                                      .fertility || 1
                                                  ).toFixed(2)}x
                                              </div>
                                          </div>
                                      </div>
                                      <div class="col">
                                          <small class="text-muted">${t("livestock.geneticsShortProductivity")}</small>
                                          <div class="mb-2" style="height: 15px;">
                                              <div class="text-info mb-3" style="width: ${
                                                (animal.genetics
                                                  .productivity || 1) * 100
                                              }%">
                                                  ${(
                                                    animal.genetics
                                                      .productivity || 1
                                                  ).toFixed(2)}x
                                              </div>
                                          </div>
                                      </div>
                                      <div class="col">
                                          <small class="text-muted">${t("livestock.geneticsShortQuality")}</small>
                                          <div class="mb-2" style="height: 15px;">
                                              <div class="text-info mb-3" style="width: ${
                                                (animal.genetics.quality ||
                                                  1) * 100
                                              }%">
                                                  ${(
                                                    animal.genetics.quality ||
                                                    1
                                                  ).toFixed(2)}x
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                          `
                              : ""
                          }
                      </div>
                  </div>
              </div>
          </div>
          <div class="row">
              <div class="col-md-12">
                  <div class="card bg-secondary mb-3">
                      <div class="card-header">
                          <h6 class="mb-0"><i class="bi bi-currency-dollar me-2"></i>${t("livestock.modalLivestockValue")}</h6>
                      </div>
                      <div class="card-body">
                          ${this.generateAnimalValueDisplay(animal)}
                      </div>
                  </div>
              </div>
          </div>
      `;

  modalContent.innerHTML = detailsHTML;

  const pastureLivestockEl = document.getElementById("pasturelivestock-modal");
  const animalModalEl = document.getElementById("animalDetailsModal");
  if (!animalModalEl) return;

  const showAnimalModal = () => {
    bootstrap.Modal.getOrCreateInstance(animalModalEl).show();
  };

  if (pastureLivestockEl?.classList.contains("show")) {
    const pl =
      bootstrap.Modal.getInstance(pastureLivestockEl) ||
      bootstrap.Modal.getOrCreateInstance(pastureLivestockEl);
    pastureLivestockEl.addEventListener("hidden.bs.modal", showAnimalModal, {
      once: true,
    });
    pl.hide();
  } else {
    showAnimalModal();
  }
}

export function showExportModal() {
  const modal = new bootstrap.Modal(
    document.getElementById("exportDataModal")
  );
  modal.show();
}

export function exportData(format) {
  // Hide the export modal
  const modal = bootstrap.Modal.getInstance(
    document.getElementById("exportDataModal")
  );
  modal.hide();

  // Prepare data for export
  const exportData = this.animals.map((animal) => ({
    Name: animal.name || t("livestock.nameFallback", { id: animal.id }),
    Type: this.formatAnimalType(animal.subType),
    Age: fmtAgeMonthsStr(animal.age),
    Gender: formatGenderLabel(animal.gender),
    Health: `${Math.round(animal.health)}%`,
    Weight: fmtWeightKgStr(animal.weight, 1),
    Value: `$${this.calculateAnimalValue(animal).value.toLocaleString()}`,
    Status:
      [
        animal.health === 0 ? t("livestock.badgeError") : "",
        animal.isPregnant ? t("livestock.badgePregnant") : "",
        animal.isLactating ? t("livestock.badgeLactating") : "",
        animal.isParent ? t("livestock.badgeParent") : "",
      ]
        .filter((s) => s)
        .join(", ") || t("livestock.exportStatusNormal"),
    Location: resolveAnimalLocationLabel(animal),
    "Farm ID": animal.farmId,
    "Animal ID": animal.id,
    "Mother ID": animal.motherId !== "-1" ? animal.motherId : "",
    "Father ID": animal.fatherId !== "-1" ? animal.fatherId : "",
  }));

  // Use DataTables built-in export functionality
  switch (format) {
    case "csv":
      this.dataTable.button(".buttons-csv").trigger();
      break;
    case "excel":
      this.dataTable.button(".buttons-excel").trigger();
      break;
    case "pdf":
      this.dataTable.button(".buttons-pdf").trigger();
      break;
    case "print":
      this.dataTable.button(".buttons-print").trigger();
      break;
    default:
      console.error("Unknown export format:", format);
  }

  this.showSuccessMessage(
    t("livestock.exportStarted", { format: format.toUpperCase() })
  );
}

export function filterAnimals(filterType, silentRefresh) {
  // Store current active filter
  this.activeFilter = filterType;
  this.livestockFilterMode = filterType === "all" ? "none" : "summary";

  // Reset all animals to show initially (use this.animals as the source)
  let filteredAnimals = [...this.animals];

  // Apply the filter based on type
  switch (filterType) {
    case "all":
      // Show all animals - no filtering needed
      break;
    case "lactating":
      filteredAnimals = this.animals.filter((animal) => animal.isLactating);
      break;
    case "pregnant":
      filteredAnimals = this.animals.filter((animal) => animal.isPregnant);
      break;
    case "health":
      // Sort by health (highest to lowest) for health filter
      filteredAnimals = [...this.animals].sort((a, b) => b.health - a.health);
      break;
    default:
      console.warn("Unknown filter type:", filterType);
      break;
  }

  // Update the DataTable with filtered data
  if (this.dataTable) {
    // Clear current search to avoid conflicts
    this.dataTable.search("").draw();

    // Prepare filtered data for DataTable
    const tableData = filteredAnimals.map((animal) => {
      // Create status badges
      const statusBadges = [];
      if (animal.health === 0)
        statusBadges.push(`<span class="badge bg-danger">${t("livestock.badgeError")}</span>`);
      if (animal.isPregnant)
        statusBadges.push(
          `<span class="badge status-pregnant">${t("livestock.badgePregnant")}</span>`
        );
      if (animal.isLactating)
        statusBadges.push(
          `<span class="badge status-lactating">${t("livestock.badgeLactating")}</span>`
        );
      if (animal.isParent)
        statusBadges.push(`<span class="badge status-parent">${t("livestock.badgeParent")}</span>`);

      // Create health bar
      const healthClass = this.getHealthClass(animal.health);
      const healthBar = `
                  <div style="display: flex; align-items: center;">
                      <div class="health-bar">
                          <div class="health-fill ${healthClass}" style="width: ${
        animal.health
      }%"></div>
                      </div>
                      <span>${Math.round(animal.health)}%</span>
                  </div>
              `;

      return [
        `<code class="text-muted">${animal.id}</code>`,
        this.formatAnimalType(animal.subType),
        fmtAgeMonthsStr(animal.age),
        formatGenderLabel(animal.gender),
        healthBar,
        fmtWeightKgStr(animal.weight, 1),
        `$${this.calculateAnimalValue(animal).value.toLocaleString()}`,
        statusBadges.join(" ") || "-",
        this.formatLocation(resolveAnimalLocationLabel(animal), resolveAnimalLocationType(animal)),
        `<button class="btn btn-sm btn-outline-success" onclick='dashboard.showAnimalDetails(${JSON.stringify(String(animal.id))})'>
                      <i class="bi bi-eye me-1"></i>${t("livestock.btnDetails")}
                  </button>`,
      ];
    });

    // Clear and reload the DataTable with filtered data
    this.dataTable.clear();
    this.dataTable.rows.add(tableData);
    this.dataTable.draw();
  }

  // Update visual feedback on summary cards
  this.updateSummaryCardStates(filterType);

  if (silentRefresh) return;

  const filterMessages = {
    all: t("livestock.filterStatusAll", { count: filteredAnimals.length }),
    lactating: t("livestock.filterStatusLactating", { count: filteredAnimals.length }),
    pregnant: t("livestock.filterStatusPregnant", { count: filteredAnimals.length }),
    health: t("livestock.filterStatusHealth"),
  };

  this.showInfoMessage(
    filterMessages[filterType] || t("livestock.filterStatusGeneric", { filter: filterType })
  );
}

export function updateSummaryCardStates(activeFilter) {
  // Remove active state from all cards
  document.querySelectorAll(".summary-card-clickable").forEach((card) => {
    card.classList.remove("summary-card-active");
  });

  // Add active state to the clicked card
  const activeCard = document.querySelector(
    `[data-filter="${activeFilter}"]`
  );
  if (activeCard) {
    activeCard.classList.add("summary-card-active");
  }
}

export function toggleFilters() {
  const panel = document.getElementById("filters-panel");
  const toggleBtn = document.getElementById("filter-toggle-btn");

  if (panel.classList.contains("d-none")) {
    panel.classList.remove("d-none");
    toggleBtn.innerHTML = `<i class="bi bi-chevron-up"></i> ${t("livestock.hideFilters")}`;
  } else {
    panel.classList.add("d-none");
    toggleBtn.innerHTML = `<i class="bi bi-chevron-down"></i> ${t("livestock.showFilters")}`;
  }
}

export function resetFilters() {
  // Clear all filter inputs
  document.getElementById("age-min").value = "";
  document.getElementById("age-max").value = "";
  document.getElementById("weight-min").value = "";
  document.getElementById("weight-max").value = "";
  document.getElementById("animal-type-filter").value = "";

  // Reset slider values to full range
  const sliderTypes = [
    "health",
    "metabolism",
    "fertility",
    "quality",
    "productivity",
  ];
  sliderTypes.forEach((type) => {
    const minSlider = document.getElementById(`${type}-min`);
    const maxSlider = document.getElementById(`${type}-max`);
    if (minSlider && maxSlider) {
      minSlider.value = 0;
      // Set max value based on slider type - genetics sliders go to 200, health to 100
      const maxValue = type === "health" ? 100 : 200;
      maxSlider.value = maxValue;
    }
  });

  // Update slider displays and fills
  this.updateSliderDisplays();

  // Reset active filters
  this.activeFilters = {};
  this.livestockFilterMode = "none";

  // Hide active filters display
  document.getElementById("active-filters").style.display = "none";

  // Apply filters (which will show all animals)
  this.applyFilters();

  this.showSuccessMessage(t("livestock.filtersCleared"));
}

export function applyFilters(isSliderChange = false) {
  // Collect filter values
  const filters = {
    ageMin: parseFloat(document.getElementById("age-min").value) || null,
    ageMax: parseFloat(document.getElementById("age-max").value) || null,
    weightMin:
      parseFloat(document.getElementById("weight-min").value) || null,
    weightMax:
      parseFloat(document.getElementById("weight-max").value) || null,
    healthMin: parseFloat(document.getElementById("health-min").value) || 0,
    healthMax: parseFloat(document.getElementById("health-max").value) || 100,
    metabolismMin:
      parseFloat(document.getElementById("metabolism-min").value) || 0,
    metabolismMax:
      parseFloat(document.getElementById("metabolism-max").value) || 200,
    fertilityMin:
      parseFloat(document.getElementById("fertility-min").value) || 0,
    fertilityMax:
      parseFloat(document.getElementById("fertility-max").value) || 200,
    qualityMin: parseFloat(document.getElementById("quality-min").value) || 0,
    qualityMax:
      parseFloat(document.getElementById("quality-max").value) || 200,
    productivityMin:
      parseFloat(document.getElementById("productivity-min").value) || 0,
    productivityMax:
      parseFloat(document.getElementById("productivity-max").value) || 200,
    animalType: document.getElementById("animal-type-filter").value || null,
  };

  // Store active filters for display
  this.activeFilters = filters;
  this.livestockFilterMode = "advanced";

  // Filter animals
  let filteredAnimals = [...this.animals];

  // Apply age filter
  if (filters.ageMin !== null) {
    filteredAnimals = filteredAnimals.filter(
      (animal) => animal.age >= filters.ageMin
    );
  }
  if (filters.ageMax !== null) {
    filteredAnimals = filteredAnimals.filter(
      (animal) => animal.age <= filters.ageMax
    );
  }

  // Apply weight filter
  if (filters.weightMin !== null) {
    filteredAnimals = filteredAnimals.filter(
      (animal) => animal.weight >= filters.weightMin
    );
  }
  if (filters.weightMax !== null) {
    filteredAnimals = filteredAnimals.filter(
      (animal) => animal.weight <= filters.weightMax
    );
  }

  // Apply animal type filter
  if (filters.animalType !== null) {
    filteredAnimals = filteredAnimals.filter((animal) => {
      // Extract animal type from subType (e.g., "COW_HEREFORD" -> "COW")
      const animalType = animal.subType ? animal.subType.split("_")[0] : "";
      return animalType === filters.animalType;
    });
  }

  // Apply genetics filters with range sliders
  filteredAnimals = filteredAnimals.filter((animal) => {
    const healthPercent = animal.health || 100;

    // Check health filter first (always available)
    if (
      healthPercent < filters.healthMin ||
      healthPercent > filters.healthMax
    ) {
      return false;
    }

    // If animal doesn't have genetics data, only apply health filter
    if (!animal.genetics) {
      return true; // Pass if health filter passed
    }

    // Convert genetics multipliers (0.0-2.0+) to percentage scale (0-200%) for filtering
    const metabolismPercent = animal.genetics.metabolism * 100;
    const fertilityPercent = animal.genetics.fertility * 100;
    const qualityPercent = animal.genetics.quality * 100;
    const productivityPercent = animal.genetics.productivity * 100;

    return (
      metabolismPercent >= filters.metabolismMin &&
      metabolismPercent <= filters.metabolismMax &&
      fertilityPercent >= filters.fertilityMin &&
      fertilityPercent <= filters.fertilityMax &&
      qualityPercent >= filters.qualityMin &&
      qualityPercent <= filters.qualityMax &&
      productivityPercent >= filters.productivityMin &&
      productivityPercent <= filters.productivityMax
    );
  });

  // Update table with filtered results
  this.updateTableWithFilteredAnimals(filteredAnimals);

  // Update active filters display
  this.updateActiveFiltersDisplay();

  // Show result message only if not from slider change
  if (!isSliderChange) {
    this.showInfoMessage(
      `Showing ${filteredAnimals.length} of ${this.animals.length} animals`
    );
  }
}

export function initializeSliders() {
  const sliderTypes = [
    "health",
    "metabolism",
    "fertility",
    "quality",
    "productivity",
  ];

  // Initialize debounce timer
  this.filterDebounceTimer = null;

  sliderTypes.forEach((type) => {
    const minSlider = document.getElementById(`${type}-min`);
    const maxSlider = document.getElementById(`${type}-max`);
    const fillElement = document.getElementById(`${type}-fill`);

    if (minSlider && maxSlider && fillElement) {
      // Set initial values
      minSlider.value = 0;
      // Set max value based on slider type - genetics sliders go to 200, health to 100
      const maxValue = type === "health" ? 100 : 200;
      maxSlider.value = maxValue;

      // Add event listeners
      minSlider.addEventListener("input", () =>
        this.handleSliderChange(type, "min")
      );
      maxSlider.addEventListener("input", () =>
        this.handleSliderChange(type, "max")
      );
    }
  });

  // Update initial displays and fill bars
  this.updateSliderDisplays();
}

export function handleSliderChange(type, position) {
  const minSlider = document.getElementById(`${type}-min`);
  const maxSlider = document.getElementById(`${type}-max`);
  const fillElement = document.getElementById(`${type}-fill`);

  if (minSlider && maxSlider && fillElement) {
    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    // Ensure min doesn't exceed max
    if (position === "min" && minVal > maxVal) {
      maxSlider.value = minVal;
      maxVal = minVal;
    }

    // Ensure max doesn't go below min
    if (position === "max" && maxVal < minVal) {
      minSlider.value = maxVal;
      minVal = maxVal;
    }

    // Update display and fill bar immediately
    this.updateSliderDisplay(type, minVal, maxVal);
    this.updateSliderFill(type, minVal, maxVal);

    // Debounce the filtering to prevent spam
    if (this.filterDebounceTimer) {
      clearTimeout(this.filterDebounceTimer);
    }

    this.filterDebounceTimer = setTimeout(() => {
      this.applyFilters(true); // Pass true to indicate slider change
    }, 300); // 300ms delay
  }
}

export function updateSliderDisplays() {
  const sliderTypes = [
    "health",
    "metabolism",
    "fertility",
    "quality",
    "productivity",
  ];

  sliderTypes.forEach((type) => {
    const minSlider = document.getElementById(`${type}-min`);
    const maxSlider = document.getElementById(`${type}-max`);

    if (minSlider && maxSlider) {
      const minVal = parseInt(minSlider.value);
      const maxVal = parseInt(maxSlider.value);
      this.updateSliderDisplay(type, minVal, maxVal);
      this.updateSliderFill(type, minVal, maxVal);
    }
  });
}

export function updateSliderDisplay(type, minVal, maxVal) {
  const minDisplay = document.getElementById(`${type}-min-value`);
  const maxDisplay = document.getElementById(`${type}-max-value`);

  if (minDisplay && maxDisplay) {
    minDisplay.textContent = `${minVal}%`;
    maxDisplay.textContent = `${maxVal}%`;
  }
}

export function updateSliderFill(type, minVal, maxVal) {
  const fillElement = document.getElementById(`${type}-fill`);

  if (fillElement) {
    // Get the maximum value for this slider type
    const maxSlider = document.getElementById(`${type}-max`);
    const sliderMax = maxSlider
      ? parseInt(maxSlider.getAttribute("max"))
      : 100;

    // Calculate percentages based on actual slider range
    const leftPercent = (minVal / sliderMax) * 100;
    const rightPercent = ((sliderMax - maxVal) / sliderMax) * 100;

    // Update the fill bar to show selected range
    fillElement.style.left = `${leftPercent}%`;
    fillElement.style.right = `${rightPercent}%`;

    // Add visual feedback for active ranges
    const isHealthSlider = type === "health";
    const maxValue = isHealthSlider ? 100 : 200;
    if (minVal > 0 || maxVal < maxValue) {
      fillElement.style.opacity = "1";
      fillElement.parentElement.classList.add("filter-active");
    } else {
      fillElement.style.opacity = "0.3";
      fillElement.parentElement.classList.remove("filter-active");
    }
  }
}

export function getPregnancyDetails(animal) {
  // Get gestation period based on animal type
  const gestationPeriods = {
    COW: 9, // 9 months
    PIG: 4, // 4 months
    SHEEP: 5, // 5 months
    GOAT: 5, // 5 months
    HORSE: 11, // 11 months
    CHICKEN: 1, // 1 month (21 days)
  };

  // Expected offspring counts based on animal type
  const expectedOffspring = {
    COW: 1,
    PIG: "8-12",
    SHEEP: "1-2",
    GOAT: "1-2",
    HORSE: 1,
    CHICKEN: "8-15",
  };

  const animalType = animal.type || animal.subType.split("_")[0];
  const gestationMonths = gestationPeriods[animalType] || 6; // Default 6 months if unknown
  const expectedCount = expectedOffspring[animalType] || "1-2";

  // Calculate estimated due date
  // Since we don't have conception date, we'll estimate based on reproduction percentage
  // Higher reproduction % might indicate later in pregnancy
  const reproductionPercent = animal.reproduction * 100;
  let pregnancyProgress = 0;

  // Estimate pregnancy progress (this is a rough approximation)
  if (reproductionPercent > 80) {
    pregnancyProgress = 0.8; // 80% through pregnancy
  } else if (reproductionPercent > 60) {
    pregnancyProgress = 0.6; // 60% through pregnancy
  } else if (reproductionPercent > 40) {
    pregnancyProgress = 0.4; // 40% through pregnancy
  } else {
    pregnancyProgress = 0.2; // Early pregnancy
  }

  const monthsRemaining = Math.max(
    0,
    Math.round(gestationMonths * (1 - pregnancyProgress))
  );

  let dueDateText = t("common.unknown");
  if (monthsRemaining === 0) {
    dueDateText = `<span class="text-warning"><i class="bi bi-exclamation-triangle me-1"></i>${t("livestock.pregnancyDueSoon")}</span>`;
  } else if (monthsRemaining === 1) {
    dueDateText = t("livestock.fmtApproxOneMonth", { n: monthsRemaining });
  } else {
    dueDateText = t("livestock.fmtApproxMonths", { n: monthsRemaining });
  }

  return `
          <tr><td><strong>${t("livestock.labelEstDueDate")}</strong></td><td>${dueDateText}</td></tr>
          <tr><td><strong>${t("livestock.labelExpectedCount")}</strong></td><td>${expectedCount}</td></tr>
          <tr><td><strong>${t("livestock.labelPregnancyProgress")}</strong></td><td>${(
            pregnancyProgress * 100
          ).toFixed(0)}%</td></tr>
      `;
}

export function updateTableWithFilteredAnimals(filteredAnimals) {
  if (!this.dataTable) return;

  // Prepare filtered data for DataTable
  const tableData = filteredAnimals.map((animal) => {
    // Create status badges
    const statusBadges = [];
    if (animal.health === 0)
      statusBadges.push(`<span class="badge bg-danger">${t("livestock.badgeError")}</span>`);
    if (animal.isPregnant)
      statusBadges.push(
        `<span class="badge status-pregnant">${t("livestock.badgePregnant")}</span>`
      );
    if (animal.isLactating)
      statusBadges.push(
        `<span class="badge status-lactating">${t("livestock.badgeLactating")}</span>`
      );
    if (animal.isParent)
      statusBadges.push(`<span class="badge status-parent">${t("livestock.badgeParent")}</span>`);

    // Create health bar
    const healthClass = this.getHealthClass(animal.health);
    const healthBar = `
              <div style="display: flex; align-items: center;">
                  <div class="health-bar">
                      <div class="health-fill ${healthClass}" style="width: ${
      animal.health
    }%"></div>
                  </div>
                  <span>${Math.round(animal.health)}%</span>
              </div>
          `;

    return [
      `<code class="text-muted">${animal.id}</code>`,
      this.formatAnimalType(animal.subType),
      fmtAgeMonthsStr(animal.age),
      formatGenderLabel(animal.gender),
      healthBar,
      fmtWeightKgStr(animal.weight, 1),
      `$${this.calculateAnimalValue(animal).value.toLocaleString()}`,
      statusBadges.join(" ") || "-",
      this.formatLocation(resolveAnimalLocationLabel(animal), resolveAnimalLocationType(animal)),
      `<button class="btn btn-sm btn-outline-success" onclick='dashboard.showAnimalDetails(${JSON.stringify(String(animal.id))})'>
                  <i class="bi bi-eye me-1"></i>${t("livestock.btnDetails")}
              </button>`,
    ];
  });

  // Clear and reload the DataTable with filtered data
  this.dataTable.clear();
  this.dataTable.rows.add(tableData);
  this.dataTable.draw();
}

export function updateActiveFiltersDisplay() {
  const activeFiltersDiv = document.getElementById("active-filters");
  const activeFiltersList = document.getElementById("active-filters-list");

  const filterDisplays = [];

  // Age filter
  if (
    this.activeFilters.ageMin !== null ||
    this.activeFilters.ageMax !== null
  ) {
    let ageText = "";
    if (
      this.activeFilters.ageMin !== null &&
      this.activeFilters.ageMax !== null
    ) {
      ageText = t("livestock.filterChipAgeBetween", {
        min: this.activeFilters.ageMin,
        max: this.activeFilters.ageMax,
      });
    } else if (this.activeFilters.ageMin !== null) {
      ageText = t("livestock.filterChipAgeMin", {
        min: this.activeFilters.ageMin,
      });
    } else {
      ageText = t("livestock.filterChipAgeMax", {
        max: this.activeFilters.ageMax,
      });
    }
    filterDisplays.push(
      `<span class="badge bg-farm-primary me-1">${ageText}</span>`
    );
  }

  // Weight filter
  if (
    this.activeFilters.weightMin !== null ||
    this.activeFilters.weightMax !== null
  ) {
    let weightText = "";
    if (
      this.activeFilters.weightMin !== null &&
      this.activeFilters.weightMax !== null
    ) {
      weightText = t("livestock.filterChipWeightBetween", {
        min: this.activeFilters.weightMin,
        max: this.activeFilters.weightMax,
      });
    } else if (this.activeFilters.weightMin !== null) {
      weightText = t("livestock.filterChipWeightMin", {
        min: this.activeFilters.weightMin,
      });
    } else {
      weightText = t("livestock.filterChipWeightMax", {
        max: this.activeFilters.weightMax,
      });
    }
    filterDisplays.push(
      `<span class="badge bg-farm-primary me-1">${weightText}</span>`
    );
  }

  // Animal type filter
  if (this.activeFilters.animalType !== null) {
    const typeKey = `livestock.animalType${this.activeFilters.animalType}`;
    const typeName =
      t(typeKey) !== typeKey
        ? t(typeKey)
        : this.activeFilters.animalType;
    filterDisplays.push(
      `<span class="badge bg-farm-secondary me-1">${t("livestock.filterChipType", { type: typeName })}</span>`
    );
  }

  // Genetics filters
  const geneticsFilters = [
    "health",
    "metabolism",
    "fertility",
    "quality",
    "productivity",
  ];
  const geneticsLabelKey = {
    health: "livestock.geneticsFilterHealth",
    metabolism: "livestock.geneticsFilterMetabolism",
    fertility: "livestock.geneticsFilterFertility",
    quality: "livestock.geneticsFilterQuality",
    productivity: "livestock.geneticsFilterProductivity",
  };
  geneticsFilters.forEach((filter) => {
    if (this.activeFilters[filter]) {
      const displayName = t(
        geneticsLabelKey[filter] || `livestock.geneticsFilter${filter}`
      );
      const rating = this.activeFilters[filter]
        .replace("-", " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      filterDisplays.push(
        `<span class="badge bg-farm-accent text-dark me-1">${displayName}: ${rating}</span>`
      );
    }
  });

  if (filterDisplays.length > 0) {
    activeFiltersList.innerHTML = filterDisplays.join("");
    activeFiltersDiv.style.display = "block";
  } else {
    activeFiltersDiv.style.display = "none";
  }
}

// Helper function to create clickable animal ID links
export function createClickableAnimalId(animalId) {
  return `<a href="#" class="animal-link text-farm-accent text-decoration-none" data-animal-id="${animalId}" onclick="window.dashboard.openAnimalDetailsFromId('${animalId}'); return false;">#${animalId}</a>`;
}

export function createClickableAnimalIds(animals) {
  return animals
    .slice(0, 3)
    .map((a) => this.createClickableAnimalId(a.id))
    .join(", ");
}

export function openAnimalDetailsFromId(animalIdOrObject) {
  // Handle both ID and full object
  const animalId =
    typeof animalIdOrObject === "object"
      ? animalIdOrObject.id
      : animalIdOrObject;

  // Convert animalId to number if it's a string, to handle both string and number IDs
  const searchId =
    typeof animalId === "string" ? parseInt(animalId) : animalId;
  const animal = this.animals.find(
    (a) => a.id === searchId || a.id === animalId
  );

  if (animal) {
    this.showAnimalDetails(animal.id); // Pass the ID, not the full object
  } else {
    console.warn("Animal not found for ID:", animalId);
    this.showAlert(t("livestock.toastAnimalNotFound", { id: animalId }), "warning");
  }
}

export function calculateAnimalValue(animal) {
  // Debug logging for specific animals

  // RealisticLivestock mod accurate base values by breed
  const baseValues = {
    // Cows (increased base values by ~300)
    COW_HOLSTEIN: 1100,
    COW_ANGUS: 1050,
    COW_SWISS_BROWN: 1100,
    COW_LIMOUSIN: 1080,
    COW_HEREFORD: 1020,
    COW_WATERBUFFALO: 1150,
    COW_AYRSHIRE: 1000,
    COW_BRAHMAN: 1080,
    COW_BROWN_SWISS: 1050,
    COW: 1050, // Default cow

    // Bulls (increased base values by ~300)
    BULL_HOLSTEIN: 1200,
    BULL_ANGUS: 1150,
    BULL_SWISS_BROWN: 1200,
    BULL_LIMOUSIN: 1170,
    BULL_HEREFORD: 1100,
    BULL_WATERBUFFALO: 1250,
    BULL: 1150, // Default bull

    // Sheep
    SHEEP_SUFFOLK: 1200,
    SHEEP_DORPER: 1100,
    SHEEP_ALPINE: 1300,
    SHEEP_LANDRACE: 600,
    SHEEP: 600, // Default sheep

    // Pigs
    PIG_LANDRACE: 1500,
    PIG_DUROC: 1400,
    PIG_PIETRAIN: 1100,
    PIG: 1000,

    // Chickens
    CHICKEN_BROWN: 25,
    CHICKEN_WHITE: 25,
    CHICKEN: 5,
    ROOSTER_BROWN: 30,
    ROOSTER_WHITE: 30,
    ROOSTER: 30,

    // Horses (mature prices, young horses are much cheaper)
    HORSE_QUARTER: 5000,
    HORSE_CLYDESDALE: 6000,
    HORSE_HAFLINGER: 4000,
    HORSE_AMERICAN_QUARTER: 5000,
    HORSE_SEAL_BROWN: 4500,
    HORSE: 5000,
  };

  // Target weights for RealisticLivestock weight factor calculation
  const targetWeights = {
    COW_HOLSTEIN: 650,
    COW_ANGUS: 600,
    COW_SWISS_BROWN: 620,
    COW_LIMOUSIN: 640,
    COW_HEREFORD: 580,
    COW_WATERBUFFALO: 700,
    BULL_HOLSTEIN: 950,
    BULL_ANGUS: 900,
    BULL_SWISS_BROWN: 920,
    BULL_LIMOUSIN: 940,
    BULL_HEREFORD: 880,
    BULL_WATERBUFFALO: 1000,
    SHEEP_SUFFOLK: 80,
    SHEEP_DORPER: 75,
    SHEEP_ALPINE: 85,
    SHEEP: 80,
    PIG_LANDRACE: 120,
    PIG_DUROC: 115,
    PIG: 120,
    CHICKEN_BROWN: 2.5,
    CHICKEN_WHITE: 2.5,
    CHICKEN: 2.5,
    ROOSTER_BROWN: 3.0,
    ROOSTER_WHITE: 3.0,
    ROOSTER: 3.0,
    HORSE_QUARTER: 500,
    HORSE_CLYDESDALE: 800,
    HORSE_HAFLINGER: 450,
    HORSE_SEAL_BROWN: 500,
    HORSE: 500,
  };

  const minWeights = {
    COW_HOLSTEIN: 40,
    COW_ANGUS: 35,
    COW_SWISS_BROWN: 38,
    COW_LIMOUSIN: 42,
    COW_HEREFORD: 32,
    COW_WATERBUFFALO: 45,
    BULL_HOLSTEIN: 42,
    BULL_ANGUS: 38,
    BULL_SWISS_BROWN: 40,
    BULL_LIMOUSIN: 45,
    BULL_HEREFORD: 35,
    BULL_WATERBUFFALO: 48,
    SHEEP_SUFFOLK: 3,
    SHEEP_DORPER: 2.8,
    SHEEP_ALPINE: 3.2,
    SHEEP: 3,
    PIG_LANDRACE: 1.5,
    PIG_DUROC: 1.4,
    PIG: 1.5,
    CHICKEN_BROWN: 0.1,
    CHICKEN_WHITE: 0.1,
    CHICKEN: 0.1,
    ROOSTER_BROWN: 0.12,
    ROOSTER_WHITE: 0.12,
    ROOSTER: 0.12,
    HORSE_QUARTER: 50,
    HORSE_CLYDESDALE: 80,
    HORSE_HAFLINGER: 45,
    HORSE_SEAL_BROWN: 50,
    HORSE: 50,
  };

  // Get values for this animal
  const subType = animal.subType || animal.type?.toUpperCase();
  const baseValue =
    baseValues[subType] ||
    baseValues[subType?.split("_")[0]] ||
    baseValues["COW"];
  const targetWeight =
    targetWeights[subType] || targetWeights[subType?.split("_")[0]] || 100;
  const minWeight =
    minWeights[subType] || minWeights[subType?.split("_")[0]] || 10;
  const reproductionMinAge = 12; // Most animals can reproduce at 12 months

  // Get age-based sell price (RealisticLivestock uses subType.sellPrice:get(age))
  const age = animal.age || 12;
  let sellPrice;

  // Create age-based pricing curves based on in-game data
  if (subType?.includes("COW")) {
    // Cow pricing: starts low, peaks around 24-36 months
    if (age <= 1) sellPrice = baseValue * 0.15;
    else if (age <= 6)
      sellPrice = baseValue * (0.15 + (age - 1) * 0.07); // 15% to 50%
    else if (age <= 12)
      sellPrice = baseValue * (0.5 + (age - 6) * 0.08); // 50% to 98%
    else if (age <= 36) sellPrice = baseValue * 1.0; // Peak value
    else if (age <= 120)
      sellPrice = baseValue * Math.max(0.6, 1.0 - ((age - 36) / 84) * 0.4);
    else sellPrice = baseValue * 0.4; // Old cows
  } else if (subType?.includes("BULL")) {
    // Bulls: similar to cows but higher peak
    if (age <= 1) sellPrice = baseValue * 0.2;
    else if (age <= 6) sellPrice = baseValue * (0.2 + (age - 1) * 0.08);
    else if (age <= 12) sellPrice = baseValue * (0.6 + (age - 6) * 0.07);
    else if (age <= 48) sellPrice = baseValue * 1.0;
    else if (age <= 120)
      sellPrice = baseValue * Math.max(0.5, 1.0 - ((age - 48) / 72) * 0.5);
    else sellPrice = baseValue * 0.3;
  } else if (subType?.includes("HORSE")) {
    // Horses: very low when young, peak much later
    if (age < 24) {
      sellPrice = baseValue * (0.2 + (age / 24) * 0.4); // 20-60% of base
    } else if (age < 60) {
      sellPrice = baseValue * (0.6 + ((age - 24) / 36) * 0.4); // 60-100%
    } else if (age > 240) {
      sellPrice = baseValue * Math.max(0.3, 1.0 - ((age - 240) / 120) * 0.7);
    } else {
      sellPrice = baseValue;
    }
  } else {
    // Default age curve for other animals
    if (age <= 6) sellPrice = baseValue * (0.3 + age * 0.1);
    else if (age <= 24) sellPrice = baseValue;
    else sellPrice = baseValue * Math.max(0.6, 1.0 - ((age - 24) / 96) * 0.4);
  }

  // Age factor for display
  let ageFactor = 1.0;
  if (age < reproductionMinAge) {
    ageFactor = 0.3 + (age / reproductionMinAge) * 0.7;
  } else if (age > 120) {
    ageFactor = Math.max(0.2, 1.0 - ((age - 120) / 120) * 0.8);
  }

  // Calculate weight factor (exact RealisticLivestock formula)
  let weightFactor = 1.0;
  const weight = parseFloat(animal.weight) || targetWeight;
  if (weight > 0) {
    const targetWeightForAge =
      ((targetWeight - minWeight) / (reproductionMinAge * 1.5)) *
      Math.min(age + 1.5, reproductionMinAge * 1.5) *
      0.85;
    weightFactor = 1 + (weight - targetWeightForAge) / targetWeightForAge;
  }

  // Health factor (RealisticLivestock: health/100)
  const healthFactor = (animal.health || 0) / 100;

  // Meat/Quality factor (RealisticLivestock uses genetics.quality)
  const meatFactor = animal.genetics?.quality || 1.0;

  // Apply RealisticLivestock formula adjustments (exact from Lua code)
  sellPrice = sellPrice + sellPrice * 0.25 * (meatFactor - 1);
  sellPrice =
    sellPrice +
    ((sellPrice * 0.6) / targetWeight) * weight * (-1 + meatFactor);

  // Add pregnancy and lactation bonuses to sellPrice (not final value)
  if (animal.isPregnant) {
    sellPrice = sellPrice + sellPrice * 0.25;
  }
  if (animal.isLactating) {
    sellPrice = sellPrice + sellPrice * 0.15;
  }

  // Final calculation based on animal type (exact RealisticLivestock formula)
  let finalValue;
  if (subType?.includes("HORSE")) {
    // Horses use fitness and riding factors from animal data
    const fitnessFactor = (animal.fitness || 0) / 100;
    const ridingFactor = (animal.riding || 0) / 100;
    const dirtFactor = (animal.dirt || 0) / 100;

    finalValue = Math.max(
      sellPrice *
        meatFactor *
        weightFactor *
        (0.3 +
          0.5 * healthFactor +
          0.3 * ridingFactor +
          0.2 * fitnessFactor -
          0.2 * dirtFactor),
      sellPrice * 0.05
    );
  } else {
    // Standard livestock formula (exact from RealisticLivestock line 2682)

    finalValue = Math.max(
      sellPrice * 0.6 +
        sellPrice * 0.4 * weightFactor * (0.75 * healthFactor),
      sellPrice * 0.05
    );
  }

  // Calculate genetics factor for display (weighted average)
  let geneticsFactor = 1.0;
  if (animal.genetics) {
    geneticsFactor =
      animal.genetics.productivity * 0.4 +
      animal.genetics.quality * 0.3 +
      animal.genetics.health * 0.15 +
      animal.genetics.fertility * 0.1 +
      animal.genetics.metabolism * 0.05;
  }

  // Reproduction factor for display
  let reproductionFactor = 1.0;
  if (animal.isPregnant) reproductionFactor += 0.25;
  if (animal.isLactating) reproductionFactor += 0.15;

  // Debug for any animal to understand genetics ratings
  if (animal.name === "Charlie" || true) {
    // Enable for all animals temporarily
    const avgGenetics = animal.genetics
      ? (animal.genetics.metabolism +
          animal.genetics.quality +
          animal.genetics.health +
          animal.genetics.fertility +
          animal.genetics.productivity) /
        5
      : 1.0;

    let geneticsRating = "Unknown";
    if (avgGenetics < 0.4) geneticsRating = "Very Bad";
    else if (avgGenetics < 0.7) geneticsRating = "Bad";
    else if (avgGenetics < 1.0) geneticsRating = "Average";
    else if (avgGenetics < 1.3) geneticsRating = "Good";
    else if (avgGenetics < 1.6) geneticsRating = "Very Good";
    else geneticsRating = "Excellent";

    const calculatedValue = Math.round(
      Math.max(finalValue, baseValue * 0.05)
    );
  }

  return {
    value: Math.round(Math.max(finalValue, baseValue * 0.05)),
    breakdown: {
      baseValue,
      ageFactor,
      healthFactor,
      geneticsFactor,
      reproductionFactor,
      weightFactor,
      animalType: subType,
    },
  };
}

export function calculateTotalPastureValue(animals) {
  let totalValue = 0;
  const breakdown = {};

  animals.forEach((animal) => {
    const animalValue = this.calculateAnimalValue(animal);
    totalValue += animalValue.value;

    const type = animalValue.breakdown.animalType;
    if (!breakdown[type]) {
      breakdown[type] = { count: 0, totalValue: 0 };
    }
    breakdown[type].count++;
    breakdown[type].totalValue += animalValue.value;
  });

  return {
    total: totalValue,
    breakdown,
    average: animals.length > 0 ? Math.round(totalValue / animals.length) : 0,
  };
}

export function generateAnimalValueDisplay(animal) {
  const valueInfo = this.calculateAnimalValue(animal);
  const breakdown = valueInfo.breakdown;

  return `
          <div class="row">
              <div class="col-md-4">
                  <div class="text-center">
                      <h4 class="text-success mb-2">$${valueInfo.value.toLocaleString()}</h4>
                      <small class="text-muted">${t("livestock.valueEstimatedTitle")}<br>${t("livestock.valueDisclaimer")}</small>
                  </div>
              </div>
              <div class="col-md-8">
                  <h6 class="text-info mb-3">${t("livestock.valueBreakdownTitle")}</h6>
                  <table class="table table-sm table-borderless table-dark text-light">
                      <tr>
                          <td><strong>${t("livestock.valueBaseValue", {
                            type: breakdown.animalType,
                          })}</strong></td>
                          <td class="text-end">$${breakdown.baseValue.toLocaleString()}</td>
                      </tr>
                      <tr>
                          <td><strong>${t("livestock.valueAgeFactor")}</strong></td>
                          <td class="text-end">${(
                            breakdown.ageFactor * 100
                          ).toFixed(0)}% (${this.getAgeDescription(
    animal.age
  )})</td>
                      </tr>
                      <tr>
                          <td><strong>${t("livestock.valueHealthFactor")}</strong></td>
                          <td class="text-end">${(
                            breakdown.healthFactor * 100
                          ).toFixed(0)}% (${t("livestock.valueHealthPct", {
    pct: Math.round(animal.health),
  })})</td>
                      </tr>
                      <tr>
                          <td><strong>${t("livestock.valueGeneticsFactor")}</strong></td>
                          <td class="text-end">${breakdown.geneticsFactor.toFixed(
                            2
                          )}x (${this.getGeneticsDescription(
    animal.genetics
  )})</td>
                      </tr>
                      <tr>
                          <td><strong>${t("livestock.valueReproductionFactor")}</strong></td>
                          <td class="text-end">${(
                            breakdown.reproductionFactor * 100
                          ).toFixed(0)}% (${this.getReproductionDescription(
    animal
  )})</td>
                      </tr>
                      ${
                        breakdown.weightFactor !== 1.0
                          ? `
                      <tr>
                          <td><strong>${t("livestock.valueWeightFactor")}</strong></td>
                          <td class="text-end">${(
                            breakdown.weightFactor * 100
                          ).toFixed(0)}% (${fmtWeightKgStr(
                              animal.weight || 0,
                              2
                            )})</td>
                      </tr>
                      `
                          : ""
                      }
                  </table>
                  <hr class="my-2">
                  <div class="d-flex justify-content-between">
                      <strong>${t("livestock.valueEstimatedFinal")}</strong>
                      <strong class="text-success">$${valueInfo.value.toLocaleString()}</strong>
                  </div>
              </div>
          </div>
      `;
}

export function getAgeDescription(age) {
  if (age < 6) return t("livestock.ageDescVeryYoung");
  if (age < 12) return t("livestock.ageDescYoung");
  if (age < 120) return t("livestock.ageDescMature");
  return t("livestock.ageDescOld");
}

export function getGeneticsDescription(genetics) {
  if (!genetics) return t("livestock.geneticsDescUnknown");
  const avg =
    (genetics.health +
      genetics.metabolism +
      genetics.fertility +
      genetics.quality +
      genetics.productivity) /
    5;
  if (avg > 1.8) return t("livestock.geneticsDescExcellent");
  if (avg > 1.6) return t("livestock.geneticsDescGood");
  if (avg > 1.4) return t("livestock.geneticsDescAverage");
  if (avg > 1.2) return t("livestock.geneticsDescBelowAverage");
  return t("livestock.geneticsDescPoor");
}

export function getReproductionDescription(animal) {
  const descriptions = [];
  if (animal.isPregnant === "true" || animal.isPregnant === true) {
    descriptions.push(t("livestock.reproDescPregnant"));
  }
  if (animal.isParent === "true" || animal.isParent === true) {
    descriptions.push(t("livestock.reproDescBreedingStock"));
  }
  if (animal.isLactating === "true" || animal.isLactating === true) {
    descriptions.push(t("livestock.reproDescLactating"));
  }
  return descriptions.length > 0
    ? descriptions.join(", ")
    : t("livestock.reproDescStandard");
}