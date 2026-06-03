const SHEET_URL_KEY = "multilixo-painel-preventivas-csv-url";

let sheetUrl = localStorage.getItem(SHEET_URL_KEY) || "";
let rawRows = [];
let visibleRows = [];
let searchTerm = "";
let statusFilter = "all";
let periodStart = "";
let periodEnd = "";

const sheetUrlInput = document.querySelector("#sheetUrlInput");
const sheetStatus = document.querySelector("#sheetStatus");
const tableHead = document.querySelector("#preventiveTableHead");
const tableBody = document.querySelector("#preventiveTableBody");
const emptyState = document.querySelector("#preventiveEmptyState");

sheetUrlInput.value = sheetUrl;

document.querySelector("#saveSheetUrl").addEventListener("click", () => {
  sheetUrl = sheetUrlInput.value.trim();
  localStorage.setItem(SHEET_URL_KEY, sheetUrl);
  loadSheetData();
});

document.querySelector("#refreshPreventivePanel").addEventListener("click", loadSheetData);
document.querySelector("#exportPreventivePanel").addEventListener("click", exportVisibleRows);

document.querySelector("#preventiveSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#preventiveStart").addEventListener("change", (event) => {
  periodStart = event.target.value;
  render();
});

document.querySelector("#preventiveEnd").addEventListener("change", (event) => {
  periodEnd = event.target.value;
  render();
});

document.querySelector("#preventiveStatusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  render();
});

async function loadSheetData() {
  if (!sheetUrl) {
    rawRows = [];
    setStatus("Aguardando link CSV do Google Sheets.");
    render();
    return;
  }

  setStatus("Carregando dados da planilha...");

  try {
    const response = await fetch(cacheBustedUrl(sheetUrl));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    rawRows = parseCsv(csv);
    setStatus(`${rawRows.length} registro${rawRows.length === 1 ? "" : "s"} carregado${rawRows.length === 1 ? "" : "s"}.`);
    updateStatusOptions();
    render();
  } catch (error) {
    rawRows = [];
    setStatus("Não foi possível carregar a planilha. Verifique se o link CSV está publicado.");
    render();
  }
}

function render() {
  visibleRows = filteredRows();
  renderStats();
  renderStatusBars();
  renderRanking();
  renderTable();
}

function filteredRows() {
  return rawRows.filter((row) => {
    const rowText = Object.values(row).join(" ").toLowerCase();
    const rowStatus = normalizedStatus(row);
    return (
      (!searchTerm || rowText.includes(searchTerm)) &&
      (statusFilter === "all" || rowStatus === statusFilter) &&
      matchesPeriod(row)
    );
  });
}

function renderStats() {
  const done = visibleRows.filter((row) => isDoneStatus(normalizedStatus(row))).length;
  const open = visibleRows.length - done;
  const maxDays = visibleRows.reduce((max, row) => Math.max(max, extractDays(row)), 0);

  document.querySelector("#preventiveTotal").textContent = visibleRows.length;
  document.querySelector("#preventiveOpen").textContent = open;
  document.querySelector("#preventiveDone").textContent = done;
  document.querySelector("#preventiveCritical").textContent = maxDays;
}

function renderStatusBars() {
  const container = document.querySelector("#preventiveStatusBars");
  const totals = visibleRows.reduce((acc, row) => {
    const status = normalizedStatus(row) || "Sem status";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(...Object.values(totals), 1);

  container.innerHTML = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([status, value]) => `
      <div class="bar-item">
        <div class="bar-meta">
          <strong>${escapeHtml(status)}</strong>
          <span>${value}</span>
        </div>
        <div class="bar-track"><span style="width:${(value / max) * 100}%"></span></div>
      </div>
    `)
    .join("") || `<p class="muted-message">Nenhum dado para análise.</p>`;
}

function renderRanking() {
  const container = document.querySelector("#preventiveRanking");
  const rows = [...visibleRows]
    .map((row) => ({ row, days: extractDays(row) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 6);

  container.innerHTML = rows
    .map((item, index) => `
      <div class="ranking-item">
        <strong>${index + 1}</strong>
        <div>
          <span>${escapeHtml(primaryLabel(item.row))}</span>
          <small>${item.days} dia${item.days === 1 ? "" : "s"} · ${escapeHtml(normalizedStatus(item.row) || "Sem status")}</small>
        </div>
      </div>
    `)
    .join("") || `<p class="muted-message">Nenhum dado para ranking.</p>`;
}

function renderTable() {
  const headers = tableHeaders();
  emptyState.hidden = visibleRows.length > 0;

  tableHead.innerHTML = headers.length
    ? `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`
    : "";

  tableBody.innerHTML = visibleRows
    .map((row) => `
      <tr>
        ${headers.map((header) => `<td data-label="${escapeHtml(header)}">${escapeHtml(row[header] || "-")}</td>`).join("")}
      </tr>
    `)
    .join("");
}

function updateStatusOptions() {
  const select = document.querySelector("#preventiveStatusFilter");
  const statuses = [...new Set(rawRows.map(normalizedStatus).filter(Boolean))].sort();
  select.innerHTML = `<option value="all">Todos os status</option>${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}`;
}

function matchesPeriod(row) {
  if (!periodStart && !periodEnd) return true;
  const date = extractDate(row);
  if (!date) return true;
  if (periodStart && date < toDate(periodStart)) return false;
  if (periodEnd && date > toDate(periodEnd)) return false;
  return true;
}

function tableHeaders() {
  return rawRows[0] ? Object.keys(rawRows[0]) : [];
}

function normalizedStatus(row) {
  const key = findKey(row, ["status", "situação", "situacao", "etapa"]);
  return key ? String(row[key] || "").trim() : "";
}

function primaryLabel(row) {
  const key = findKey(row, ["equipamento", "placa", "frota", "os", "ordem"]);
  return key ? row[key] : Object.values(row)[0] || "Registro";
}

function extractDays(row) {
  const key = findKey(row, ["lead time", "dias", "prazo", "atraso", "total"]);
  if (!key) return 0;
  const value = String(row[key] || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return value ? Math.round(Number(value[0])) : 0;
}

function extractDate(row) {
  const key = findKey(row, ["data", "solicitação", "solicitacao", "execução", "execucao", "preventiva"]);
  return key ? parseDate(row[key]) : null;
}

function findKey(row, candidates) {
  const keys = Object.keys(row);
  return keys.find((key) => candidates.some((candidate) => normalize(key).includes(normalize(candidate))));
}

function parseCsv(text) {
  const rows = [];
  let current = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === `"` && next === `"`) {
      cell += `"`;
      index += 1;
    } else if (char === `"`) {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      current.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      current.push(cell);
      rows.push(current);
      current = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || current.length) {
    current.push(cell);
    rows.push(current);
  }

  const [headers = [], ...body] = rows.filter((row) => row.some((value) => String(value).trim()));
  const normalizedHeaders = headers.map((header, index) => header.trim() || `Coluna ${index + 1}`);
  return body.map((row) => normalizedHeaders.reduce((acc, header, index) => {
    acc[header] = String(row[index] || "").trim();
    return acc;
  }, {}));
}

function exportVisibleRows() {
  const headers = tableHeaders();
  if (!headers.length) return;
  const lines = [headers, ...visibleRows.map((row) => headers.map((header) => row[header] || ""))];
  const csv = lines.map((line) => line.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `painel-geral-preventivas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setStatus(text) {
  sheetStatus.textContent = text;
}

function cacheBustedUrl(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return toDate(text.slice(0, 10));
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  return new Date(year, Number(match[2]) - 1, Number(match[1]));
}

function toDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isDoneStatus(status) {
  const text = normalize(status);
  return text.includes("conclu") || text.includes("execut") || text.includes("finaliz");
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

loadSheetData();
