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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let fleetRecords = [];
let correctives = [];
let selectedFleet = null;
let searchTerm = "";
let statusFilter = "open";
let priorityFilter = "all";

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const form = document.querySelector("#correctiveForm");
const formTitle = document.querySelector("#formTitle");
const fleetOptions = document.querySelector("#fleetOptions");
const equipmentSearch = document.querySelector("#equipmentSearch");
const fleetLookupStatus = document.querySelector("#fleetLookupStatus");
const tableBody = document.querySelector("#correctiveTableBody");
const tableWrap = document.querySelector(".corrective-list-panel .table-wrap");
const rowTemplate = document.querySelector("#correctiveRowTemplate");
const saveButton = document.querySelector("#saveCorrectiveButton");

initDefaults();
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

equipmentSearch.addEventListener("input", () => {
  selectedFleet = findFleet(equipmentSearch.value);
  fillFleetFields(selectedFleet);
});

equipmentSearch.addEventListener("blur", () => {
  selectedFleet = findFleet(equipmentSearch.value);
  fillFleetFields(selectedFleet, true);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) {
    alert("Entre com seu usuario antes de salvar.");
    return;
  }

  const record = buildRecordFromForm();
  if (!record.fleetId) {
    alert("Selecione um equipamento valido da frota.");
    return;
  }

  try {
    saveButton.disabled = true;
    const id = document.querySelector("#correctiveId").value;

    if (id) {
      await updateDoc(doc(db, CORRECTIVE_COLLECTION, id), {
        ...record,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email
      });
    } else {
      await addDoc(collection(db, CORRECTIVE_COLLECTION), {
        ...record,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.email,
        updatedBy: currentUser.email
      });
    }

    resetForm();
    await loadCorrectives();
  } catch (error) {
    alert(`Nao foi possivel salvar a corretiva: ${error.message}`);
  } finally {
    updateAuthUi();
  }
});

document.querySelector("#resetFormButton").addEventListener("click", resetForm);

document.querySelector("#correctiveSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#correctiveStatusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  render();
});

document.querySelector("#correctivePriorityFilter").addEventListener("change", (event) => {
  priorityFilter = event.target.value;
  render();
});

function initDefaults() {
  document.querySelector("#openedAt").value = localDateTimeValue(new Date());
}

function initFirebase() {
  const config = window.MULTILIXO_FIREBASE_CONFIG;

  if (!config || !config.projectId) {
    setAuthStatus("Firebase nao configurado.", "warning");
    updateAuthUi();
    return;
  }

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUi();

    if (user) {
      setAuthStatus(`Conectado como ${user.email}. Carregando dados...`);
      await loadFleet();
      await loadCorrectives();
      setAuthStatus(`Dados carregados: ${fleetRecords.length} ativos e ${correctives.length} corretiva(s).`);
    } else {
      fleetRecords = [];
      correctives = [];
      selectedFleet = null;
      populateFleetOptions();
      render();
      setAuthStatus("Aguardando login.");
    }
  });
}

async function loadFleet() {
  const snapshot = await getDocs(collection(db, FLEET_COLLECTION));
  fleetRecords = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((record) => record.active !== false)
    .sort((a, b) => naturalSort(a.equipment, b.equipment));
  populateFleetOptions();
}

async function loadCorrectives() {
  const snapshot = await getDocs(collection(db, CORRECTIVE_COLLECTION));
  correctives = snapshot.docs.map((item) => normalizeCorrective(item.id, item.data()));
  render();
}

function populateFleetOptions() {
  fleetOptions.innerHTML = fleetRecords
    .map((record) => {
      const label = [record.equipment, record.plate, record.model, record.branch].filter(Boolean).join(" - ");
      return `<option value="${escapeHtml(record.equipment || record.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  fleetLookupStatus.textContent = fleetRecords.length
    ? `${fleetRecords.length} ativo(s) disponiveis para abertura de corretivas.`
    : "Entre para carregar a frota.";
}

function findFleet(value) {
  const query = normalizeSearch(value);
  if (!query) return null;

  return fleetRecords.find((record) =>
    normalizeSearch(record.equipment) === query ||
    normalizeSearch(record.plate) === query ||
    normalizeSearch(`${record.equipment} ${record.plate}`) === query
  ) || fleetRecords.find((record) =>
    normalizeSearch([record.equipment, record.plate, record.model].join(" ")).includes(query)
  ) || null;
}

function fillFleetFields(record, showMissing = false) {
  document.querySelector("#plate").value = record ? record.plate || "" : "";
  document.querySelector("#branch").value = record ? record.branch || "" : "";
  document.querySelector("#model").value = record ? record.model || "" : "";
  document.querySelector("#operationalClass").value = record ? record.operationalClass || "" : "";

  if (record) {
    fleetLookupStatus.textContent = `${record.equipment} - ${record.plate || "sem placa"} - ${record.model || "sem modelo"}`;
  } else if (showMissing) {
    fleetLookupStatus.textContent = "Equipamento nao encontrado na frota carregada.";
  }
}

function buildRecordFromForm() {
  const status = valueOf("#status");
  const finishedAt = valueOf("#finishedAt");
  return {
    fleetId: selectedFleet.id,
    equipment: selectedFleet.equipment || selectedFleet.id,
    plate: selectedFleet.plate || "",
    branch: selectedFleet.branch || "",
    model: selectedFleet.model || "",
    operationalClass: selectedFleet.operationalClass || "",
    category: selectedFleet.category || "",
    failureType: valueOf("#failureType"),
    priority: valueOf("#priority"),
    status,
    isStopped: document.querySelector("#isStopped").checked && status !== "Concluido" && status !== "Cancelado",
    openedAt: valueOf("#openedAt"),
    startedAt: valueOf("#startedAt"),
    finishedAt,
    assignedTo: valueOf("#assignedTo"),
    description: valueOf("#description"),
    notes: valueOf("#notes")
  };
}

function normalizeCorrective(id, data) {
  return {
    id,
    fleetId: data.fleetId || "",
    equipment: data.equipment || "",
    plate: data.plate || "",
    branch: data.branch || "",
    model: data.model || "",
    operationalClass: data.operationalClass || "",
    category: data.category || "",
    failureType: data.failureType || "Outro",
    priority: data.priority || "Media",
    status: data.status || "Aberto",
    isStopped: Boolean(data.isStopped),
    openedAt: data.openedAt || "",
    startedAt: data.startedAt || "",
    finishedAt: data.finishedAt || "",
    assignedTo: data.assignedTo || "",
    description: data.description || "",
    notes: data.notes || ""
  };
}

function filteredCorrectives() {
  return correctives.filter((record) => {
    const isOpen = !["Concluido", "Cancelado"].includes(record.status);
    const haystack = [
      record.equipment,
      record.plate,
      record.branch,
      record.model,
      record.operationalClass,
      record.failureType,
      record.priority,
      record.status,
      record.assignedTo,
      record.description
    ].join(" ").toLowerCase();

    return (
      (!searchTerm || haystack.includes(searchTerm)) &&
      (statusFilter === "all" || (statusFilter === "open" ? isOpen : record.status === statusFilter)) &&
      (priorityFilter === "all" || record.priority === priorityFilter)
    );
  }).sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || slaHours(b) - slaHours(a));
}

function render() {
  renderMetrics();
  renderTable(filteredCorrectives());
}

function renderMetrics() {
  const open = correctives.filter((record) => !["Concluido", "Cancelado"].includes(record.status));
  const stopped = open.filter((record) => record.isStopped);
  const critical = open.filter((record) => ["Alta", "Critica"].includes(record.priority));
  const average = open.length ? open.reduce((sum, record) => sum + slaHours(record), 0) / open.length : 0;

  document.querySelector("#openCount").textContent = open.length;
  document.querySelector("#stoppedCount").textContent = stopped.length;
  document.querySelector("#criticalCount").textContent = critical.length;
  document.querySelector("#averageSla").textContent = `${formatNumber(average)}h`;
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  tableWrap.classList.toggle("is-empty", rows.length === 0);

  rows.forEach((record) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const cells = row.querySelectorAll("td");
    cells[0].innerHTML = `
      <div class="machine-cell">
        <strong>${escapeHtml(record.equipment)}</strong>
        <span>${escapeHtml(record.plate || "-")}</span>
        <span>${escapeHtml(record.branch || "-")}</span>
      </div>
    `;
    cells[1].innerHTML = `<strong>${escapeHtml(record.failureType)}</strong><span class="subtle">${escapeHtml(record.description)}</span>`;
    cells[2].innerHTML = priorityPill(record.priority);
    cells[3].innerHTML = correctiveStatusPill(record.status);
    cells[4].textContent = formatDateTime(record.openedAt);
    cells[5].innerHTML = `<span class="stage-pill ${slaClass(record)}">${formatNumber(slaHours(record))}h</span>`;
    cells[6].innerHTML = record.isStopped ? `<span class="status-pill danger">Sim</span>` : `<span class="dash-pill">Nao</span>`;
    cells[7].innerHTML = `
      <div class="general-row-actions">
        <button class="table-action" type="button" data-action="edit" data-id="${record.id}">Editar</button>
        <button class="table-action delete" type="button" data-action="delete" data-id="${record.id}">Excluir</button>
      </div>
    `;
    tableBody.appendChild(row);
  });

  tableBody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "edit") editCorrective(button.dataset.id);
      if (button.dataset.action === "delete") deleteCorrective(button.dataset.id);
    });
  });
}

function editCorrective(id) {
  const record = correctives.find((item) => item.id === id);
  if (!record) return;

  selectedFleet = fleetRecords.find((item) => item.id === record.fleetId) || null;
  document.querySelector("#correctiveId").value = record.id;
  equipmentSearch.value = record.equipment;
  fillFleetFields(selectedFleet || record);
  setValue("#failureType", record.failureType);
  setValue("#priority", record.priority);
  setValue("#status", record.status);
  document.querySelector("#isStopped").checked = record.isStopped;
  setValue("#openedAt", record.openedAt);
  setValue("#startedAt", record.startedAt);
  setValue("#finishedAt", record.finishedAt);
  setValue("#assignedTo", record.assignedTo);
  setValue("#description", record.description);
  setValue("#notes", record.notes);
  formTitle.textContent = "Editar corretiva";
  document.querySelector(".corrective-form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteCorrective(id) {
  if (!confirm("Excluir esta corretiva?")) return;
  await deleteDoc(doc(db, CORRECTIVE_COLLECTION, id));
  await loadCorrectives();
}

function resetForm() {
  form.reset();
  document.querySelector("#correctiveId").value = "";
  selectedFleet = null;
  fillFleetFields(null);
  document.querySelector("#openedAt").value = localDateTimeValue(new Date());
  formTitle.textContent = "Corretiva";
}

function updateAuthUi() {
  const signed = Boolean(currentUser);
  logoutButton.hidden = !signed;
  loginForm.classList.toggle("signed", signed);
  loginEmail.disabled = signed;
  loginPassword.disabled = signed;
  saveButton.disabled = !signed;
}

function valueOf(selector) {
  return document.querySelector(selector).value.trim();
}

function setValue(selector, value) {
  document.querySelector(selector).value = value || "";
}

function slaHours(record) {
  const start = parseLocalDateTime(record.openedAt);
  const end = record.finishedAt ? parseLocalDateTime(record.finishedAt) : new Date();
  if (!start || !end) return 0;
  return Math.max(0, Math.round(((end - start) / 3600000) * 10) / 10);
}

function slaClass(record) {
  const hours = slaHours(record);
  if (record.priority === "Critica") return hours <= 4 ? "ok" : "bottleneck";
  if (record.priority === "Alta") return hours <= 12 ? "ok" : "bottleneck";
  if (hours <= 24) return "ok";
  if (hours <= 72) return "attention";
  return "bottleneck";
}

function priorityWeight(priority) {
  return { Critica: 4, Alta: 3, Media: 2, Baixa: 1 }[priority] || 0;
}

function priorityPill(priority) {
  const cls = priority === "Critica" ? "critical" : priority === "Alta" ? "high" : priority === "Media" ? "medium" : "low";
  return `<span class="priority-pill ${cls}">${escapeHtml(priority)}</span>`;
}

function correctiveStatusPill(status) {
  const cls = {
    Aberto: "waiting",
    "Em atendimento": "picked",
    "Aguardando peca": "waiting",
    Concluido: "done",
    Cancelado: "cancelled"
  }[status] || "waiting";
  return `<span class="status-pill ${cls}">${escapeHtml(status)}</span>`;
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateTimeValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value) {
  const date = parseLocalDateTime(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeSearch(value) {
  return String(value || "")
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
