import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let auth = null;
let currentUser = null;

const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");

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

function initFirebase() {
  const config = window.MULTILIXO_FIREBASE_CONFIG;
  if (!config || !config.projectId) {
    setAuthStatus("Firebase nao configurado.", "warning");
    updateAuthUi();
    return;
  }

  const app = initializeApp(config);
  auth = getAuth(app);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUi();
    setAuthStatus(user ? `Conectado como ${user.email}.` : "Aguardando login.");
  });
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
  if (code.includes("too-many-requests")) return "muitas tentativas. Aguarde e tente novamente.";
  return error.message || "erro desconhecido.";
}
