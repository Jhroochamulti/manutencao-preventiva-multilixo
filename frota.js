const FLEET_STORAGE_KEY = "multilixo-fleet-dev";

let fleetRecords = loadFleet();
let importPreview = null;
let searchTerm = "";
let categoryFilter = "all";
let statusFilter = "active";

const fileInput = document.querySelector("#fleetFileInput");
const previewButton = document.querySelector("#previewImportButton");
const confirmButton = document.querySelector("#confirmImportButton");
const syncSummary = document.querySelector("#syncSummary");
const tableBody = document.querySelector("#fleetTableBody");
const tableWrap = document.querySelector(".fleet-list-panel .table-wrap");
const rowTemplate = document.querySelector("#fleetRowTemplate");

document.querySelector("#fleetSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#fleetCategoryFilter").addEventListener("change", (event) => {
  categoryFilter = event.target.value;
  render();
});

document.querySelector("#fleetStatusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  render();
});

previewButton.addEventListener("click", async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    alert("Selecione o arquivo do inventario para analisar.");
    return;
  }

  try {
    const imported = await readInventoryFile(file);
    importPreview = compareFleet(imported, fleetRecords);
    renderImportPreview(importPreview);
  } catch (error) {
    alert(`Nao foi possivel ler o arquivo: ${error.message}`);
  }
});

confirmButton.addEventListener("click", () => {
  if (!importPreview) return;

  fleetRecords = applyFleetImport(importPreview);
  persistFleet();
  importPreview = null;
  confirmButton.disabled = true;
  render();
});

function loadFleet() {
  try {
    const saved = localStorage.getItem(FLEET_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.warn("Base local de frota invalida.", error);
    return [];
  }
}

function persistFleet() {
  localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(fleetRecords));
}

async function readInventoryFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "csv") {
    const text = await file.text();
    return parseCsvInventory(text);
  }

  if (!window.XLSX) {
    throw new Error("Biblioteca de Excel nao carregada. Verifique a conexao com a internet.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

  return normalizeInventoryRows(rows);
}

function parseCsvInventory(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];

  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], separator);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line, separator);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });

  return normalizeInventoryRows(rows);
}

function splitCsvLine(line, separator) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (const char of line) {
    if (char === "\"") {
      insideQuotes = !insideQuotes;
    } else if (char === separator && !insideQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, ""));
}

function normalizeInventoryRows(rows) {
  const normalized = rows
    .map((row) => {
      const record = {
        mechanicalClass: pickValue(row, ["Classe Mecânica", "Classe Mecanica", "classe_mecanica"]),
        equipment: pickValue(row, ["Equipamento", "equipment"]),
        plate: normalizePlate(pickValue(row, ["Placa", "plate"])),
        yearModel: pickValue(row, ["Ano Modelo", "Ano", "yearModel"]),
        operationalClass: pickValue(row, ["Classe Operacional", "classe_operacional"]),
        manufacturer: pickValue(row, ["Fabricante", "manufacturer"]),
        model: pickValue(row, ["Modelo", "model"]),
        branch: pickValue(row, ["Filial", "branch"])
      };

      return {
        ...record,
        id: normalizeId(record.equipment),
        category: categorize(record.mechanicalClass),
        active: true,
        source: "inventory",
        updatedAt: new Date().toISOString()
      };
    })
    .filter((record) => record.id);

  const unique = new Map();
  normalized.forEach((record) => unique.set(record.id, record));

  return Array.from(unique.values());
}

function pickValue(row, names) {
  const normalizedRow = Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});

  for (const name of names) {
    const value = normalizedRow[normalizeHeader(name)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeId(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-");
}

function normalizePlate(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function categorize(mechanicalClass) {
  const text = normalizeHeader(mechanicalClass);
  if (text.includes("caminh")) return "caminhao";
  if (text.includes("maquina")) return "maquina";
  if (text.includes("utilitario") || text.includes("vuc")) return "utilitario";
  if (text.includes("gerador")) return "gerador";
  return "outro";
}

function compareFleet(imported, current) {
  const currentById = new Map(current.map((record) => [record.id, record]));
  const importedById = new Map(imported.map((record) => [record.id, record]));
  const created = [];
  const changed = [];
  const same = [];
  const inactive = [];

  imported.forEach((record) => {
    const existing = currentById.get(record.id);
    if (!existing) {
      created.push(record);
      return;
    }

    if (hasFleetChanges(existing, record)) {
      changed.push({ before: existing, after: { ...existing, ...record, active: true } });
      return;
    }

    same.push({ ...existing, active: true });
  });

  current.forEach((record) => {
    if (!importedById.has(record.id) && record.active !== false) {
      inactive.push({ ...record, active: false, updatedAt: new Date().toISOString() });
    }
  });

  return { created, changed, same, inactive, importedTotal: imported.length };
}

function hasFleetChanges(before, after) {
  return [
    "mechanicalClass",
    "equipment",
    "plate",
    "yearModel",
    "operationalClass",
    "manufacturer",
    "model",
    "branch",
    "category"
  ].some((key) => String(before[key] || "") !== String(after[key] || ""));
}

function applyFleetImport(preview) {
  const nextById = new Map(fleetRecords.map((record) => [record.id, record]));

  preview.created.forEach((record) => nextById.set(record.id, record));
  preview.changed.forEach((item) => nextById.set(item.after.id, item.after));
  preview.same.forEach((record) => nextById.set(record.id, record));
  preview.inactive.forEach((record) => nextById.set(record.id, record));

  return Array.from(nextById.values()).sort((a, b) => naturalSort(a.equipment, b.equipment));
}

function renderImportPreview(preview) {
  syncSummary.hidden = false;
  document.querySelector("#newCount").textContent = preview.created.length;
  document.querySelector("#changedCount").textContent = preview.changed.length;
  document.querySelector("#inactiveCount").textContent = preview.inactive.length;
  document.querySelector("#sameCount").textContent = preview.same.length;
  confirmButton.disabled = false;
}

function filteredFleet() {
  return fleetRecords.filter((record) => {
    const status = record.active === false ? "inactive" : "active";
    const haystack = [
      record.equipment,
      record.plate,
      record.mechanicalClass,
      record.operationalClass,
      record.manufacturer,
      record.model,
      record.branch
    ].join(" ").toLowerCase();

    return (
      (!searchTerm || haystack.includes(searchTerm)) &&
      (categoryFilter === "all" || record.category === categoryFilter) &&
      (statusFilter === "all" || status === statusFilter)
    );
  });
}

function render() {
  renderMetrics();
  renderTable(filteredFleet());
}

function renderMetrics() {
  const active = fleetRecords.filter((record) => record.active !== false);
  const counts = active.reduce(
    (acc, record) => {
      acc[record.category] = (acc[record.category] || 0) + 1;
      return acc;
    },
    {}
  );

  document.querySelector("#fleetTotal").textContent = active.length;
  document.querySelector("#fleetTrucks").textContent = counts.caminhao || 0;
  document.querySelector("#fleetMachines").textContent = counts.maquina || 0;
  document.querySelector("#fleetOthers").textContent =
    (counts.utilitario || 0) + (counts.gerador || 0) + (counts.outro || 0);
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  tableWrap.classList.toggle("is-empty", rows.length === 0);

  rows.forEach((record) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const cells = row.querySelectorAll("td");
    cells[0].innerHTML = `<strong>${escapeHtml(record.equipment)}</strong>`;
    cells[1].textContent = record.plate || "-";
    cells[2].innerHTML = categoryPill(record.category);
    cells[3].textContent = record.operationalClass || "-";
    cells[4].innerHTML = `<strong>${escapeHtml(record.manufacturer || "-")}</strong><span class="subtle">${escapeHtml(record.model || "-")}</span>`;
    cells[5].textContent = record.yearModel || "-";
    cells[6].textContent = record.branch || "-";
    cells[7].innerHTML = record.active === false ? `<span class="status-pill danger">Inativo</span>` : `<span class="status-pill success">Ativo</span>`;
    tableBody.appendChild(row);
  });
}

function categoryPill(category) {
  const labels = {
    caminhao: "Caminhao",
    maquina: "Maquina",
    utilitario: "Utilitario",
    gerador: "Gerador",
    outro: "Outro"
  };

  return `<span class="status-pill ${category}">${labels[category] || "Outro"}</span>`;
}

function naturalSort(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.MULTILIXO_FLEET_DEV = {
  normalizeInventoryRows,
  compareFleet,
  applyPreview(preview) {
    fleetRecords = applyFleetImport(preview);
    persistFleet();
    render();
    return fleetRecords;
  },
  clearLocalFleet() {
    fleetRecords = [];
    persistFleet();
    render();
  }
};

render();
