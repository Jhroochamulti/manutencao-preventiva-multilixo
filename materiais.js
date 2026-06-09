const FLEET_COLLECTION = "fleet";
const MATERIAL_COLLECTION = "materials";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let fleetRecords = [];
let materials = [];
let selectedFleet = null;
let searchTerm = "";
let statusFilter = "open";
let typeFilter = "all";

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const form = document.querySelector("#materialForm");
const formTitle = document.querySelector("#formTitle");
const fleetOptions = document.querySelector("#fleetOptions");
const equipmentSearch = document.querySelector("#equipmentSearch");
const fleetLookupStatus = document.querySelector("#fleetLookupStatus");
const tableBody = document.querySelector("#materialTableBody");
const tableWrap = document.querySelector(".corrective-list-panel .table-wrap");
const rowTemplate = document.querySelector("#materialRowTemplate");
const saveButton = document.querySelector("#saveMaterialButton");

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
    const id = document.querySelector("#materialId").value;
    if (id) {
      await updateDoc(doc(db, MATERIAL_COLLECTION, id), { ...record, updatedAt: serverTimestamp(), updatedBy: currentUser.email });
    } else {
      await addDoc(collection(db, MATERIAL_COLLECTION), {
        ...record,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.email,
        updatedBy: currentUser.email
      });
    }
    resetForm();
    await loadMaterials();
  } catch (error) {
    alert(`Nao foi possivel salvar o material: ${error.message}`);
  } finally {
    updateAuthUi();
  }
});

document.querySelector("#resetFormButton").addEventListener("click", resetForm);
document.querySelector("#materialSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});
document.querySelector("#materialStatusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  render();
});
document.querySelector("#maintenanceTypeFilter").addEventListener("change", (event) => {
  typeFilter = event.target.value;
  render();
});

function initDefaults() {
  document.querySelector("#requestedAt").value = todayValue();
}

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
      setAuthStatus(`Conectado como ${user.email}. Carregando dados...`);
      await loadFleet();
      await loadMaterials();
      setAuthStatus(`Dados carregados: ${fleetRecords.length} ativos e ${materials.length} material(is).`);
    } else {
      fleetRecords = [];
      materials = [];
      selectedFleet = null;
      populateFleetOptions();
      render();
      setAuthStatus("Aguardando login.");
    }
  });
}

async function loadFleet() {
  const snapshot = await getDocs(collection(db, FLEET_COLLECTION));
  fleetRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((record) => record.active !== false);
  populateFleetOptions();
}

async function loadMaterials() {
  const snapshot = await getDocs(collection(db, MATERIAL_COLLECTION));
  materials = snapshot.docs.map((item) => normalizeMaterial(item.id, item.data()));
  render();
}

function populateFleetOptions() {
  fleetOptions.innerHTML = fleetRecords.map((record) => {
    const label = [record.equipment, record.plate, record.model, record.branch].filter(Boolean).join(" - ");
    return `<option value="${escapeHtml(record.equipment || record.id)}">${escapeHtml(label)}</option>`;
  }).join("");
  fleetLookupStatus.textContent = fleetRecords.length ? `${fleetRecords.length} ativo(s) disponiveis para vincular materiais.` : "Entre para carregar a frota.";
}

function findFleet(value) {
  const query = normalizeSearch(value);
  if (!query) return null;
  return fleetRecords.find((record) => normalizeSearch(record.equipment) === query || normalizeSearch(record.plate) === query) ||
    fleetRecords.find((record) => normalizeSearch([record.equipment, record.plate, record.model].join(" ")).includes(query)) ||
    null;
}

function fillFleetFields(record, showMissing = false) {
  document.querySelector("#plate").value = record ? record.plate || "" : "";
  document.querySelector("#branch").value = record ? record.branch || "" : "";
  if (record) {
    fleetLookupStatus.textContent = `${record.equipment} - ${record.plate || "sem placa"} - ${record.model || "sem modelo"}`;
  } else if (showMissing) {
    fleetLookupStatus.textContent = "Equipamento nao encontrado na frota carregada.";
  }
}

function buildRecordFromForm() {
  return {
    fleetId: selectedFleet.id,
    equipment: selectedFleet.equipment || selectedFleet.id,
    plate: selectedFleet.plate || "",
    branch: selectedFleet.branch || "",
    model: selectedFleet.model || "",
    operationalClass: selectedFleet.operationalClass || "",
    category: selectedFleet.category || "",
    material: valueOf("#materialName"),
    quantity: Number(valueOf("#quantity")) || 0,
    unit: valueOf("#unit"),
    maintenanceType: valueOf("#maintenanceType"),
    status: valueOf("#status"),
    requestedAt: valueOf("#requestedAt"),
    availableAt: valueOf("#availableAt"),
    pickedUpAt: valueOf("#pickedUpAt"),
    supplier: valueOf("#supplier"),
    notes: valueOf("#notes")
  };
}

function normalizeMaterial(id, data) {
  return {
    id,
    fleetId: data.fleetId || "",
    equipment: data.equipment || "",
    plate: data.plate || "",
    branch: data.branch || "",
    model: data.model || "",
    operationalClass: data.operationalClass || "",
    category: data.category || "",
    material: data.material || "",
    quantity: Number(data.quantity) || 0,
    unit: data.unit || "un",
    maintenanceType: data.maintenanceType || "Preventiva",
    status: data.status || "Solicitado",
    requestedAt: data.requestedAt || "",
    availableAt: data.availableAt || "",
    pickedUpAt: data.pickedUpAt || "",
    supplier: data.supplier || "",
    notes: data.notes || ""
  };
}

function filteredMaterials() {
  return materials.filter((record) => {
    const isOpen = !["Retirado", "Cancelado"].includes(record.status);
    const haystack = [record.equipment, record.plate, record.branch, record.model, record.operationalClass, record.material, record.status, record.supplier, record.notes].join(" ").toLowerCase();
    return (!searchTerm || haystack.includes(searchTerm)) &&
      (statusFilter === "all" || (statusFilter === "open" ? isOpen : record.status === statusFilter)) &&
      (typeFilter === "all" || record.maintenanceType === typeFilter);
  }).sort((a, b) => leadDays(b) - leadDays(a));
}

function render() {
  renderMetrics();
  renderTable(filteredMaterials());
}

function renderMetrics() {
  const open = materials.filter((record) => !["Retirado", "Cancelado"].includes(record.status));
  const waiting = open.filter((record) => record.status === "Solicitado");
  const available = open.filter((record) => record.status === "Disponivel");
  const average = open.length ? open.reduce((sum, record) => sum + leadDays(record), 0) / open.length : 0;
  document.querySelector("#openMaterials").textContent = open.length;
  document.querySelector("#waitingMaterials").textContent = waiting.length;
  document.querySelector("#availableMaterials").textContent = available.length;
  document.querySelector("#avgMaterialLead").textContent = `${formatNumber(average)}d`;
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  tableWrap.classList.toggle("is-empty", rows.length === 0);
  rows.forEach((record) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const cells = row.querySelectorAll("td");
    cells[0].innerHTML = `<div class="machine-cell"><strong>${escapeHtml(record.equipment)}</strong><span>${escapeHtml(record.plate || "-")}</span><span>${escapeHtml(record.branch || "-")}</span></div>`;
    cells[1].innerHTML = `<strong>${escapeHtml(record.material)}</strong><span class="subtle">${formatQuantity(record)} - ${escapeHtml(record.maintenanceType)}</span>`;
    cells[2].innerHTML = materialStatusPill(record.status);
    cells[3].textContent = formatDate(record.requestedAt);
    cells[4].textContent = formatDate(record.availableAt);
    cells[5].textContent = formatDate(record.pickedUpAt);
    cells[6].innerHTML = `<span class="stage-pill ${leadClass(record)}">${formatNumber(leadDays(record))}d</span>`;
    cells[7].innerHTML = `<div class="general-row-actions"><button class="table-action" type="button" data-action="edit" data-id="${record.id}">Editar</button><button class="table-action delete" type="button" data-action="delete" data-id="${record.id}">Excluir</button></div>`;
    tableBody.appendChild(row);
  });
  tableBody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "edit") editMaterial(button.dataset.id);
      if (button.dataset.action === "delete") deleteMaterial(button.dataset.id);
    });
  });
}

function editMaterial(id) {
  const record = materials.find((item) => item.id === id);
  if (!record) return;
  selectedFleet = fleetRecords.find((item) => item.id === record.fleetId) || null;
  document.querySelector("#materialId").value = record.id;
  equipmentSearch.value = record.equipment;
  fillFleetFields(selectedFleet || record);
  setValue("#materialName", record.material);
  setValue("#quantity", record.quantity || "");
  setValue("#unit", record.unit);
  setValue("#maintenanceType", record.maintenanceType);
  setValue("#status", record.status);
  setValue("#requestedAt", record.requestedAt);
  setValue("#availableAt", record.availableAt);
  setValue("#pickedUpAt", record.pickedUpAt);
  setValue("#supplier", record.supplier);
  setValue("#notes", record.notes);
  formTitle.textContent = "Editar material";
  document.querySelector(".corrective-form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteMaterial(id) {
  if (!confirm("Excluir esta solicitacao de material?")) return;
  await deleteDoc(doc(db, MATERIAL_COLLECTION, id));
  await loadMaterials();
}

function resetForm() {
  form.reset();
  document.querySelector("#materialId").value = "";
  selectedFleet = null;
  fillFleetFields(null);
  document.querySelector("#requestedAt").value = todayValue();
  formTitle.textContent = "Material";
}

function updateAuthUi() {
  const signed = Boolean(currentUser);
  logoutButton.hidden = !signed;
  loginForm.classList.toggle("signed", signed);
  loginEmail.disabled = signed;
  loginPassword.disabled = signed;
  saveButton.disabled = !signed;
}

function materialStatusPill(status) {
  const cls = { Solicitado: "waiting", Disponivel: "picked", Retirado: "done", Cancelado: "cancelled" }[status] || "waiting";
  return `<span class="status-pill ${cls}">${escapeHtml(status)}</span>`;
}

function leadDays(record) {
  const end = record.pickedUpAt || record.availableAt || todayValue();
  return daysBetween(record.requestedAt, end) || 0;
}

function leadClass(record) {
  const days = leadDays(record);
  if (record.status === "Retirado") return days <= 2 ? "ok" : "attention";
  if (days <= 1) return "ok";
  if (days <= 3) return "attention";
  return "bottleneck";
}

function daysBetween(start, end) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}

function toDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(toDate(value));
}

function formatQuantity(record) {
  if (!record.quantity) return escapeHtml(record.unit || "un");
  return `${formatNumber(record.quantity)} ${escapeHtml(record.unit || "un")}`;
}

function valueOf(selector) {
  return document.querySelector(selector).value.trim();
}

function setValue(selector, value) {
  document.querySelector(selector).value = value || "";
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
