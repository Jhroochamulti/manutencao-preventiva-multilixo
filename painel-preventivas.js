const SHEET_URL_KEY = "multilixo-painel-preventivas-csv-url";
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGJVksDnMpL3Gb0NJ6WGyFerN3RYvGSnll8J8HGVEyoIT5nqsOjLJ8hTiLogwI2cWfT6vmfi8ZZP0W/pub?output=csv";

let sheetUrl = localStorage.getItem(SHEET_URL_KEY) || DEFAULT_SHEET_URL;
let rawRows = [];
let visibleRows = [];
let sheetSummary = {};
let searchTerm = "";
let statusFilter = "all";
let branchFilter = "all";

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

document.querySelector("#preventiveBranchFilter").addEventListener("change", (event) => {
  branchFilter = event.target.value;
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
    const parsedRows = parseCsv(csv);
    sheetSummary = extractSheetSummary(parsedRows);
    rawRows = parsedRows.filter(isPreventiveRow);
    setStatus(statusMessage());
    updateStatusOptions();
    updateBranchOptions();
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
  renderComplianceLine();
  renderBranchBars();
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
      (branchFilter === "all" || normalizedBranch(row) === branchFilter)
    );
  });
}

function renderStats() {
  const metrics = currentMetrics();
  const dueSoon = visibleRows.filter(isDueSoon).length;
  const maxDays = visibleRows.reduce((max, row) => Math.max(max, overdueDays(row)), 0);
  const adherence = visibleRows.filter(isAdherent).length;

  document.querySelector("#preventiveTotal").textContent = metrics.total;
  document.querySelector("#preventiveOnTime").textContent = metrics.onTime;
  document.querySelector("#preventiveOverdue").textContent = metrics.overdue;
  document.querySelector("#preventiveDueSoon").textContent = dueSoon;
  document.querySelector("#preventiveCritical").textContent = `${formatNumber(maxDays)}d`;
  document.querySelector("#preventiveCompliance").textContent = adherence;
}

function renderComplianceLine() {
  const metrics = currentMetrics();
  const total = metrics.total || 1;
  const adherence = visibleRows.filter(isAdherent).length;
  const onTime = metrics.onTime;
  const overdue = metrics.overdue;
  const onTimePercent = metrics.total ? (onTime / metrics.total) * 100 : 0;
  const adherencePercent = metrics.total ? (adherence / metrics.total) * 100 : 0;
  const overduePercent = metrics.total ? (overdue / metrics.total) * 100 : 0;

  updateLineSegment("#onTimeSegment", "#onTimePercent", onTime, onTimePercent, "Em dia");
  updateLineSegment("#adherenceSegment", "#adherencePercent", adherence, adherencePercent, "Em aderência");
  updateLineSegment("#overdueSegment", "#overduePercent", overdue, overduePercent, "Vencidas");
  document.querySelector("#adherenceLabel").textContent = `${formatNumber(adherencePercent)}%`;
}

function updateLineSegment(segmentSelector, labelSelector, quantity, percent, label) {
  const segment = document.querySelector(segmentSelector);
  const percentLabel = document.querySelector(labelSelector);
  if (!segment || !percentLabel) return;

  segment.style.width = `${percent}%`;
  segment.title = `${label}: ${quantity} equipamento${quantity === 1 ? "" : "s"}`;
  segment.setAttribute("aria-label", segment.title);
  percentLabel.textContent = percent > 0 ? `${formatNumber(percent)}%` : "";
}

function currentMetrics() {
  const useSourceSummary = !searchTerm && statusFilter === "all" && branchFilter === "all" && sheetSummary.total;
  const overdue = useSourceSummary ? sheetSummary.overdue : visibleRows.filter(isOverdue).length;
  const onTime = useSourceSummary ? sheetSummary.onTime : visibleRows.length - overdue;
  const total = useSourceSummary ? sheetSummary.total : visibleRows.length;
  const compliance = total ? (onTime / total) * 100 : 0;

  return { total, onTime, overdue, compliance };
}

function renderBranchBars() {
  const container = document.querySelector("#preventiveBranchBars");
  const totals = visibleRows.reduce((acc, row) => {
    const branch = normalizedBranch(row) || "Sem filial";
    const current = acc[branch] || { total: 0, risk: 0 };
    current.total += 1;
    if (isOverdue(row) || isDueSoon(row)) current.risk += 1;
    acc[branch] = current;
    return acc;
  }, {});
  const max = Math.max(...Object.values(totals).map((item) => item.risk), 1);

  container.innerHTML = Object.entries(totals)
    .sort((a, b) => b[1].risk - a[1].risk)
    .slice(0, 8)
    .map(([branch, value]) => `
      <div class="bar-item">
        <div class="bar-meta">
          <strong>${escapeHtml(branch)}</strong>
          <span>${value.risk} em atenção · ${value.total} total</span>
        </div>
        <div class="bar-track"><span style="width:${(value.risk / max) * 100}%"></span></div>
      </div>
    `)
    .join("") || `<p class="muted-message">Nenhum dado para análise.</p>`;
}

function renderRanking() {
  const container = document.querySelector("#preventiveRanking");
  const rows = [...visibleRows]
    .map((row) => ({ row, days: overdueDays(row) }))
    .filter((item) => item.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 6);

  container.innerHTML = rows
    .map((item, index) => `
      <div class="ranking-item">
        <strong>${index + 1}</strong>
        <div>
          <span>${escapeHtml(primaryLabel(item.row))}</span>
          <small>${formatNumber(item.days)} dia${item.days === 1 ? "" : "s"} vencida · ${escapeHtml(normalizedBranch(item.row) || "Sem filial")}</small>
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

function updateBranchOptions() {
  const select = document.querySelector("#preventiveBranchFilter");
  const branches = [...new Set(rawRows.map(normalizedBranch).filter(Boolean))].sort();
  select.innerHTML = `<option value="all">Todas as filiais</option>${branches.map((branch) => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join("")}`;
}

function tableHeaders() {
  return rawRows[0] ? Object.keys(rawRows[0]) : [];
}

function normalizedStatus(row) {
  return isOverdue(row) ? "Vencida" : "Em dia";
}

function normalizedBranch(row) {
  const key = findKey(row, ["filial"]);
  return key ? String(row[key] || "").trim() : "";
}

function primaryLabel(row) {
  const key = findKey(row, ["equipamento", "placa", "frota", "os", "ordem"]);
  return key ? row[key] : Object.values(row)[0] || "Registro";
}

function extractDays(row) {
  return isOverdue(row) ? overdueDays(row) : dueInDays(row);
}

function overdueDays(row) {
  const key = findKey(row, ["vencida"]);
  return key ? numberValue(row[key]) : 0;
}

function dueInDays(row) {
  const key = findKey(row, ["vence em"]);
  return key ? numberValue(row[key]) : 0;
}

function isOverdue(row) {
  return overdueDays(row) > 0;
}

function isDueSoon(row) {
  const due = dueInDays(row);
  return !isOverdue(row) && due > 0 && due <= 30;
}

function isAdherent(row) {
  const key = findKey(row, ["desvio"]);
  return key ? Math.abs(numberValue(row[key])) <= 50 : false;
}

function isPreventiveRow(row) {
  const plate = findKey(row, ["placa"]);
  return Boolean(plate && String(row[plate]).trim());
}

function extractSheetSummary(rows) {
  return rows.reduce((acc, row) => {
    const labelKey = findKey(row, ["equipamento"]);
    const valueKey = findKey(row, ["modelo"]);
    if (!labelKey || !valueKey) return acc;

    const label = normalize(row[labelKey]);
    const value = numberValue(row[valueKey]);
    if (label.includes("frota op")) acc.total = value;
    if (label.includes("em dia")) acc.onTime = value;
    if (label.includes("vencidas")) acc.overdue = value;
    return acc;
  }, {});
}

function statusMessage() {
  const detailed = `${rawRows.length} equipamento${rawRows.length === 1 ? "" : "s"} detalhado${rawRows.length === 1 ? "" : "s"} carregado${rawRows.length === 1 ? "" : "s"}`;
  if (!sheetSummary.total) return `${detailed}.`;
  return `${detailed}. Resumo da frota: ${sheetSummary.total} equipamentos.`;
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

function findKey(row, candidates) {
  const keys = Object.keys(row);
  return keys.find((key) => candidates.some((candidate) => normalize(key).includes(normalize(candidate))));
}

function numberValue(value) {
  const text = String(value || "").replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return text ? Number(text[0]) : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
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
