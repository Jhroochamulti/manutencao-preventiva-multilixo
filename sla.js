const CORRECTIVE_COLLECTION = "correctives";
const MATERIAL_COLLECTION = "materials";

const SLA_GOALS = {
  correctiveCritica: { label: "Corretiva critica", hours: 4 },
  correctiveAlta: { label: "Corretiva alta", hours: 12 },
  correctiveDefault: { label: "Corretiva media/baixa", hours: 24 },
  materialRequested: { label: "Material solicitado", days: 1 },
  materialAvailable: { label: "Material disponivel ate retirada", days: 0.5 }
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let correctives = [];
let materials = [];
let searchTerm = "";
let processFilter = "all";
let slaFilter = "all";

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");

initFirebase();
renderGoals();

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

document.querySelector("#slaSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#processFilter").addEventListener("change", (event) => {
  processFilter = event.target.value;
  render();
});

document.querySelector("#slaFilter").addEventListener("change", (event) => {
  slaFilter = event.target.value;
  render();
});

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
      setAuthStatus(`Conectado como ${user.email}. Carregando SLAs...`);
      await loadData();
      setAuthStatus(`SLA carregado: ${correctives.length} corretiva(s) e ${materials.length} material(is).`);
    } else {
      correctives = [];
      materials = [];
      setAuthStatus("Aguardando login.");
      render();
    }
  });
}

async function loadData() {
  const [correctiveSnapshot, materialSnapshot] = await Promise.all([
    getDocs(collection(db, CORRECTIVE_COLLECTION)),
    getDocs(collection(db, MATERIAL_COLLECTION))
  ]);
  correctives = correctiveSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  materials = materialSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  render();
}

function buildSlaItems() {
  const correctiveItems = correctives
    .filter((record) => !["Concluido", "Cancelado"].includes(record.status || ""))
    .map((record) => {
      const goal = correctiveGoal(record.priority);
      const elapsed = hoursBetween(record.openedAt, new Date());
      return {
        id: `corrective-${record.id}`,
        process: "corrective",
        processLabel: "Corretiva",
        equipment: record.equipment || "-",
        plate: record.plate || "",
        branch: record.branch || "",
        description: `${record.failureType || "Falha"} - ${record.description || ""}`,
        status: record.status || "Aberto",
        elapsed,
        elapsedLabel: `${formatNumber(elapsed)}h`,
        goal,
        goalLabel: `${formatNumber(goal.hours)}h`,
        ratio: goal.hours ? elapsed / goal.hours : 0
      };
    });

  const materialItems = materials
    .filter((record) => !["Retirado", "Cancelado"].includes(record.status || ""))
    .map((record) => {
      const goal = materialGoal(record);
      const elapsed = materialElapsedDays(record);
      return {
        id: `material-${record.id}`,
        process: "material",
        processLabel: "Material",
        equipment: record.equipment || "-",
        plate: record.plate || "",
        branch: record.branch || "",
        description: `${record.material || "Material"} - ${record.maintenanceType || ""}`,
        status: record.status || "Solicitado",
        elapsed,
        elapsedLabel: `${formatNumber(elapsed)}d`,
        goal,
        goalLabel: `${formatNumber(goal.days)}d`,
        ratio: goal.days ? elapsed / goal.days : 0
      };
    });

  return [...correctiveItems, ...materialItems].map((item) => ({
    ...item,
    slaClass: classifyRatio(item.ratio),
    deviation: Math.max(0, item.ratio - 1)
  }));
}

function filteredItems() {
  return buildSlaItems().filter((item) => {
    const haystack = [item.processLabel, item.equipment, item.plate, item.branch, item.description, item.status].join(" ").toLowerCase();
    return (!searchTerm || haystack.includes(searchTerm)) &&
      (processFilter === "all" || item.process === processFilter) &&
      (slaFilter === "all" || item.slaClass === slaFilter);
  });
}

function render() {
  const items = filteredItems();
  renderKpis(items);
  renderBottleneckRanking(items);
  renderTable(items);
}

function renderKpis(items) {
  document.querySelector("#totalItems").textContent = items.length;
  document.querySelector("#okItems").textContent = items.filter((item) => item.slaClass === "ok").length;
  document.querySelector("#attentionItems").textContent = items.filter((item) => item.slaClass === "attention").length;
  document.querySelector("#bottleneckItems").textContent = items.filter((item) => item.slaClass === "bottleneck").length;
}

function renderGoals() {
  const goals = [
    `${SLA_GOALS.correctiveCritica.label}: ${formatNumber(SLA_GOALS.correctiveCritica.hours)}h`,
    `${SLA_GOALS.correctiveAlta.label}: ${formatNumber(SLA_GOALS.correctiveAlta.hours)}h`,
    `${SLA_GOALS.correctiveDefault.label}: ${formatNumber(SLA_GOALS.correctiveDefault.hours)}h`,
    `${SLA_GOALS.materialRequested.label}: ${formatNumber(SLA_GOALS.materialRequested.days)}d`,
    `${SLA_GOALS.materialAvailable.label}: ${formatNumber(SLA_GOALS.materialAvailable.days)}d`
  ];
  document.querySelector("#goalList").innerHTML = goals.map((goal) => `
    <div class="ranking-row">
      <div><strong>${escapeHtml(goal)}</strong><span>Meta operacional configurada</span></div>
      <b>OK</b>
    </div>
  `).join("");
}

function renderBottleneckRanking(items) {
  const ranking = [...items].sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  const container = document.querySelector("#bottleneckRanking");
  if (!ranking.length) {
    container.innerHTML = `<p class="empty-inline">Sem itens monitorados no filtro.</p>`;
    return;
  }
  container.innerHTML = ranking.map((item) => `
    <div class="ranking-row stopped-row">
      <div>
        <strong>${escapeHtml(item.equipment)} ${escapeHtml(item.plate)}</strong>
        <span>${escapeHtml(item.processLabel)} - ${escapeHtml(item.description)}</span>
        <div class="mini-bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round(item.ratio * 100))}%"></i></div>
      </div>
      <b>${formatNumber(item.ratio * 100)}%</b>
    </div>
  `).join("");
}

function renderTable(items) {
  const body = document.querySelector("#slaTableBody");
  const rows = [...items].sort((a, b) => b.ratio - a.ratio);
  body.innerHTML = rows.map((item) => `
    <tr>
      <td data-label="Processo">${escapeHtml(item.processLabel)}</td>
      <td data-label="Equipamento">
        <div class="machine-cell">
          <strong>${escapeHtml(item.equipment)}</strong>
          <span>${escapeHtml(item.plate || "-")}</span>
          <span>${escapeHtml(item.branch || "-")}</span>
        </div>
      </td>
      <td data-label="Descricao">${escapeHtml(item.description)}</td>
      <td data-label="Status">${escapeHtml(item.status)}</td>
      <td data-label="Tempo atual">${escapeHtml(item.elapsedLabel)}</td>
      <td data-label="Meta">${escapeHtml(item.goalLabel)}</td>
      <td data-label="SLA"><span class="stage-pill ${item.slaClass}">${slaLabel(item.slaClass)}</span></td>
    </tr>
  `).join("");
  document.querySelector(".dashboard-table-panel .table-wrap").classList.toggle("is-empty", rows.length === 0);
}

function correctiveGoal(priority) {
  if (priority === "Critica") return SLA_GOALS.correctiveCritica;
  if (priority === "Alta") return SLA_GOALS.correctiveAlta;
  return SLA_GOALS.correctiveDefault;
}

function materialGoal(record) {
  if (record.status === "Disponivel") return SLA_GOALS.materialAvailable;
  return SLA_GOALS.materialRequested;
}

function materialElapsedDays(record) {
  if (record.status === "Disponivel") return daysBetween(record.availableAt || record.requestedAt, todayValue());
  return daysBetween(record.requestedAt, todayValue());
}

function classifyRatio(ratio) {
  if (ratio <= 1) return "ok";
  if (ratio <= 1.5) return "attention";
  return "bottleneck";
}

function slaLabel(cls) {
  return { ok: "Dentro", attention: "Atencao", bottleneck: "Fora" }[cls] || "-";
}

function hoursBetween(start, end) {
  const startDate = parseDate(start);
  const endDate = end instanceof Date ? end : parseDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round(((endDate - startDate) / 3600000) * 10) / 10);
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

function updateAuthUi() {
  const signed = Boolean(currentUser);
  logoutButton.hidden = !signed;
  loginForm.classList.toggle("signed", signed);
  loginEmail.disabled = signed;
  loginPassword.disabled = signed;
}

function setAuthStatus(text, state = "") {
  authStatus.textContent = text;
  authStatus.dataset.state = state;
}

function friendlyAuthError(error) {
  const code = error && error.code ? error.code : "";
  if (code.includes("invalid-credential")) return "e-mail ou senha invalidos.";
  if (code.includes("user-not-found")) return "usuario nao encontrado.";
  if (code.includes("wrong-password")) return "senha invalida.";
  return error.message || "erro desconhecido.";
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
