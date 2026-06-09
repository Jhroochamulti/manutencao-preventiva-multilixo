const FLEET_COLLECTION = "fleet";
const CORRECTIVE_COLLECTION = "correctives";
const MATERIAL_COLLECTION = "materials";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let fleet = [];
let correctives = [];
let materials = [];
let reportType = "fleet";
let searchTerm = "";
let branchFilter = "all";
let currentRows = [];
let currentColumns = [];

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const reportTypeSelect = document.querySelector("#reportType");
const branchFilterSelect = document.querySelector("#branchFilter");
const exportCsvButton = document.querySelector("#exportCsvButton");
const exportPdfButton = document.querySelector("#exportPdfButton");

initFirebase();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setAuthStatus("Entrando...");
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    loginPassword.value = "";
  } catch (error) {
    alert(`Nao foi possivel entrar: ${friendlyAuthError(error)}`);
    setAuthStatus("Login nao realizado.", "warning");
  }
});

logoutButton.addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth);
});

reportTypeSelect.addEventListener("change", (event) => {
  reportType = event.target.value;
  render();
});

document.querySelector("#reportSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

branchFilterSelect.addEventListener("change", (event) => {
  branchFilter = event.target.value;
  render();
});

exportCsvButton.addEventListener("click", exportCsv);
exportPdfButton.addEventListener("click", exportPdf);

function initFirebase() {
  const config = window.MULTILIXO_FIREBASE_CONFIG;
  if (!config || !config.projectId) {
    setAuthStatus("Firebase nao configurado.", "warning");
    updateAuthUi();
    return;
  }
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUi();
    if (user) {
      setAuthStatus(`Conectado como ${user.email}. Carregando relatorios...`);
      await loadData();
      setAuthStatus(`Dados carregados: ${fleet.length} ativos, ${correctives.length} corretiva(s), ${materials.length} material(is).`);
    } else {
      fleet = [];
      correctives = [];
      materials = [];
      setAuthStatus("Aguardando login.");
      render();
    }
  });
}

async function loadData() {
  const [fleetSnapshot, correctiveSnapshot, materialSnapshot] = await Promise.all([
    getDocs(collection(db, FLEET_COLLECTION)),
    getDocs(collection(db, CORRECTIVE_COLLECTION)),
    getDocs(collection(db, MATERIAL_COLLECTION))
  ]);

  fleet = fleetSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  correctives = correctiveSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  materials = materialSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  syncBranchFilter();
  render();
}

function render() {
  const report = buildReport();
  currentRows = report.rows;
  currentColumns = report.columns;
  document.querySelector("#reportTitle").textContent = report.title;
  renderMetrics(report);
  renderTable(report);
  exportCsvButton.disabled = !currentUser || !currentRows.length;
  exportPdfButton.disabled = !currentUser || !currentRows.length;
}

function buildReport() {
  if (reportType === "correctives") return buildCorrectiveReport();
  if (reportType === "materials") return buildMaterialReport();
  if (reportType === "sla") return buildSlaReport();
  return buildFleetReport();
}

function buildFleetReport() {
  const columns = [
    ["equipment", "Equipamento"],
    ["plate", "Placa"],
    ["category", "Categoria"],
    ["operationalClass", "Classe operacional"],
    ["manufacturer", "Fabricante"],
    ["model", "Modelo"],
    ["yearModel", "Ano"],
    ["branch", "Filial"],
    ["activeLabel", "Status"]
  ];
  const rows = filterRows(fleet.map((record) => ({
    ...record,
    activeLabel: record.active === false ? "Inativo" : "Ativo"
  })), ["equipment", "plate", "category", "operationalClass", "manufacturer", "model", "branch"]);
  return { title: "Relatorio de frota", columns, rows, openCount: rows.filter((row) => row.active !== false).length, criticalCount: 0, bottleneckCount: 0 };
}

function buildCorrectiveReport() {
  const columns = [
    ["equipment", "Equipamento"],
    ["plate", "Placa"],
    ["branch", "Filial"],
    ["failureType", "Falha"],
    ["priority", "Prioridade"],
    ["status", "Status"],
    ["openedAtLabel", "Abertura"],
    ["slaLabel", "SLA"],
    ["isStoppedLabel", "Parado"]
  ];
  const rows = filterRows(correctives.map((record) => ({
    ...record,
    openedAtLabel: formatDateTime(record.openedAt),
    slaLabel: `${formatNumber(hoursBetween(record.openedAt, record.finishedAt || new Date()))}h`,
    isStoppedLabel: record.isStopped ? "Sim" : "Nao"
  })), ["equipment", "plate", "branch", "failureType", "priority", "status", "assignedTo", "description"]);
  return {
    title: "Relatorio de corretivas",
    columns,
    rows,
    openCount: rows.filter((row) => !["Concluido", "Cancelado"].includes(row.status)).length,
    criticalCount: rows.filter((row) => ["Critica", "Alta"].includes(row.priority)).length,
    bottleneckCount: rows.filter((row) => hoursBetween(row.openedAt, row.finishedAt || new Date()) > correctiveGoal(row.priority)).length
  };
}

function buildMaterialReport() {
  const columns = [
    ["equipment", "Equipamento"],
    ["plate", "Placa"],
    ["branch", "Filial"],
    ["material", "Material"],
    ["quantityLabel", "Quantidade"],
    ["maintenanceType", "Tipo"],
    ["status", "Status"],
    ["requestedAtLabel", "Solicitado"],
    ["availableAtLabel", "Disponivel"],
    ["pickedUpAtLabel", "Retirado"],
    ["leadLabel", "Lead time"]
  ];
  const rows = filterRows(materials.map((record) => ({
    ...record,
    quantityLabel: `${formatNumber(record.quantity || 0)} ${record.unit || "un"}`,
    requestedAtLabel: formatDate(record.requestedAt),
    availableAtLabel: formatDate(record.availableAt),
    pickedUpAtLabel: formatDate(record.pickedUpAt),
    leadLabel: `${formatNumber(materialLeadDays(record))}d`
  })), ["equipment", "plate", "branch", "material", "maintenanceType", "status", "supplier", "notes"]);
  return {
    title: "Relatorio de materiais",
    columns,
    rows,
    openCount: rows.filter((row) => !["Retirado", "Cancelado"].includes(row.status)).length,
    criticalCount: rows.filter((row) => row.status === "Solicitado").length,
    bottleneckCount: rows.filter((row) => materialLeadDays(row) > 1).length
  };
}

function buildSlaReport() {
  const correctiveRows = correctives
    .filter((record) => !["Concluido", "Cancelado"].includes(record.status || ""))
    .map((record) => {
      const elapsed = hoursBetween(record.openedAt, new Date());
      const goal = correctiveGoal(record.priority);
      return {
        process: "Corretiva",
        equipment: record.equipment,
        plate: record.plate,
        branch: record.branch,
        description: `${record.failureType || "Falha"} - ${record.description || ""}`,
        status: record.status,
        elapsedLabel: `${formatNumber(elapsed)}h`,
        goalLabel: `${formatNumber(goal)}h`,
        slaStatus: elapsed <= goal ? "Dentro" : elapsed <= goal * 1.5 ? "Atencao" : "Fora"
      };
    });
  const materialRows = materials
    .filter((record) => !["Retirado", "Cancelado"].includes(record.status || ""))
    .map((record) => {
      const elapsed = materialLeadDays(record);
      const goal = record.status === "Disponivel" ? 0.5 : 1;
      return {
        process: "Material",
        equipment: record.equipment,
        plate: record.plate,
        branch: record.branch,
        description: record.material,
        status: record.status,
        elapsedLabel: `${formatNumber(elapsed)}d`,
        goalLabel: `${formatNumber(goal)}d`,
        slaStatus: elapsed <= goal ? "Dentro" : elapsed <= goal * 1.5 ? "Atencao" : "Fora"
      };
    });
  const columns = [
    ["process", "Processo"],
    ["equipment", "Equipamento"],
    ["plate", "Placa"],
    ["branch", "Filial"],
    ["description", "Descricao"],
    ["status", "Status"],
    ["elapsedLabel", "Tempo"],
    ["goalLabel", "Meta"],
    ["slaStatus", "SLA"]
  ];
  const rows = filterRows([...correctiveRows, ...materialRows], ["process", "equipment", "plate", "branch", "description", "status", "slaStatus"]);
  return {
    title: "Relatorio de SLA",
    columns,
    rows,
    openCount: rows.length,
    criticalCount: rows.filter((row) => row.slaStatus === "Atencao").length,
    bottleneckCount: rows.filter((row) => row.slaStatus === "Fora").length
  };
}

function filterRows(rows, fields) {
  return rows.filter((row) => {
    const haystack = fields.map((field) => row[field] || "").join(" ").toLowerCase();
    return (!searchTerm || haystack.includes(searchTerm)) &&
      (branchFilter === "all" || normalizeFilter(row.branch) === branchFilter);
  });
}

function renderMetrics(report) {
  document.querySelector("#reportTotal").textContent = report.rows.length;
  document.querySelector("#reportOpen").textContent = report.openCount;
  document.querySelector("#reportCritical").textContent = report.criticalCount;
  document.querySelector("#reportBottlenecks").textContent = report.bottleneckCount;
}

function renderTable(report) {
  document.querySelector("#reportHead").innerHTML = `<tr>${report.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>`;
  document.querySelector("#reportBody").innerHTML = report.rows.map((row) => `
    <tr>${report.columns.map(([field, label]) => `<td data-label="${escapeHtml(label)}">${escapeHtml(row[field] || "-")}</td>`).join("")}</tr>
  `).join("");
  document.querySelector(".dashboard-table-panel .table-wrap").classList.toggle("is-empty", report.rows.length === 0);
  const emptyState = document.querySelector(".dashboard-table-panel .empty-state");
  emptyState.querySelector("strong").textContent = currentUser ? "Nenhum registro encontrado" : "Entre para carregar os relatórios";
  emptyState.querySelector("p").textContent = currentUser ? "Ajuste os filtros ou carregue os dados no Firebase." : "Os dados online serão exibidos após o login.";
}

function exportCsv() {
  const header = currentColumns.map(([, label]) => label);
  const lines = currentRows.map((row) => currentColumns.map(([field]) => csvCell(row[field] || "")).join(";"));
  const csv = [header.map(csvCell).join(";"), ...lines].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${reportType}-multilixo.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportPdf() {
  const reportTitle = document.querySelector("#reportTitle").textContent;
  const header = currentColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = currentRows.map((row) => `<tr>${currentColumns.map(([field]) => `<td>${escapeHtml(row[field] || "-")}</td>`).join("")}</tr>`).join("");
  const report = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!report) {
    alert("Nao foi possivel abrir a janela de PDF.");
    return;
  }
  report.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(reportTitle)}</title>
        <style>
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #24152a; }
          h1 { color: #6e3781; margin: 0 0 6px; }
          p { color: #716676; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { padding: 7px; border: 1px solid #e8e1eb; text-align: left; vertical-align: top; }
          th { color: #6e3781; background: #f7f5f8; }
          @media print { body { padding: 12mm; } tr { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(reportTitle)}</h1>
        <p>Gerado em ${new Intl.DateTimeFormat("pt-BR").format(new Date())}</p>
        <table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>
        <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
      </body>
    </html>
  `);
  report.document.close();
}

function syncBranchFilter() {
  const branches = Object.keys(countBy([...fleet, ...correctives, ...materials], "branch")).sort((a, b) => naturalSort(a, b));
  branchFilterSelect.innerHTML = `<option value="all">Todas as filiais</option>`;
  branches.forEach((branch) => {
    const option = document.createElement("option");
    option.value = normalizeFilter(branch);
    option.textContent = branch || "Sem filial";
    branchFilterSelect.appendChild(option);
  });
}

function correctiveGoal(priority) {
  if (priority === "Critica") return 4;
  if (priority === "Alta") return 12;
  return 24;
}

function hoursBetween(start, end) {
  const startDate = parseDate(start);
  const endDate = end instanceof Date ? end : parseDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round(((endDate - startDate) / 3600000) * 10) / 10);
}

function materialLeadDays(record) {
  const end = record.pickedUpAt || record.availableAt || todayValue();
  return daysBetween(record.requestedAt, end) || 0;
}

function daysBetween(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round(((endDate - startDate) / 86400000) * 10) / 10);
}

function parseDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parseDate(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(parseDate(value));
}

function countBy(records, field) {
  return records.reduce((acc, record) => {
    const label = record[field] || "Sem informacao";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function updateAuthUi() {
  const signed = Boolean(currentUser);
  logoutButton.hidden = !signed;
  loginForm.classList.toggle("signed", signed);
  loginEmail.disabled = signed;
  loginPassword.disabled = signed;
  exportCsvButton.disabled = !signed || !currentRows.length;
  exportPdfButton.disabled = !signed || !currentRows.length;
}

function setAuthStatus(text, state = "") {
  authStatus.textContent = text;
  authStatus.dataset.state = state;
}

function friendlyAuthError(error) {
  const code = error && error.code ? error.code : "";
  if (code.includes("invalid-credential")) return "e-mail ou senha invalidos.";
  return error.message || "erro desconhecido.";
}

function normalizeFilter(value) {
  return String(value || "sem-informacao").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function naturalSort(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
