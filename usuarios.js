const USERS_COLLECTION = "users";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let users = [];
let searchTerm = "";
let roleFilter = "all";
let statusFilter = "active";

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const userForm = document.querySelector("#userForm");
const tableBody = document.querySelector("#usersTableBody");
const tableWrap = document.querySelector(".users-list-panel .table-wrap");
const rowTemplate = document.querySelector("#userRowTemplate");
const saveUserButton = document.querySelector("#saveUserButton");

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

  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveUserProfile();
  });

  document.querySelector("#clearUserFormButton").addEventListener("click", resetForm);
  document.querySelector("#userSearch").addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });
  document.querySelector("#roleFilter").addEventListener("change", (event) => {
    roleFilter = event.target.value;
    render();
  });
  document.querySelector("#userStatusFilter").addEventListener("change", (event) => {
    statusFilter = event.target.value;
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
      setAuthStatus(`Conectado como ${user.email}. Carregando usuários...`);
      await loadUsers();
      ensureCurrentUserDraft();
      if (users.length) setAuthStatus(`Usuários carregados: ${users.length} perfil(is) cadastrado(s).`);
    } else {
      users = [];
      setAuthStatus("Aguardando login.");
      resetForm();
      render();
    }
  });
}

async function loadUsers() {
  if (!db || !currentUser) return;
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));
  users = snapshot.docs.map((item) => normalizeUser(item.id, item.data())).sort((a, b) => naturalSort(a.name, b.name));
  render();
}

function ensureCurrentUserDraft() {
  const exists = users.some((user) => normalizeEmail(user.email) === normalizeEmail(currentUser.email));
  if (exists || users.length) return;

  document.querySelector("#userName").value = currentUser.email.split("@")[0];
  document.querySelector("#userEmail").value = currentUser.email;
  document.querySelector("#userRole").value = "admin";
  document.querySelector("#userActiveSelect").value = "true";
  document.querySelector("#userBranches").value = "Todas";
  setAuthStatus("Nenhum perfil encontrado. Salve seu usuário como administrador inicial.");
}

async function saveUserProfile() {
  if (!db || !currentUser) {
    alert("Entre antes de salvar um perfil.");
    return;
  }

  const id = document.querySelector("#userDocId").value || normalizeEmail(document.querySelector("#userEmail").value);
  const record = {
    name: document.querySelector("#userName").value.trim(),
    email: document.querySelector("#userEmail").value.trim(),
    role: document.querySelector("#userRole").value,
    branches: parseBranches(document.querySelector("#userBranches").value),
    active: document.querySelector("#userActiveSelect").value === "true",
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.email
  };

  if (!record.name || !record.email) {
    alert("Informe nome e e-mail do usuário.");
    return;
  }

  const existing = users.find((user) => user.id === id);
  await setDoc(doc(db, USERS_COLLECTION, id), {
    ...record,
    createdAt: existing && existing.createdAt ? existing.createdAt : serverTimestamp(),
    createdBy: existing && existing.createdBy ? existing.createdBy : currentUser.email
  }, { merge: true });

  setAuthStatus("Perfil salvo. Atualizando lista...");
  resetForm();
  await loadUsers();
}

async function removeUser(id) {
  const user = users.find((item) => item.id === id);
  if (!user) return;
  const confirmed = confirm(`Excluir o perfil de ${user.name || user.email}? A conta no Firebase Authentication não será removida.`);
  if (!confirmed) return;

  await deleteDoc(doc(db, USERS_COLLECTION, id));
  setAuthStatus("Perfil excluido. Atualizando lista...");
  await loadUsers();
}

function editUser(id) {
  const user = users.find((item) => item.id === id);
  if (!user) return;

  document.querySelector("#userDocId").value = user.id;
  document.querySelector("#userName").value = user.name || "";
  document.querySelector("#userEmail").value = user.email || "";
  document.querySelector("#userRole").value = user.role || "manutencao";
  document.querySelector("#userActiveSelect").value = user.active === false ? "false" : "true";
  document.querySelector("#userBranches").value = Array.isArray(user.branches) ? user.branches.join(", ") : "";
  document.querySelector("#userName").focus();
}

function resetForm() {
  userForm.reset();
  document.querySelector("#userDocId").value = "";
  document.querySelector("#userRole").value = "admin";
  document.querySelector("#userActiveSelect").value = "true";
}

function filteredUsers() {
  return users.filter((user) => {
    const activeStatus = user.active === false ? "inactive" : "active";
    const haystack = [
      user.name,
      user.email,
      user.role,
      roleLabel(user.role),
      ...(Array.isArray(user.branches) ? user.branches : [])
    ].join(" ").toLowerCase();

    return (!searchTerm || haystack.includes(searchTerm)) &&
      (roleFilter === "all" || user.role === roleFilter) &&
      (statusFilter === "all" || activeStatus === statusFilter);
  });
}

function render() {
  renderMetrics();
  renderTable(filteredUsers());
}

function renderMetrics() {
  const active = users.filter((user) => user.active !== false);
  document.querySelector("#userTotal").textContent = users.length;
  document.querySelector("#userActive").textContent = active.length;
  document.querySelector("#userAdmins").textContent = active.filter((user) => user.role === "admin").length;
  document.querySelector("#userReaders").textContent = active.filter((user) => user.role === "diretoria").length;
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  tableWrap.classList.toggle("is-empty", rows.length === 0);

  const emptyTitle = tableWrap.querySelector(".empty-state strong");
  const emptyText = tableWrap.querySelector(".empty-state p");
  emptyTitle.textContent = currentUser ? "Nenhum usuário encontrado" : "Entre para carregar os usuários";
  emptyText.textContent = currentUser ? "Ajuste os filtros ou cadastre um novo perfil de acesso." : "Os perfis de acesso serao exibidos apos o login.";

  rows.forEach((user) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const cells = row.querySelectorAll("td");
    cells[0].innerHTML = `<strong>${escapeHtml(user.name || "-")}</strong>`;
    cells[1].textContent = user.email || "-";
    cells[2].innerHTML = `<span class="status-pill ${roleClass(user.role)}">${escapeHtml(roleLabel(user.role))}</span>`;
    cells[3].textContent = formatBranches(user.branches);
    cells[4].innerHTML = user.active === false ? `<span class="status-pill danger">Inativo</span>` : `<span class="status-pill success">Ativo</span>`;
    cells[5].innerHTML = `
      <button class="table-action" type="button" data-action="edit" data-id="${escapeHtml(user.id)}">Editar</button>
      <button class="table-action delete" type="button" data-action="delete" data-id="${escapeHtml(user.id)}">Excluir</button>
    `;
    tableBody.appendChild(row);
  });

  tableBody.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => editUser(button.dataset.id));
  });
  tableBody.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", () => removeUser(button.dataset.id));
  });
}

function normalizeUser(id, data) {
  return {
    id,
    name: data.name || "",
    email: data.email || id,
    role: data.role || "manutencao",
    branches: Array.isArray(data.branches) ? data.branches : [],
    active: data.active !== false,
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || ""
  };
}

function parseBranches(value) {
  const branches = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return branches.length ? branches : ["Todas"];
}

function formatBranches(branches) {
  if (!Array.isArray(branches) || !branches.length) return "Todas";
  return branches.join(", ");
}

function roleLabel(role) {
  const labels = {
    admin: "Administrador",
    planejamento: "Planejamento",
    almoxarifado: "Almoxarifado",
    manutencao: "Manutenção",
    diretoria: "Diretoria"
  };
  return labels[role] || "Manutenção";
}

function roleClass(role) {
  if (role === "admin") return "maquina";
  if (role === "diretoria") return "caminhao";
  if (role === "almoxarifado") return "utilitario";
  return "success";
}

function updateAuthUi() {
  const signed = Boolean(currentUser);
  logoutButton.hidden = !signed;
  loginForm.classList.toggle("signed", signed);
  loginEmail.disabled = signed;
  loginPassword.disabled = signed;
  saveUserButton.disabled = !signed;
}

function setAuthStatus(text, state = "") {
  authStatus.textContent = text;
  authStatus.dataset.state = state;
}

function friendlyAuthError(error) {
  const code = error && error.code ? error.code : "";
  if (code.includes("invalid-credential")) return "e-mail ou senha invalidos.";
  if (code.includes("user-not-found")) return "usuário não encontrado.";
  if (code.includes("wrong-password")) return "senha invalida.";
  if (code.includes("too-many-requests")) return "muitas tentativas. Aguarde e tente novamente.";
  return error.message || "erro desconhecido.";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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
