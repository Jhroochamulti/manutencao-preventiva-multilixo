const FLEET_COLLECTION = "fleet";
const CORRECTIVE_COLLECTION = "correctives";
const MATERIAL_COLLECTION = "materials";
const PREVENTIVE_COLLECTION = "preventives";
const FLEET_STORAGE_KEY = "multilixo-fleet-dev";
const PREVENTIVE_STORAGE_KEY = "multilixo-preventivas";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let fleet = [];
let correctives = [];
let materials = [];
let preventives = [];
let searchTerm = "";
let branchFilter = "all";
let categoryFilter = "all";

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const branchFilterSelect = document.querySelector("#branchFilter");
const categoryFilterSelect = document.querySelector("#categoryFilter");

initFirebase();
bindEvents();
render();

function bindEvents() {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setAuthStatus("Entrando...");
      await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
      loginPassword.value = "";
    } catch (error) {
      alert(`Não foi possível entrar: ${friendlyAuthError(error)}`);
      setAuthStatus("Login não realizado.", "warning");
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (!auth) return;
    await signOut(auth);
  });

  document.querySelector("#mtrSearch").addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });

  branchFilterSelect.addEventListener("change", (event) => {
    branchFilter = event.target.value;
    render();
  });

  categoryFilterSelect.addEventListener("change", (event) => {
    categoryFilter = event.target.value;
    render();
  });
}

function initFirebase() {
  const config = window.MULTILIXO_FIREBASE_CONFIG;
  if (!config || !config.projectId) {
    setAuthStatus("Firebase não configurado.", "warning");
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
      setAuthStatus(`Conectado como ${user.email}. Carregando Painel MTR...`);
      await loadData();
      setAuthStatus(`Painel MTR carregado: ${fleet.length} ativos, ${correctives.length} corretiva(s), ${materials.length} material(is).`);
    } else {
      fleet = loadLocalFleet();
      correctives = [];
      materials = [];
      preventives = loadLocalPreventives();
      syncBranchFilter();
      setAuthStatus("Aguardando login. Exibindo dados locais quando disponíveis.");
      render();
    }
  });
}

async function loadData() {
  const [fleetSnapshot, correctiveSnapshot, materialSnapshot, preventiveSnapshot] = await Promise.all([
    getDocs(collection(db, FLEET_COLLECTION)),
    getDocs(collection(db, CORRECTIVE_COLLECTION)),
    getDocs(collection(db, MATERIAL_COLLECTION)),
    getDocs(collection(db, PREVENTIVE_COLLECTION)).catch(() => ({ docs: [] }))
  ]);

  const firestoreFleet = fleetSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((record) => record.active !== false);
  const firestorePreventives = preventiveSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  fleet = mergeById(loadLocalFleet(), firestoreFleet).filter((record) => record.active !== false);
  correctives = correctiveSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  materials = materialSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  preventives = mergeById(loadLocalPreventives(), firestorePreventives);
  syncBranchFilter();
  render();
}

function filteredFleet() {
  return fleet.filter((record) => {
    const haystack = [record.equipment, record.plate, record.branch, record.model, record.operationalClass, record.manufacturer].join(" ").toLowerCase();
    return (!searchTerm || haystack.includes(searchTerm)) &&
      (branchFilter === "all" || normalizeFilter(record.branch) === branchFilter) &&
      (categoryFilter === "all" || record.category === categoryFilter);
  });
}

function render() {
  const visibleFleet = filteredFleet();
  const fleetIds = new Set(visibleFleet.map((record) => record.id));
  const fleetById = new Map(visibleFleet.map((record) => [record.id, record]));
  const visibleCorrectives = correctives.filter((record) => !isClosed(record.status) && record.isStopped && fleetIds.has(record.fleetId));
  const awaitingPartsFleetIds = new Set(visibleCorrectives.filter((record) => isAwaitingParts(record.status)).map((record) => record.fleetId));
  const visibleMaterials = materials.filter((record) =>
    !["Retirado", "Cancelado"].includes(record.status || "") &&
    fleetIds.has(record.fleetId) &&
    (
      isPreventiveMaterial(record) ||
      (isCorrectiveMaterial(record) && awaitingPartsFleetIds.has(record.fleetId))
    )
  );
  const visiblePreventives = preventives.filter((record) => !["Concluido", "Cancelado"].includes(record.status || "") && fleetIds.has(record.fleetId));
  const slaLate = monitoredLate(visibleCorrectives, visibleMaterials);
  const monitored = visibleCorrectives.length + visibleMaterials.length;

  renderDomainSummary(visibleFleet, visibleCorrectives, fleetById);
  renderKpis(visibleFleet, visibleCorrectives, visibleMaterials, visiblePreventives, slaLate, monitored);
  renderHealthChart(visibleCorrectives, visibleMaterials, slaLate, monitored);
  renderFleetDonut(visibleFleet);
  renderBranchPressure(visibleFleet, visibleCorrectives, visibleMaterials);
  renderPriorityColumns(visibleCorrectives);
  renderAssetBottlenecks(visibleFleet, visibleCorrectives, visibleMaterials);
}

function renderDomainSummary(visibleFleet, visibleCorrectives, fleetById) {
  const trucks = visibleFleet.filter((record) => record.category === "caminhao");
  const machines = visibleFleet.filter((record) => record.category === "maquina");
  const retainedTrucks = visibleCorrectives.filter((record) => fleetById.get(record.fleetId)?.category === "caminhao");
  const retainedMachines = visibleCorrectives.filter((record) => fleetById.get(record.fleetId)?.category === "maquina");

  document.querySelector("#vtrFleet").textContent = trucks.length;
  document.querySelector("#vtrRetained").textContent = retainedTrucks.length;
  document.querySelector("#vtrAvailability").textContent = `${availabilityPercent(trucks.length, retainedTrucks.length)}%`;
  document.querySelector("#mtrFleet").textContent = machines.length;
  document.querySelector("#mtrRetained").textContent = retainedMachines.length;
  document.querySelector("#mtrAvailability").textContent = `${availabilityPercent(machines.length, retainedMachines.length)}%`;

  renderStatusLine("#vtrStatusLine", retainedTrucks);
  renderStatusLine("#mtrStatusLine", retainedMachines);
}

function renderStatusLine(selector, records) {
  const container = document.querySelector(selector);
  const total = records.length;
  if (!total) {
    container.innerHTML = `<span class="ok" style="width:100%">Sem retenções no filtro</span>`;
    return;
  }

  const counts = records.reduce((acc, record) => {
    const elapsed = slaHours(record);
    const goal = correctiveGoal(record.priority);
    const key = elapsed <= goal ? "ok" : elapsed <= goal * 1.5 ? "attention" : "late";
    acc[key] += 1;
    return acc;
  }, { ok: 0, attention: 0, late: 0 });

  const items = [
    ["ok", "Dentro", counts.ok],
    ["attention", "Atenção", counts.attention],
    ["late", "Gargalo", counts.late]
  ];

  container.innerHTML = items
    .filter(([, , count]) => count)
    .map(([key, label, count]) => `<span class="${key}" style="width:${(count / total) * 100}%">${label}: ${count}</span>`)
    .join("");
}

function renderKpis(visibleFleet, visibleCorrectives, visibleMaterials, visiblePreventives, slaLate, monitored) {
  const counts = countBy(visibleFleet, "category");
  const stopped = new Set(visibleCorrectives.filter((record) => record.isStopped).map((record) => record.fleetId)).size;
  const materialLate = visibleMaterials.filter((record) => materialLeadDays(record) > materialGoal(record)).length;
  const pendingPreventives = visiblePreventives.filter((record) => !record.executionDate && !record.executedAt).length;

  document.querySelector("#kpiFleet").textContent = visibleFleet.length;
  document.querySelector("#kpiFleetMix").textContent = `${counts.caminhao || 0} caminhões | ${counts.maquina || 0} máquinas`;
  document.querySelector("#kpiCorrectives").textContent = visibleCorrectives.length;
  document.querySelector("#kpiStopped").textContent = `${stopped} equipamento(s) parado(s)`;
  document.querySelector("#kpiMaterials").textContent = visibleMaterials.length;
  document.querySelector("#kpiMaterialsLate").textContent = `${materialLate} fora da meta`;
  document.querySelector("#kpiSlaLate").textContent = slaLate;
  document.querySelector("#kpiSlaRate").textContent = `${monitored ? Math.round((slaLate / monitored) * 100) : 0}% dos itens monitorados`;
  document.querySelector("#kpiPreventives").textContent = visiblePreventives.length;
  document.querySelector("#kpiPreventiveGap").textContent = `${pendingPreventives} com etapa pendente`;
}

function renderHealthChart(visibleCorrectives, visibleMaterials, late, monitored) {
  const container = document.querySelector("#healthChart");
  if (!monitored) {
    container.innerHTML = `<p class="empty-inline">Sem itens de manutenção monitorados no filtro atual.</p>`;
    return;
  }

  const attention = visibleCorrectives.filter((record) => {
    const elapsed = slaHours(record);
    const goal = correctiveGoal(record.priority);
    return elapsed > goal && elapsed <= goal * 1.5;
  }).length;
  const ok = Math.max(0, monitored - late - attention);
  const items = [
    ["ok", "Dentro da meta", ok, "#bfdd25"],
    ["attention", "Atenção", attention, "#f18225"],
    ["late", "Gargalo", late, "#d92d20"]
  ];

  container.innerHTML = `
    <div class="stacked-track mtr-track">
      ${items.map(([, label, count, color]) => `<span title="${escapeHtml(label)}: ${count}" style="width:${(count / monitored) * 100}%; background:${color}"></span>`).join("")}
    </div>
    <div class="chart-legend compact">${items.map(([, label, count, color]) => legendRow(label, count, monitored, color)).join("")}</div>
  `;
}

function renderFleetDonut(visibleFleet) {
  const labels = { caminhao: "Caminhões", maquina: "Máquinas", utilitario: "Utilitários", gerador: "Geradores", outro: "Outros" };
  const colors = { caminhao: "#bfdd25", maquina: "#6e3781", utilitario: "#f18225", gerador: "#2f80ed", outro: "#98a2b3" };
  const donut = document.querySelector("#fleetDonut");
  const legend = document.querySelector("#fleetLegend");
  const entries = Object.entries(countBy(visibleFleet, "category")).sort((a, b) => b[1] - a[1]);
  const total = visibleFleet.length;
  if (!total) {
    donut.dataset.total = "0";
    donut.style.background = "conic-gradient(#eef2f6 0 100%)";
    legend.innerHTML = `<p class="empty-inline">Sem frota no filtro.</p>`;
    return;
  }
  let cursor = 0;
  donut.style.background = `conic-gradient(${entries.map(([category, count]) => {
    const start = cursor;
    cursor += (count / total) * 100;
    return `${colors[category] || colors.outro} ${start}% ${cursor}%`;
  }).join(", ")})`;
  donut.dataset.total = total;
  legend.innerHTML = entries.map(([category, count]) => legendRow(labels[category] || category, count, total, colors[category] || colors.outro)).join("");
}

function renderBranchPressure(visibleFleet, visibleCorrectives, visibleMaterials) {
  const container = document.querySelector("#branchPressure");
  const fleetById = new Map(visibleFleet.map((record) => [record.id, record]));
  const totals = {};
  visibleCorrectives.forEach((record) => {
    const branch = record.branch || fleetById.get(record.fleetId)?.branch || "Sem filial";
    totals[branch] = (totals[branch] || 0) + 2 + (record.isStopped ? 2 : 0);
  });
  visibleMaterials.forEach((record) => {
    const branch = record.branch || fleetById.get(record.fleetId)?.branch || "Sem filial";
    totals[branch] = (totals[branch] || 0) + 1;
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (!entries.length) {
    container.innerHTML = `<p class="empty-inline">Sem pressão de manutenção no filtro.</p>`;
    return;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = entries.map(([label, count]) => `
    <div class="chart-bar-row">
      <div class="chart-bar-meta"><strong>${escapeHtml(label)}</strong><span>${count}</span></div>
      <div class="chart-bar-track"><i style="width:${Math.round((count / max) * 100)}%"></i></div>
    </div>
  `).join("");
}

function renderPriorityColumns(visibleCorrectives) {
  const container = document.querySelector("#priorityColumns");
  const totals = countBy(visibleCorrectives, "priority");
  const items = [["Critica", totals.Critica || 0, "#d92d20"], ["Alta", totals.Alta || 0, "#f18225"], ["Media", totals.Media || 0, "#6e3781"], ["Baixa", totals.Baixa || 0, "#bfdd25"]];
  const max = Math.max(...items.map(([, count]) => count), 0);
  if (!max) {
    container.innerHTML = `<p class="empty-inline">Sem corretivas abertas.</p>`;
    return;
  }
  container.innerHTML = items.map(([label, count, color]) => `
    <div class="column-item">
      <div class="column-track"><i style="height:${Math.max(8, Math.round((count / max) * 100))}%; background:${color}"></i></div>
      <strong>${count}</strong><span>${escapeHtml(label)}</span>
    </div>
  `).join("");
}

function renderAssetBottlenecks(visibleFleet, visibleCorrectives, visibleMaterials) {
  const container = document.querySelector("#assetBottlenecks");
  const fleetById = new Map(visibleFleet.map((record) => [record.id, record]));
  const scores = new Map();
  visibleCorrectives.forEach((record) => {
    const id = record.fleetId || record.equipment || record.id;
    scores.set(id, (scores.get(id) || 0) + 3 + (record.isStopped ? 3 : 0) + (slaHours(record) > correctiveGoal(record.priority) ? 2 : 0));
  });
  visibleMaterials.forEach((record) => {
    const id = record.fleetId || record.equipment || record.id;
    scores.set(id, (scores.get(id) || 0) + 1 + (materialLeadDays(record) > materialGoal(record) ? 2 : 0));
  });
  const items = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!items.length) {
    container.innerHTML = `<p class="empty-inline">Nenhum gargalo relevante no filtro atual.</p>`;
    return;
  }
  container.innerHTML = items.map(([id, score], index) => {
    const asset = fleetById.get(id) || {};
    return `
      <div class="mtr-bottleneck-row">
        <b>${index + 1}</b>
        <div><strong>${escapeHtml(asset.equipment || id)}</strong><span>${escapeHtml(asset.branch || "-")} | ${escapeHtml(asset.operationalClass || "Sem classe")}</span></div>
        <em>${score} pts</em>
      </div>
    `;
  }).join("");
}

function monitoredLate(visibleCorrectives, visibleMaterials) {
  return visibleCorrectives.filter((record) => slaHours(record) > correctiveGoal(record.priority)).length +
    visibleMaterials.filter((record) => materialLeadDays(record) > materialGoal(record)).length;
}

function syncBranchFilter() {
  const currentValue = branchFilterSelect.value;
  const branches = Object.keys(countBy(fleet, "branch")).sort((a, b) => naturalSort(a, b));
  branchFilterSelect.innerHTML = `<option value="all">Todas as filiais</option>`;
  branches.forEach((branch) => {
    const option = document.createElement("option");
    option.value = normalizeFilter(branch);
    option.textContent = branch || "Sem filial";
    branchFilterSelect.appendChild(option);
  });
  branchFilter = Array.from(branchFilterSelect.options).some((option) => option.value === currentValue) ? currentValue : "all";
  branchFilterSelect.value = branchFilter;
}

function legendRow(label, count, total, color) {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return `<div class="chart-legend-row"><i style="background:${color}"></i><span>${escapeHtml(label)}</span><strong>${count} - ${percent}%</strong></div>`;
}

function availabilityPercent(fleetCount, retainedCount) {
  if (!fleetCount) return 0;
  return Math.max(0, Math.round(((fleetCount - retainedCount) / fleetCount) * 1000) / 10);
}

function countBy(records, field) {
  return records.reduce((acc, record) => {
    const label = record[field] || "Sem informação";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function isClosed(status) {
  return ["Concluido", "Cancelado"].includes(status || "");
}

function isAwaitingParts(status) {
  return normalizeFilter(status) === "aguardandopeca";
}

function isCorrectiveMaterial(record) {
  return normalizeFilter(record.maintenanceType) === "corretiva";
}

function isPreventiveMaterial(record) {
  return normalizeFilter(record.maintenanceType) === "preventiva";
}

function slaHours(record) {
  const start = parseDate(record.openedAt);
  const end = record.finishedAt ? parseDate(record.finishedAt) : new Date();
  if (!start || !end) return 0;
  return Math.max(0, Math.round(((end - start) / 3600000) * 10) / 10);
}

function materialLeadDays(record) {
  return daysBetween(record.requestedAt, record.pickedUpAt || record.availableAt || todayValue());
}

function materialGoal(record) {
  return record.status === "Disponivel" ? 0.5 : 1;
}

function correctiveGoal(priority) {
  if (priority === "Critica") return 4;
  if (priority === "Alta") return 12;
  return 24;
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
  return error.message || "erro desconhecido.";
}

function normalizeFilter(value) {
  return String(value || "sem-informacao").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mergeById(primary, secondary) {
  const merged = new Map();
  [...primary, ...secondary].forEach((record) => {
    if (!record) return;
    const key = record.id || record.fleetId || record.plate || record.fleet || record.equipment;
    if (!key) return;
    merged.set(key, { ...(merged.get(key) || {}), ...record });
  });
  return Array.from(merged.values());
}

function loadLocalFleet() {
  try {
    const saved = localStorage.getItem(FLEET_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Frota local invalida.", error);
    return [];
  }
}

function loadLocalPreventives() {
  try {
    const saved = localStorage.getItem(PREVENTIVE_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((record) => record.fleetId && !String(record.id || "").startsWith("mlx-default-"))
      .map((record) => ({
        id: record.id || "",
        fleetId: record.fleetId || "",
        equipment: record.machine || record.equipment || "",
        machine: record.machine || record.equipment || "",
        plate: record.plate || record.fleet || "",
        fleet: record.fleet || record.plate || "",
        branch: record.branch || "",
        model: record.model || "",
        yearModel: record.yearModel || record.year || "",
        serviceType: record.serviceType || "",
        status: record.status || preventiveStatus(record),
        requestDate: record.requestDate || "",
        availableDate: record.availableDate || "",
        pickupDate: record.pickupDate || "",
        executionDate: record.executionDate || "",
        notes: record.notes || ""
      }));
  } catch (error) {
    console.warn("Preventivas locais invalidas.", error);
    return [];
  }
}

function preventiveStatus(record) {
  if (record.executionDate || record.executedAt) return "Concluido";
  if (record.pickupDate) return "Material retirado";
  if (record.availableDate) return "Disponível para retirada";
  return "Aguardando material";
}

function naturalSort(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
