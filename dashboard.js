const FLEET_COLLECTION = "fleet";
const CORRECTIVE_COLLECTION = "correctives";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  getDocs,
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let fleetRecords = [];
let correctives = [];
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

document.querySelector("#dashboardSearch").addEventListener("input", (event) => {
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
      setAuthStatus(`Conectado como ${user.email}. Carregando dashboard...`);
      await loadData();
      setAuthStatus(`Dashboard carregado: ${fleetRecords.length} ativos e ${correctives.length} corretiva(s).`);
    } else {
      fleetRecords = [];
      correctives = [];
      setAuthStatus("Aguardando login.");
      render();
    }
  });
}

async function loadData() {
  const [fleetSnapshot, correctiveSnapshot] = await Promise.all([
    getDocs(collection(db, FLEET_COLLECTION)),
    getDocs(collection(db, CORRECTIVE_COLLECTION))
  ]);

  fleetRecords = fleetSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((record) => record.active !== false);
  correctives = correctiveSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  syncBranchFilter();
  render();
}

function filteredFleet() {
  return fleetRecords.filter((record) => {
    const haystack = [
      record.equipment,
      record.plate,
      record.branch,
      record.model,
      record.operationalClass,
      record.manufacturer
    ].join(" ").toLowerCase();

    return (
      (!searchTerm || haystack.includes(searchTerm)) &&
      (branchFilter === "all" || normalizeFilter(record.branch) === branchFilter) &&
      (categoryFilter === "all" || record.category === categoryFilter)
    );
  });
}

function filteredCorrectives(fleetIds) {
  return correctives.filter((record) =>
    !["Concluido", "Cancelado"].includes(record.status || "") &&
    fleetIds.has(record.fleetId)
  );
}

function render() {
  const fleet = filteredFleet();
  const fleetIds = new Set(fleet.map((record) => record.id));
  const openCorrectives = filteredCorrectives(fleetIds);
  renderKpis(fleet, openCorrectives);
  renderVisualAnalysis(fleet, openCorrectives);
  renderRanking("#branchRanking", countBy(fleet, "branch"), fleet.length, 10);
  renderRanking("#operationRanking", countBy(fleet, "operationalClass"), fleet.length, 10);
  renderPriorityRanking(openCorrectives);
  renderStoppedList(openCorrectives);
  renderAssetRiskTable(fleet, openCorrectives);
}

function renderKpis(fleet, openCorrectives) {
  const stopped = openCorrectives.filter((record) => record.isStopped);
  const average = openCorrectives.length
    ? openCorrectives.reduce((sum, record) => sum + slaHours(record), 0) / openCorrectives.length
    : 0;

  document.querySelector("#fleetTotal").textContent = fleet.length;
  document.querySelector("#openCorrectives").textContent = openCorrectives.length;
  document.querySelector("#stoppedAssets").textContent = new Set(stopped.map((record) => record.fleetId)).size;
  document.querySelector("#averageSla").textContent = `${formatNumber(average)}h`;
}

function renderVisualAnalysis(fleet, openCorrectives) {
  renderFleetCategoryDonut(fleet);
  renderSlaStatusChart(openCorrectives);
  renderBranchChart(fleet);
  renderPriorityChart(openCorrectives);
}

function renderFleetCategoryDonut(fleet) {
  const labels = {
    caminhao: "Caminhoes",
    maquina: "Maquinas",
    utilitario: "Utilitarios",
    gerador: "Geradores",
    outro: "Outros"
  };
  const colors = {
    caminhao: "#bfdd25",
    maquina: "#6e3781",
    utilitario: "#f18225",
    gerador: "#2f80ed",
    outro: "#98a2b3"
  };
  const donut = document.querySelector("#fleetCategoryDonut");
  const legend = document.querySelector("#fleetCategoryLegend");
  const entries = Object.entries(countBy(fleet, "category"))
    .filter(([category]) => category !== "Sem informacao")
    .sort((a, b) => b[1] - a[1]);
  const total = fleet.length;

  if (!total || !entries.length) {
    donut.style.background = "conic-gradient(#eef2f6 0 100%)";
    donut.dataset.total = "0";
    legend.innerHTML = `<p class="empty-inline">Sem frota no filtro atual.</p>`;
    return;
  }

  let cursor = 0;
  const segments = entries.map(([category, count]) => {
    const start = cursor;
    const size = (count / total) * 100;
    cursor += size;
    return `${colors[category] || colors.outro} ${start}% ${cursor}%`;
  });

  donut.style.background = `conic-gradient(${segments.join(", ")})`;
  donut.dataset.total = total;
  legend.innerHTML = entries.map(([category, count]) => chartLegendRow(labels[category] || category, count, total, colors[category] || colors.outro)).join("");
}

function renderSlaStatusChart(openCorrectives) {
  const container = document.querySelector("#slaStatusChart");
  const total = openCorrectives.length;
  const counts = openCorrectives.reduce((acc, record) => {
    const elapsed = slaHours(record);
    const goal = correctiveGoal(record.priority);
    const key = elapsed <= goal ? "ok" : elapsed <= goal * 1.5 ? "attention" : "late";
    acc[key] += 1;
    return acc;
  }, { ok: 0, attention: 0, late: 0 });

  if (!total) {
    container.innerHTML = `<p class="empty-inline">Sem corretivas abertas no filtro atual.</p>`;
    return;
  }

  const items = [
    ["ok", "Dentro da meta", counts.ok, "#bfdd25"],
    ["attention", "Atencao", counts.attention, "#f18225"],
    ["late", "Fora da meta", counts.late, "#d92d20"]
  ];

  container.innerHTML = `
    <div class="stacked-track">
      ${items.map(([key, label, count, color]) => {
        const percent = total ? (count / total) * 100 : 0;
        return `<span class="${key}" title="${escapeHtml(label)}: ${count}" style="width:${percent}%; background:${color}"></span>`;
      }).join("")}
    </div>
    <div class="chart-legend compact">
      ${items.map(([, label, count, color]) => chartLegendRow(label, count, total, color)).join("")}
    </div>
  `;
}

function renderBranchChart(fleet) {
  const container = document.querySelector("#branchChart");
  const entries = Object.entries(countBy(fleet, "branch"))
    .sort((a, b) => b[1] - a[1] || naturalSort(a[0], b[0]))
    .slice(0, 7);

  if (!entries.length) {
    container.innerHTML = `<p class="empty-inline">Sem filiais no filtro atual.</p>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = entries.map(([label, count]) => {
    const percent = Math.round((count / max) * 100);
    return `
      <div class="chart-bar-row">
        <div class="chart-bar-meta">
          <strong>${escapeHtml(label || "Sem filial")}</strong>
          <span>${count}</span>
        </div>
        <div class="chart-bar-track"><i style="width:${percent}%"></i></div>
      </div>
    `;
  }).join("");
}

function renderPriorityChart(openCorrectives) {
  const container = document.querySelector("#priorityChart");
  const totals = countBy(openCorrectives, "priority");
  const items = [
    ["Critica", totals.Critica || 0, "#d92d20"],
    ["Alta", totals.Alta || 0, "#f18225"],
    ["Media", totals.Media || 0, "#6e3781"],
    ["Baixa", totals.Baixa || 0, "#bfdd25"]
  ];
  const max = Math.max(...items.map(([, count]) => count), 0);

  if (!max) {
    container.innerHTML = `<p class="empty-inline">Sem corretivas abertas no filtro atual.</p>`;
    return;
  }

  container.innerHTML = items.map(([label, count, color]) => {
    const height = Math.max(8, Math.round((count / max) * 100));
    return `
      <div class="column-item">
        <div class="column-track"><i style="height:${height}%; background:${color}"></i></div>
        <strong>${count}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }).join("");
}

function chartLegendRow(label, count, total, color) {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return `
    <div class="chart-legend-row">
      <i style="background:${color}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${count} - ${percent}%</strong>
    </div>
  `;
}

function renderRanking(selector, counts, total, limit) {
  const container = document.querySelector(selector);
  const items = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || naturalSort(a[0], b[0]))
    .slice(0, limit);

  if (!items.length) {
    container.innerHTML = `<p class="empty-inline">Sem dados para exibir.</p>`;
    return;
  }

  container.innerHTML = items.map(([label, count]) => rankingRow(label || "Sem informacao", count, total)).join("");
}

function renderPriorityRanking(openCorrectives) {
  const totals = countBy(openCorrectives, "priority");
  const ordered = ["Critica", "Alta", "Media", "Baixa"]
    .filter((label) => totals[label])
    .map((label) => [label, totals[label]]);
  const container = document.querySelector("#priorityRanking");

  if (!ordered.length) {
    container.innerHTML = `<p class="empty-inline">Sem corretivas abertas.</p>`;
    return;
  }

  container.innerHTML = ordered.map(([label, count]) => rankingRow(label, count, openCorrectives.length)).join("");
}

function renderStoppedList(openCorrectives) {
  const stopped = openCorrectives
    .filter((record) => record.isStopped)
    .sort((a, b) => slaHours(b) - slaHours(a))
    .slice(0, 8);
  const container = document.querySelector("#stoppedList");

  if (!stopped.length) {
    container.innerHTML = `<p class="empty-inline">Nenhum equipamento parado no filtro atual.</p>`;
    return;
  }

  container.innerHTML = stopped.map((record) => `
    <div class="ranking-row stopped-row">
      <div>
        <strong>${escapeHtml(record.equipment || "-")} ${escapeHtml(record.plate || "")}</strong>
        <span>${escapeHtml(record.branch || "-")} - ${escapeHtml(record.failureType || "Falha")}</span>
      </div>
      <b>${formatNumber(slaHours(record))}h</b>
    </div>
  `).join("");
}

function renderAssetRiskTable(fleet, openCorrectives) {
  const body = document.querySelector("#assetRiskTable");
  const fleetById = new Map(fleet.map((record) => [record.id, record]));
  const grouped = openCorrectives.reduce((acc, record) => {
    if (!acc.has(record.fleetId)) acc.set(record.fleetId, []);
    acc.get(record.fleetId).push(record);
    return acc;
  }, new Map());

  const rows = Array.from(grouped.entries())
    .map(([fleetId, records]) => {
      const fleetRecord = fleetById.get(fleetId) || {};
      const maxPriority = records.map((record) => record.priority).sort((a, b) => priorityWeight(b) - priorityWeight(a))[0] || "-";
      const maxSla = Math.max(...records.map(slaHours));
      return { fleetRecord, records, maxPriority, maxSla, stopped: records.some((record) => record.isStopped) };
    })
    .sort((a, b) => Number(b.stopped) - Number(a.stopped) || priorityWeight(b.maxPriority) - priorityWeight(a.maxPriority) || b.maxSla - a.maxSla)
    .slice(0, 50);

  body.innerHTML = rows.map((item) => `
    <tr>
      <td data-label="Equipamento">
        <div class="machine-cell">
          <strong>${escapeHtml(item.fleetRecord.equipment || "-")}</strong>
          <span>${escapeHtml(item.fleetRecord.plate || "-")}</span>
          <span>${escapeHtml(item.fleetRecord.model || "-")}</span>
        </div>
      </td>
      <td data-label="Filial">${escapeHtml(item.fleetRecord.branch || "-")}</td>
      <td data-label="Classe operacional">${escapeHtml(item.fleetRecord.operationalClass || "-")}</td>
      <td data-label="Corretivas abertas">${item.records.length}</td>
      <td data-label="Prioridade maxima">${priorityPill(item.maxPriority)}</td>
      <td data-label="SLA maior"><span class="stage-pill ${item.maxSla > 72 ? "bottleneck" : item.maxSla > 24 ? "attention" : "ok"}">${formatNumber(item.maxSla)}h</span></td>
      <td data-label="Parado">${item.stopped ? `<span class="status-pill danger">Sim</span>` : `<span class="dash-pill">Nao</span>`}</td>
    </tr>
  `).join("");

  document.querySelector(".dashboard-table-panel .table-wrap").classList.toggle("is-empty", rows.length === 0);
}

function rankingRow(label, count, total) {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return `
    <div class="ranking-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${percent}% do total filtrado</span>
        <div class="mini-bar" aria-hidden="true"><i style="width:${percent}%"></i></div>
      </div>
      <b>${count}</b>
    </div>
  `;
}

function syncBranchFilter() {
  const currentValue = branchFilterSelect.value;
  const branches = Object.keys(countBy(fleetRecords, "branch")).sort((a, b) => naturalSort(a, b));
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

function countBy(records, field) {
  return records.reduce((acc, record) => {
    const label = record[field] || "Sem informacao";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function slaHours(record) {
  const start = parseDate(record.openedAt);
  const end = record.finishedAt ? parseDate(record.finishedAt) : new Date();
  if (!start || !end) return 0;
  return Math.max(0, Math.round(((end - start) / 3600000) * 10) / 10);
}

function correctiveGoal(priority) {
  if (priority === "Critica") return 4;
  if (priority === "Alta") return 12;
  return 24;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function priorityWeight(priority) {
  return { Critica: 4, Alta: 3, Media: 2, Baixa: 1 }[priority] || 0;
}

function priorityPill(priority) {
  const cls = priority === "Critica" ? "critical" : priority === "Alta" ? "high" : priority === "Media" ? "medium" : "low";
  return `<span class="priority-pill ${cls}">${escapeHtml(priority)}</span>`;
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

function normalizeFilter(value) {
  return String(value || "sem-informacao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function naturalSort(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
