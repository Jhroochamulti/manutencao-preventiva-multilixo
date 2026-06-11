import { XLSX } from "./xlsx.full.min.js?v=3";

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
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const config = window.MULTILIXO_FIREBASE_CONFIG;
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const COLLECTIONS = {
  fleet: "fleet",
  preventives: "preventives",
  correctives: "correctives",
  materials: "materials"
};

const PREVENTIVE_PANEL_URL_KEY = "multilixo-painel-preventivas-csv-url";
const DEFAULT_PREVENTIVE_PANEL_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGJVksDnMpL3Gb0NJ6WGyFerN3RYvGSnll8J8HGVEyoIT5nqsOjLJ8hTiLogwI2cWfT6vmfi8ZZP0W/pub?output=csv";

const GOALS = {
  preventiveTotalDays: 2.5,
  materialLeadDays: 1,
  correctiveHours: {
    Critica: 4,
    Alta: 12,
    Media: 24,
    Baixa: 72
  }
};

const FILTER_STORAGE_KEY = "multilixo-sistema-filtros-v2";
const LEGACY_MECHANICAL_FILTERS = ["Caminhões", "Máquinas", "Equipamentos Florestais", "Veículos Leves", "Implementos", "Outros"];

const titles = {
  dashboard: "Painel geral da manutenção",
  frota: "Frota",
  preventivas: "Preventivas",
  "painel-preventivas": "Painel das preventivas",
  corretivas: "Corretivas",
  materiais: "Materiais",
  mtr: "Painel VTR / MTR",
  sla: "SLA",
  relatorios: "Relatórios"
};

const state = {
  user: null,
  route: "dashboard",
  fleet: [],
  preventives: [],
  correctives: [],
  materials: [],
  filters: loadStoredFilters(),
  preventivePanel: {
    sheetUrl: localStorage.getItem(PREVENTIVE_PANEL_URL_KEY) || DEFAULT_PREVENTIVE_PANEL_URL,
    rows: [],
    summary: {},
    loading: false,
    loaded: false,
    error: "",
    filters: {
      query: "",
      status: "all",
      branch: "all",
      mechanicalClass: "all",
      operationalClass: "all",
      priority: "all",
      serviceType: "all",
      periodStart: "",
      periodEnd: ""
    }
  },
  loading: true,
  error: ""
};

const view = document.querySelector("#view");
const pageTitle = document.querySelector("#pageTitle");
const syncStatus = document.querySelector("#syncStatus");
const loginPanel = document.querySelector("#loginPanel");
const userEmail = document.querySelector("#userEmail");
const toast = document.querySelector("#toast");
let unsubscribers = [];
let renderTimer = 0;
let pendingFocus = null;

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#loginMessage");
  message.textContent = "";
  try {
    await signInWithEmailAndPassword(
      auth,
      document.querySelector("#loginEmail").value.trim(),
      document.querySelector("#loginPassword").value
    );
    document.querySelector("#loginPassword").value = "";
  } catch (error) {
    message.textContent = "Não foi possível entrar. Confira o e-mail e a senha.";
  }
});

document.querySelector("#logoutButton").addEventListener("click", () => signOut(auth));
document.querySelector("#refreshButton").addEventListener("click", render);
window.addEventListener("hashchange", setRouteFromHash);
view.addEventListener("click", handleClick);
view.addEventListener("input", handleInput);
view.addEventListener("change", handleChange);

onAuthStateChanged(auth, (user) => {
  state.user = user;
  loginPanel.classList.toggle("show", !user);
  userEmail.textContent = user ? user.email : "Aguardando login";
  stopListeners();
  if (user) startListeners();
  render();
});

setRouteFromHash();

function startListeners() {
  state.loading = true;
  state.error = "";
  syncStatus.textContent = "Sincronizando Firebase...";
  syncStatus.dataset.state = "loading";
  const listen = (name) => {
    const source = collection(db, COLLECTIONS[name]);
    const unsub = onSnapshot(source, (snapshot) => {
      state[name] = snapshot.docs
        .map((item) => normalizeRecord(name, item.id, item.data()))
        .sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
      state.loading = false;
      state.error = "";
      syncStatus.textContent = `Online - ${countAll()} registros`;
      syncStatus.dataset.state = "online";
      scheduleRender();
    }, () => {
      state.loading = false;
      state.error = "Não foi possível sincronizar os dados. Verifique a conexão e as permissões.";
      syncStatus.textContent = "Falha ao sincronizar";
      syncStatus.dataset.state = "error";
      scheduleRender();
    });
    unsubscribers.push(unsub);
  };

  listen("fleet");
  listen("preventives");
  listen("correctives");
  listen("materials");
}

function stopListeners() {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  state.loading = false;
}

function setRouteFromHash() {
  state.route = (location.hash || "#dashboard").replace("#", "") || "dashboard";
  if (!titles[state.route]) state.route = "dashboard";
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route);
  });
  render();
}

function render() {
  pageTitle.textContent = titles[state.route] || titles.dashboard;
  if (!state.user) {
    view.innerHTML = "";
    return;
  }
  if (state.error) {
    view.innerHTML = `<section class="card card-pad state-panel danger"><h2>Erro de sincronização</h2><p>${esc(state.error)}</p><button class="ghost-button" type="button" data-action="refreshView">Tentar novamente</button></section>`;
    return;
  }
  if (state.loading && !countAll()) {
    view.innerHTML = loadingState();
    return;
  }
  const routes = {
    dashboard: renderDashboard,
    frota: renderFleet,
    preventivas: renderPreventives,
    "painel-preventivas": renderPreventivePanel,
    corretivas: renderCorrectives,
    materiais: renderMaterials,
    mtr: renderMtr,
    sla: renderSla,
    relatorios: renderReports
  };
  view.innerHTML = routes[state.route]();
  bindRenderedForms();
  restoreFocus();
}

function bindRenderedForms() {
  const forms = view.querySelectorAll("#fleetImportForm, #preventiveForm, #correctiveForm, #materialForm");
  forms.forEach((form) => {
    form.addEventListener("submit", handleSubmit);
    const saveButton = form.querySelector("[data-action='saveMaintenance']");
    if (saveButton) {
      saveButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await submitMaintenanceForm(form);
      });
    }
    form.querySelector("[data-action='importFleet']")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await withFormLock(form, () => importFleet(form));
    });
  });
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 80);
}

function restoreFocus() {
  if (!pendingFocus) return;
  const target = view.querySelector(`[data-filter-scope="${pendingFocus.scope}"] [data-filter-field="${pendingFocus.field}"]`);
  if (target) {
    target.focus();
    if (target.type === "search" || target.tagName === "INPUT") {
      const position = target.value.length;
      target.setSelectionRange(position, position);
    }
  }
  pendingFocus = null;
}

function loadingState() {
  return `
    <section class="grid kpi-grid">
      ${["Carregando frota", "Carregando preventivas", "Carregando corretivas", "Carregando materiais"].map((label) => `
        <article class="card kpi skeleton"><span>${label}</span><strong>--</strong><small>Sincronizando Firebase</small></article>
      `).join("")}
    </section>
  `;
}

function renderDashboard() {
  const metrics = buildDashboardMetrics();
  const maintenanceRows = [
    ...metrics.preventives.map((item) => ({ ...item, dashboardKind: "preventive" })),
    ...metrics.correctives.map((item) => ({ ...item, dashboardKind: "corrective" }))
  ];

  return `
    ${executiveKpis(maintenanceRows, (item) => {
      if (item.dashboardKind === "corrective") return isOpen(item) && correctiveSlaLevel(item) === "danger";
      return isOpen(item) && preventiveTotalDays(item) > GOALS.preventiveTotalDays;
    })}
    <section class="grid kpi-grid">
      ${kpi("Total de manutenções", metrics.totalMaintenances, `${metrics.openMaintenances} em aberto`, "accent")}
      ${kpi("Preventivas", metrics.preventives.length, `${metrics.openPreventives.length} em andamento`, "purple")}
      ${kpi("Corretivas", metrics.correctives.length, `${metrics.stopped.length} equipamento(s) parado(s)`, "orange")}
      ${kpi("Atrasadas", metrics.overdue.length, `${metrics.onTime.length} dentro do prazo`, "danger")}
    </section>
    <section class="grid kpi-grid" style="margin-top:16px">
      ${kpi("Gargalo médio", `${fmt(metrics.averageBottleneckHours)}h`, "Média dos itens acima da meta", "danger")}
      ${kpi("Maior gargalo atual", metrics.biggestBottleneck?.time || "0h", metrics.biggestBottleneck?.label || "Sem gargalo ativo", "orange")}
      ${kpi("Equipamentos críticos", metrics.criticalEquipments.length, "Parados, críticos ou acima da meta", "purple")}
      ${kpi("Materiais pendentes", metrics.pendingMaterials.length, `${metrics.awaitingPartsStopped} parado(s) aguardando peças`, "accent")}
    </section>
    <section class="grid dashboard-table-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>VTR e MTR</h2>
        ${renderBars([
          ["VTR - caminhões", metrics.stopped.filter((item) => categoryOfFleet(item.fleetId) === "caminhao").length, "danger"],
          ["MTR - máquinas", metrics.stopped.filter((item) => categoryOfFleet(item.fleetId) === "maquina").length, "orange"],
          ["Outros ativos", metrics.stopped.filter((item) => !["caminhao", "maquina"].includes(categoryOfFleet(item.fleetId))).length, "purple"]
        ])}
      </article>
      <article class="card card-pad">
        <h2>Gargalo médio por etapa</h2>
        ${renderBars(stageBottleneckRows().map((item) => [item.label, item.value, item.level]))}
      </article>
    </section>
    <section class="grid dashboard-table-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Maiores gargalos atuais</h2>
        ${table(["Equipamento", "Tipo", "Status", "Tempo"], topBottlenecks().map((item) => [
          fleetLabel(item.ref),
          item.kind,
          pill(item.status || "-", item.level),
          item.time
        ]))}
      </article>
      <article class="card card-pad">
        <h2>Equipamentos críticos</h2>
        ${table(["Equipamento", "Motivo", "Impacto"], metrics.criticalEquipments.slice(0, 8).map((item) => [
          fleetLabel(item.ref),
          item.reason,
          pill(item.impact, item.level)
        ]))}
      </article>
    </section>
  `;
}

function renderFleet() {
  const filteredFleet = filterFleetRows(state.fleet);
  const activeFleet = filteredFleet.filter((item) => item.active !== false);
  const trucks = activeFleet.filter((item) => item.category === "caminhao");
  const machines = activeFleet.filter((item) => item.category === "maquina");
  const others = activeFleet.filter((item) => !["caminhao", "maquina"].includes(item.category));
  const filters = state.filters.fleet || {};
  return `
    ${filterCard("fleet", [
      filterInput("query", "Frota / equipamento", filters.query, "search", "Frota, placa ou equipamento"),
      filterInput("model", "Modelo", filters.model, "search", "Modelo"),
      filterInput("manufacturer", "Fabricante", filters.manufacturer, "search", "Fabricante"),
      filterSelect("mechanicalClass", "Classe mecânica", filterOptions(uniqueMechanicalClasses(), "Todas as classes mecânicas"), filters.mechanicalClass),
      filterSelect("operationalClass", "Classe operacional", filterOptions(uniqueOperationalClasses(filters.mechanicalClass), "Todas as classes operacionais"), filters.operationalClass),
      filterSelect("branch", "Filial", filterOptions(uniqueFleetValues("branch"), "Todas as filiais"), filters.branch),
      filterSelect("status", "Status", filterOptions(uniqueFleetValues("situation"), "Todos os status"), filters.status),
      filterSelect("active", "Ativo / inativo", [["all", "Todos"], ["active", "Ativos"], ["inactive", "Inativos"]], filters.active)
    ], filteredFleet.length)}
    <section class="grid two-grid">
      <article class="card card-pad">
        <h2>Importar inventário</h2>
        <form id="fleetImportForm" class="grid">
          <label class="full">Arquivo Excel ou CSV
            <input id="fleetFile" type="file" accept=".xlsx,.xls,.csv" required />
          </label>
          <p class="muted">Colunas esperadas: Equipamento, Placa, Filial, Ano Modelo, Modelo, Fabricante, Classe Mecânica e Classe Operacional.</p>
          <button class="primary-button" type="button" data-action="importFleet">Atualizar frota</button>
        </form>
      </article>
      <section class="fleet-summary">
        <h2>Resumo da frota</h2>
        <section class="grid kpi-grid">
          ${kpi("Ativos", activeFleet.length, "Base online", "accent")}
          ${kpi("Caminhões", trucks.length, "Base VTR", "purple")}
          ${kpi("Máquinas", machines.length, "Base MTR", "orange")}
          ${kpi("Inativos", filteredFleet.filter((item) => item.active === false).length, "Fora da base atual", "danger")}
        </section>
      </section>
    </section>
    <section class="grid two-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Caminhões por classe operacional</h2>
        ${fleetBars(trucks, "operationalClass", "purple")}
      </article>
      <article class="card card-pad">
        <h2>Máquinas por classe operacional</h2>
        ${fleetBars(machines, "operationalClass", "orange")}
      </article>
    </section>
    <section class="grid two-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Caminhões por filial</h2>
        ${fleetBars(trucks, "branch", "purple")}
      </article>
      <article class="card card-pad">
        <h2>Máquinas por filial</h2>
        ${fleetBars(machines, "branch", "orange")}
      </article>
    </section>
    <section class="card card-pad" style="margin-top:16px">
      <h2>Outros ativos</h2>
      ${renderBars([
        ["Utilitários e leves", others.filter((item) => item.category === "utilitario").length, "purple"],
        ["Geradores", others.filter((item) => item.category === "gerador").length, "orange"],
        ["Não classificados", others.filter((item) => item.category === "outro").length, "danger"]
      ])}
    </section>
  `;
}

function renderPreventives() {
  const rows = filterRecords("preventives", state.preventives);
  return `
    ${executiveKpis(rows, (item) => isOpen(item) && preventiveTotalDays(item) > GOALS.preventiveTotalDays)}
    ${crudLayout("preventiveForm", "Nova preventiva", preventiveForm(), "Preventivas cadastradas", preventiveRows(), operationalFilters("preventives", [
    ["all", "Todos os status"],
    ["Aguardando material", "Aguardando material"],
    ["Material disponivel", "Material disponivel"],
    ["Material retirado", "Material retirado"],
    ["Executada", "Executada"],
    ["Cancelada", "Cancelada"]
  ], [], rows.length))}
  `;
}

function renderPreventivePanel() {
  ensurePreventivePanelLoaded();
  const panel = state.preventivePanel;
  const rows = preventivePanelVisibleRows();
  const metrics = preventivePanelMetrics(rows);
  const branches = preventivePanelBranches();
  const statuses = preventivePanelStatuses();
  const priorities = preventivePanelUniqueValues(["Prioridade"]);
  const serviceTypes = preventivePanelUniqueValues(["Tipo Preventiva", "Tipo de preventiva", "Tipo"]);
  const mechanicalClasses = preventivePanelUniqueValues(["Classe Mecânica", "Classe Mecanica"]);
  const classes = preventivePanelOperationalClasses(panel.filters.mechanicalClass);
  return `
    <section class="card card-pad">
      <div class="panel-config">
        <label>Fonte CSV publicada
          <input type="url" data-panel-source value="${esc(panel.sheetUrl)}" placeholder="Cole o link CSV publicado do Google Sheets" />
        </label>
        <div class="toolbar">
          <button class="ghost-button" type="button" data-action="savePreventivePanelSource">Salvar fonte</button>
          <button class="ghost-button" type="button" data-action="refreshPreventivePanel">Atualizar painel</button>
          <button class="primary-button" type="button" data-action="exportPreventivePanel">Exportar Excel</button>
        </div>
      </div>
      <p class="muted">${panel.loading ? "Carregando dados da planilha..." : panel.error || preventivePanelStatusMessage()}</p>
    </section>

    <section class="grid kpi-grid" style="margin-top:16px">
      ${kpi("Frota monitorada", metrics.total, "Preventivas na fonte diaria", "accent")}
      ${kpi("Em dia", metrics.onTime, `${fmtPercent(metrics.onTimeRate)} da frota`, "purple")}
      ${kpi("Vencidas", metrics.overdue, `${fmtPercent(metrics.overdueRate)} da frota`, "danger")}
      ${kpi("Em aderencia", metrics.adherent, "Janela de -50h a +50h", "orange")}
    </section>
    <section class="grid kpi-grid" style="margin-top:16px">
      ${kpi("Vencem em ate 50h", metrics.dueSoon, "Atenção preventiva", "orange")}
      ${kpi("Maior atraso", `${fmt(metrics.maxOverdueHours)}h`, metrics.maxOverdueLabel || "Sem atraso", "danger")}
      ${kpi("Filiais com vencidas", metrics.branchesWithOverdue, "Com pelo menos 1 vencida", "purple")}
      ${kpi("Aderencia percentual", fmtPercent(metrics.adherenceRate), "Dentro da janela de aderencia", "accent")}
    </section>

    <section class="card card-pad" style="margin-top:16px">
      <div class="compliance-title">
        <div>
          <h2>Aderencia geral das preventivas</h2>
          <p class="muted">Verde: em dia | Azul: aderencia -50h a +50h | Vermelho: vencidas.</p>
        </div>
        <strong>${fmtPercent(metrics.adherenceRate)}</strong>
      </div>
      ${preventiveComplianceLine(metrics)}
    </section>

    <section class="card card-pad preventive-filter-card" style="margin-top:16px" data-preventive-panel-filter>
      <div class="filter-heading">
        <div><h3>Filtros de Análise</h3><p>Todos os indicadores, gráficos e a tabela respondem à seleção.</p></div>
        <span class="result-count">${rows.length} registro(s)</span>
      </div>
      <div class="filter-grid">
        ${preventivePanelField("query", "Equipamento / frota", "search", panel.filters.query, [], "Equipamento, placa ou modelo")}
        ${preventivePanelField("branch", "Filial", "select", panel.filters.branch, filterOptions(branches, "Todas as filiais"))}
        ${preventivePanelField("mechanicalClass", "Classe mecânica", "select", panel.filters.mechanicalClass, filterOptions(mechanicalClasses, "Todas as classes mecânicas"))}
        ${preventivePanelField("operationalClass", "Classe operacional", "select", panel.filters.operationalClass, filterOptions(classes, "Todas as classes operacionais"))}
        ${preventivePanelField("status", "Status", "select", panel.filters.status, filterOptions(statuses, "Todos os status"))}
        ${preventivePanelField("priority", "Prioridade", "select", panel.filters.priority, filterOptions(priorities, "Todas"))}
        ${preventivePanelField("serviceType", "Tipo preventiva", "select", panel.filters.serviceType, filterOptions(serviceTypes, "Todos os tipos"))}
        ${preventivePanelField("periodStart", "Período inicial", "date", panel.filters.periodStart)}
        ${preventivePanelField("periodEnd", "Período final", "date", panel.filters.periodEnd)}
      </div>
      <div class="filter-actions">
        <button class="primary-button" type="button" data-action="applyFilters" data-scope="preventivePanel">Filtrar</button>
        <button class="ghost-button" type="button" data-action="clearFilters" data-scope="preventivePanel">Limpar filtros</button>
      </div>
    </section>

    <section class="grid analytics-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Vencidas por filial</h2>
        ${renderBars(preventiveBranchRiskRows(rows).map((item) => [item.label, item.count, "danger"]), "Nao ha preventivas vencidas por filial.")}
      </article>
      <article class="card card-pad">
        <h2>Vencidas por prioridade</h2>
        ${renderBars(preventivePanelGroup(rows, ["Prioridade"]).map((item) => [item.label, item.count, "danger"]), "Não há vencidas por prioridade.")}
      </article>
      <article class="card card-pad">
        <h2>Vencidas por tipo</h2>
        ${renderBars(preventivePanelGroup(rows, ["Tipo Preventiva", "Tipo de preventiva", "Tipo"]).map((item) => [item.label, item.count, "orange"]), "Não há vencidas por tipo.")}
      </article>
      <article class="card card-pad">
        <h2>Vencidas por classe operacional</h2>
        ${renderBars(preventivePanelGroup(rows, ["Classe Operacional", "Classe"]).map((item) => [item.label, item.count, "purple"]), "Não há vencidas por classe operacional.")}
      </article>
    </section>

    <section class="grid two-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Ranking de atrasos</h2>
        ${preventiveOverdueRanking(rows)}
      </article>
      <article class="card card-pad">
        <h2>Status das preventivas</h2>
        ${renderBars([
          ["Em dia", metrics.onTime, "success"],
          ["Em aderencia", metrics.adherent, "info"],
          ["Vencidas", metrics.overdue, "danger"]
        ], "Sem dados para status.")}
      </article>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="card-pad">
        <h2>Base detalhada das preventivas</h2>
        <p class="muted">Dados vindos da planilha publicada como CSV, filtrados para a visao atual.</p>
      </div>
      <div class="table-wrap">
        ${preventivePanelTable(rows)}
      </div>
    </section>
  `;
}

function renderCorrectives() {
  const rows = filterRecords("correctives", state.correctives);
  return `
    ${executiveKpis(rows, (item) => isOpen(item) && correctiveSlaLevel(item) === "danger")}
    ${crudLayout("correctiveForm", "Nova corretiva", correctiveForm(), "Corretivas cadastradas", correctiveRows(), operationalFilters("correctives", [
    ["all", "Todos os status"],
    ["open", "Somente abertas"],
    ["Aberto", "Aberto"],
    ["Em diagnostico", "Em diagnostico"],
    ["Aguardando peca", "Aguardando peca"],
    ["Em execucao", "Em execucao"],
    ["Concluido", "Concluido"],
    ["Cancelado", "Cancelado"]
  ], [], rows.length))}
  `;
}

function renderMaterials() {
  const rows = filterRecords("materials", state.materials);
  return `
    ${executiveKpis(rows, (item) => isMaterialOpen(item) && materialLeadDays(item) > GOALS.materialLeadDays)}
    ${crudLayout("materialForm", "Solicitação de material", materialForm(), "Materiais cadastrados", materialRows(), operationalFilters("materials", [
    ["all", "Todos os status"],
    ["open", "Somente pendentes"],
    ["Solicitado", "Solicitado"],
    ["Disponivel", "Disponivel"],
    ["Retirado", "Retirado"],
    ["Cancelado", "Cancelado"]
  ], [
    ["all", "Todos os tipos"],
    ["Preventiva", "Preventiva"],
    ["Corretiva", "Corretiva"]
  ], rows.length))}
  `;
}

function renderMtr() {
  const metrics = buildMtrMetrics();
  const filters = state.filters.mtr || {};
  return `
    ${filterCard("mtr", [
      filterSelect("mechanicalClass", "Classe mecânica", filterOptions(uniqueMechanicalClasses(), "Todas as classes mecânicas"), filters.mechanicalClass),
      filterSelect("operationalClass", "Classe operacional", filterOptions(uniqueOperationalClasses(filters.mechanicalClass), "Todas as classes operacionais"), filters.operationalClass),
      filterSelect("branch", "Filial", filterOptions(uniqueFleetValues("branch"), "Todas as filiais"), filters.branch),
      filterInput("query", "Equipamento / frota", filters.query, "search", "Equipamento, placa ou modelo"),
      filterSelect("status", "Status", filterOptions([...new Set(state.correctives.map((item) => item.status).filter(Boolean))].sort(natural), "Todos os status"), filters.status),
      filterSelect("retained", "Retido", [["all", "Todos"], ["true", "Somente retidos"], ["false", "Não retidos"]], filters.retained),
      filterSelect("awaitingParts", "Aguardando peças", [["all", "Todos"], ["true", "Sim"], ["false", "Não"]], filters.awaitingParts),
      filterInput("periodStart", "Período inicial", filters.periodStart, "date"),
      filterInput("periodEnd", "Período final", filters.periodEnd, "date")
    ], metrics.totalPatrimonial)}
    <section class="grid kpi-grid">
      ${kpi("Frota patrimonial", metrics.totalPatrimonial, `${metrics.truckPatrimonial} caminhões | ${metrics.machinePatrimonial} máquinas`, "accent")}
      ${kpi("Frota operacional", metrics.totalOperational, `${metrics.truckOperational} caminhões | ${metrics.machineOperational} máquinas`, "purple")}
      ${kpi("VTR retidos", metrics.vtr.length, `${fmtPercent(metrics.truckAvailability)} disponibilidade`, "orange")}
      ${kpi("MTR retidas", metrics.mtr.length, `${fmtPercent(metrics.machineAvailability)} disponibilidade`, "danger")}
    </section>
    <section class="grid kpi-grid" style="margin-top:16px">
      ${kpi("Retidos total", metrics.retained.length, `${fmtPercent(metrics.retainedRate)} da frota operacional`, "danger")}
      ${kpi("Aguardando peças", metrics.awaitingParts.total, `${metrics.awaitingParts.trucks} caminhões | ${metrics.awaitingParts.machines} máquinas`, "orange")}
      ${kpi("Média de dias parado", `${fmt(metrics.averageStoppedDays)}d`, "Tempo médio dos retidos", "purple")}
      ${kpi("Maior parada", `${fmt(metrics.longestStoppedDays)}d`, metrics.longestStoppedLabel || "Sem equipamento retido", "accent")}
    </section>
    <section class="grid executive-kpi-grid" style="margin-top:16px">
      ${kpi("Total de registros", metrics.filteredCorrectives.length, "Corretivas no filtro", "accent")}
      ${kpi("Em aberto", metrics.filteredCorrectives.filter((item) => maintenanceStatusBucket(item) === "open").length, "Aguardando início", "purple")}
      ${kpi("Em andamento", metrics.filteredCorrectives.filter((item) => maintenanceStatusBucket(item) === "progress").length, "Atendimento ativo", "orange")}
      ${kpi("Concluídos", metrics.filteredCorrectives.filter((item) => maintenanceStatusBucket(item) === "completed").length, "Finalizados", "accent")}
      ${kpi("Vencidos", metrics.filteredCorrectives.filter((item) => isOpen(item) && correctiveSlaLevel(item) === "danger").length, "Fora do SLA", "danger")}
    </section>

    <section class="grid mtr-overview" style="margin-top:16px">
      <article class="card card-pad mtr-summary-card">
        <h2>Resumo consolidado</h2>
        ${mtrSummary(metrics)}
      </article>

      <article class="card card-pad mtr-status-card">
        <h2>Disponibilidade operacional</h2>
        <div class="availability-grid">
          ${availabilityCard("Caminhoes", metrics.truckOperational, metrics.vtr.length, metrics.truckAvailability, "purple")}
          ${availabilityCard("Maquinas", metrics.machineOperational, metrics.mtr.length, metrics.machineAvailability, "orange")}
        </div>
      </article>
    </section>

    <section class="grid mtr-chart-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Alertas de planejamento</h2>
        ${mtrAlertGrid(metrics)}
      </article>
      <article class="card card-pad">
        <h2>Tempo parado</h2>
        ${renderBars([
          ["0 a 3 dias", metrics.ageBuckets.upTo3, "success"],
          ["4 a 7 dias", metrics.ageBuckets.upTo7, "purple"],
          ["8 a 15 dias", metrics.ageBuckets.upTo15, "orange"],
          ["Acima de 15 dias", metrics.ageBuckets.over15, "danger"]
        ], "Nao ha equipamentos parados.")}
      </article>
      <article class="card card-pad">
        <h2>Prioridade dos retidos</h2>
        ${renderBars(groupRows(metrics.retained, (item) => item.priority || "Sem prioridade").slice(0, 8).map((item) => [item.label, item.count, severityColor(item.label)]), "Nao ha prioridades em ativos retidos.")}
      </article>
    </section>

    <section class="grid mtr-chart-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Gargalos por condição atual</h2>
        ${renderBars(groupRows(metrics.retained, (item) => item.status || "Sem status").slice(0, 8).map((item) => [item.label, item.count, severityColor(item.label)]), "Nao ha equipamentos retidos por condicao atual.")}
      </article>
      <article class="card card-pad">
        <h2>Motivo / tipo de parada</h2>
        ${renderBars(groupRows(metrics.retained, (item) => item.failureType || item.serviceType || item.description || "Nao informado").slice(0, 8).map((item) => [item.label, item.count, "purple"]), "Nao ha motivos de parada em aberto.")}
      </article>
      <article class="card card-pad">
        <h2>Retidos por filial</h2>
        ${renderBars(groupRows(metrics.retained, (item) => fleetById(item.fleetId).branch || item.branch || "Sem filial").slice(0, 8).map((item) => [item.label, item.count, "orange"]), "Nao ha filiais com ativos retidos.")}
      </article>
    </section>

    <section class="card card-pad" style="margin-top:16px">
      <div class="section-heading">
        <div>
          <h2>Classes operacionais com mais falhas</h2>
          <p class="muted">Histórico de corretivas cadastradas, exceto registros cancelados.</p>
        </div>
        <span class="data-badge">${metrics.classFailures.totalFailures} corretiva(s)</span>
      </div>
      <div class="grid class-failure-grid">
        <div>
          <h3>Caminhões</h3>
          ${renderBars(metrics.classFailures.trucks.slice(0, 8).map((item) => [item.label, item.failures, "purple"]), "Ainda não há corretivas de caminhões por classe operacional.")}
        </div>
        <div>
          <h3>Máquinas</h3>
          ${renderBars(metrics.classFailures.machines.slice(0, 8).map((item) => [item.label, item.failures, "orange"]), "Ainda não há corretivas de máquinas por classe operacional.")}
        </div>
      </div>
      <div class="table-wrap class-failure-table">
        ${table(["Classe mecânica", "Classe operacional", "Corretivas", "Ativos afetados", "Retidos agora", "Falhas / 100 ativos"], metrics.classFailures.ranking.slice(0, 15).map((item) => [
          esc(item.mechanicalClass),
          `<strong>${esc(item.label)}</strong>`,
          item.failures,
          item.affectedAssets,
          item.retainedNow,
          fmt(item.ratePer100)
        ]))}
      </div>
    </section>

    ${renderRetentionAnalysis(metrics)}

    <section class="card" style="margin-top:16px">
      <div class="card-pad">
        <h2>Equipamentos tecnicamente retidos</h2>
        <p class="muted">Entram somente corretivas abertas, com equipamento parado e vinculadas a frota oficial do Firestore.</p>
      </div>
      <div class="table-wrap">
        ${table(["Classe", "Equipamento", "O.S.", "Entrada", "Tipo", "Condicao atual", "Previsao", "Dias parado"], metrics.retained.map((item) => [
          labelCategory(categoryOfFleet(item.fleetId)),
          fleetLabel(item),
          esc(item.workOrder || item.os || "-"),
          fmtDateTime(item.openedAt),
          esc(item.failureType || item.maintenanceType || "Corretiva"),
          pill(item.status || "-", severityColor(item.status)),
          fmtDateTime(item.forecastAt || item.expectedExitAt || item.finishedAt),
          `${fmt(correctiveHours(item) / 24)}d`
        ]))}
      </div>
    </section>
  `;
}

function renderSla() {
  const sourceRows = [
    ...state.preventives.map((item) => buildSlaRow("Preventiva", item, preventiveTotalDays(item), GOALS.preventiveTotalDays, "d")),
    ...state.materials.map((item) => buildSlaRow(`Material ${item.maintenanceType || ""}`, item, materialLeadDays(item), GOALS.materialLeadDays, "d")),
    ...state.correctives.map((item) => {
      const goal = GOALS.correctiveHours[item.priority] || GOALS.correctiveHours.Media;
      return buildSlaRow("Corretiva", item, correctiveHours(item), goal, "h");
    })
  ];
  const filters = state.filters.sla || {};
  const rows = sourceRows.filter((item) => {
    const fleet = fleetById(item.ref.fleetId);
    const periodDate = String(item.ref.requestDate || item.ref.requestedAt || item.ref.openedAt || "").slice(0, 10);
    const slaMatch = !filters.sla || filters.sla === "all"
      || (filters.sla === "inside" ? item.level !== "danger" : item.level === "danger");
    return (!filters.query || recordSearchText(item.ref).includes(normalizeSearch(filters.query)))
      && matchTextFilter(filters.branch, fleet.branch || item.ref.branch)
      && matchMechanicalClass(filters.mechanicalClass, fleet, item.ref)
      && matchOperationalClass(filters.operationalClass, fleet, item.ref)
      && matchTextFilter(filters.priority, item.ref.priority)
      && matchTextFilter(filters.status, item.ref.status)
      && slaMatch
      && (!filters.periodStart || periodDate >= filters.periodStart)
      && (!filters.periodEnd || periodDate <= filters.periodEnd);
  });
  const onTimeRows = rows.filter((item) => item.level !== "danger");
  const overdueRows = rows.filter((item) => item.level === "danger");

  return `
    ${filterCard("sla", [
      filterSelect("branch", "Filial", filterOptions(uniqueFleetValues("branch"), "Todas as filiais"), filters.branch),
      filterInput("query", "Equipamento", filters.query, "search", "Equipamento, placa ou modelo"),
      filterSelect("mechanicalClass", "Classe mecânica", filterOptions(uniqueMechanicalClasses(), "Todas as classes mecânicas"), filters.mechanicalClass),
      filterSelect("operationalClass", "Classe operacional", filterOptions(uniqueOperationalClasses(filters.mechanicalClass), "Todas as classes operacionais"), filters.operationalClass),
      filterSelect("priority", "Prioridade", filterOptions(["Baixa", "Media", "Alta", "Critica"], "Todas"), filters.priority),
      filterSelect("status", "Status", filterOptions([...new Set(sourceRows.map((item) => item.status).filter(Boolean))].sort(natural), "Todos"), filters.status),
      filterSelect("sla", "Situação SLA", [["all", "Todos"], ["inside", "Dentro do SLA"], ["outside", "Fora do SLA"]], filters.sla),
      filterInput("periodStart", "Período inicial", filters.periodStart, "date"),
      filterInput("periodEnd", "Período final", filters.periodEnd, "date")
    ], rows.length)}
    <section class="grid kpi-grid">
      ${kpi("Itens monitorados", rows.length, "Preventivas, corretivas e materiais", "accent")}
      ${kpi("SLAs em dia", onTimeRows.length, "Dentro da meta", "purple")}
      ${kpi("Atenção", rows.filter((item) => item.level === "warning").length, "Ainda dentro da meta", "orange")}
      ${kpi("SLAs em atraso", overdueRows.length, "Acima da meta", "danger")}
    </section>
    <section class="grid analytics-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Situação por tipo de SLA</h2>
        ${renderBars(groupRows(rows, (item) => `${item.type} - ${item.level === "danger" ? "Em atraso" : "Em dia"}`).map((item) => [
          item.label,
          item.count,
          item.label.includes("Em atraso") ? "danger" : "success"
        ]), "Nenhum SLA encontrado no filtro atual.")}
      </article>
      <article class="card card-pad">
        <h2>Distribuição geral</h2>
        ${renderBars([
          ["Em dia", onTimeRows.length, "success"],
          ["Atenção", rows.filter((item) => item.level === "warning").length, "warning"],
          ["Em atraso", overdueRows.length, "danger"]
        ], "Nenhum SLA encontrado no filtro atual.")}
      </article>
    </section>
    <section class="grid sla-status-grid" style="margin-top:16px">
      ${slaStatusTable("SLAs em dia", onTimeRows, "success", "Nenhum SLA em dia no filtro atual.")}
      ${slaStatusTable("SLAs em atraso", overdueRows, "danger", "Nenhum SLA em atraso no filtro atual.")}
    </section>
  `;
}

function buildSlaRow(type, ref, elapsed, goal, unit) {
  const deviation = elapsed - goal;
  const level = deviation > 0 ? "danger" : elapsed >= goal * 0.8 && isOpen(ref) ? "warning" : "success";
  return {
    type,
    ref,
    status: ref.status,
    elapsed,
    goal,
    deviation,
    unit,
    time: `${fmt(elapsed)}${unit}`,
    level
  };
}

function slaStatusTable(title, rows, level, emptyText) {
  return `
    <article class="card sla-status-card ${level}">
      <div class="card-pad section-heading">
        <div><h2>${esc(title)}</h2><p class="muted">${rows.length} registro(s) no filtro atual.</p></div>
        ${pill(rows.length, level)}
      </div>
      ${rows.length ? table(["Equipamento", "Processo", "Status", "Tempo atual", "Meta", "Desvio"], rows
        .sort((a, b) => b.deviation - a.deviation)
        .map((item) => [
          fleetLabel(item.ref),
          esc(item.type),
          pill(item.status || "-", item.level),
          `<strong>${esc(item.time)}</strong>`,
          `${fmt(item.goal)}${item.unit}`,
          pill(`${item.deviation > 0 ? "+" : ""}${fmt(item.deviation)}${item.unit}`, item.level)
        ])) : `<div class="empty">${esc(emptyText)}</div>`}
    </article>
  `;
}

function renderReports() {
  const filters = state.filters.reports || {};
  const source = [
    ...state.preventives.map((item) => ({ ...item, sourceKind: "Preventiva", maintenanceType: "Preventiva", reportDate: item.requestDate })),
    ...state.correctives.map((item) => ({ ...item, sourceKind: "Corretiva", maintenanceType: "Corretiva", reportDate: item.openedAt })),
    ...state.materials.map((item) => ({ ...item, sourceKind: "Material", maintenanceType: item.maintenanceType || "Material", reportDate: item.requestedAt }))
  ];
  const rows = source.filter((item) => {
    const fleet = fleetById(item.fleetId);
    const reportDate = String(item.reportDate || "").slice(0, 10);
    return (!filters.query || recordSearchText(item).includes(normalizeSearch(filters.query)))
      && matchTextFilter(filters.branch, fleet.branch || item.branch)
      && matchMechanicalClass(filters.mechanicalClass, fleet, item)
      && matchOperationalClass(filters.operationalClass, fleet, item)
      && matchTextFilter(filters.maintenanceType, item.maintenanceType)
      && matchTextFilter(filters.status, item.status)
      && (!filters.periodStart || reportDate >= filters.periodStart)
      && (!filters.periodEnd || reportDate <= filters.periodEnd);
  });
  const metrics = buildDashboardMetrics({
    preventives: rows.filter((item) => item.sourceKind === "Preventiva"),
    correctives: rows.filter((item) => item.sourceKind === "Corretiva"),
    materials: rows.filter((item) => item.sourceKind === "Material")
  });
  return `
    ${filterCard("reports", [
      filterInput("query", "Equipamento / frota", filters.query, "search", "Equipamento, placa ou modelo"),
      filterSelect("branch", "Filial", filterOptions(uniqueFleetValues("branch"), "Todas as filiais"), filters.branch),
      filterSelect("mechanicalClass", "Classe mecânica", filterOptions(uniqueMechanicalClasses(), "Todas as classes mecânicas"), filters.mechanicalClass),
      filterSelect("operationalClass", "Classe operacional", filterOptions(uniqueOperationalClasses(filters.mechanicalClass), "Todas as classes operacionais"), filters.operationalClass),
      filterSelect("maintenanceType", "Tipo manutenção", filterOptions(["Preventiva", "Corretiva", "Material"], "Todos os tipos"), filters.maintenanceType),
      filterSelect("status", "Status", filterOptions([...new Set(source.map((item) => item.status).filter(Boolean))].sort(natural), "Todos"), filters.status),
      filterInput("periodStart", "Data inicial", filters.periodStart, "date"),
      filterInput("periodEnd", "Data final", filters.periodEnd, "date")
    ], rows.length)}
    <section class="card card-pad">
      <h2>Exportações</h2>
      <p class="muted">Os arquivos são gerados com os dados online carregados do Firebase.</p>
      <div class="toolbar">
        <button class="primary-button" type="button" data-action="exportCsv">Exportar Excel</button>
      </div>
    </section>
    <section class="grid kpi-grid" style="margin-top:16px">
      ${kpi("Total", rows.length, "Registros filtrados", "accent")}
      ${kpi("Preventivas", rows.filter((item) => item.sourceKind === "Preventiva").length, "Registros", "purple")}
      ${kpi("Corretivas", rows.filter((item) => item.sourceKind === "Corretiva").length, "Registros", "orange")}
      ${kpi("Materiais", rows.filter((item) => item.sourceKind === "Material").length, "Registros", "danger")}
    </section>
    <section class="grid two-grid" style="margin-top:16px">
      <article class="card card-pad">
        <h2>Resumo gerencial</h2>
        ${table(["Indicador", "Quantidade"], [
          ["Total de manutencoes", metrics.totalMaintenances],
          ["Manutencoes em aberto", metrics.openMaintenances],
          ["Itens atrasados", metrics.overdue.length],
          ["Itens dentro do prazo", metrics.onTime.length],
          ["Equipamentos criticos", metrics.criticalEquipments.length]
        ])}
      </article>
      <article class="card card-pad">
        <h2>Gargalo médio por etapa</h2>
        ${renderBars(stageBottleneckRows().map((item) => [item.label, item.value, item.level]))}
      </article>
    </section>
  `;
}

function crudLayout(formId, formTitle, formHtml, listTitle, rowsHtml, filtersHtml = "", layoutClass = "") {
  return `
    <section class="maintenance-layout ${layoutClass}">
      <article class="card card-pad maintenance-form-card">
        <h2>${formTitle}</h2>
        <form id="${formId}" class="form-grid">${formHtml}</form>
      </article>
      <article class="card maintenance-list-card">
        <div class="card-pad">
          <h2>${listTitle}</h2>
          ${filtersHtml}
        </div>
        <div class="table-wrap">${rowsHtml}</div>
      </article>
    </section>
  `;
}

function operationalFilters(scope, statusOptions, typeOptions = [], resultCount = 0) {
  const filters = state.filters[scope] || {};
  const fields = [
    filterInput("query", "Equipamento / frota", filters.query, "search", "Placa, modelo, equipamento..."),
    filterSelect("branch", "Filial", filterOptions(uniqueFleetValues("branch"), "Todas as filiais"), filters.branch),
    filterSelect("mechanicalClass", "Classe mecânica", filterOptions(uniqueMechanicalClasses(), "Todas as classes mecânicas"), filters.mechanicalClass),
    filterSelect("operationalClass", "Classe operacional", filterOptions(uniqueOperationalClasses(filters.mechanicalClass), "Todas as classes operacionais"), filters.operationalClass),
    filterSelect("status", "Status", statusOptions, filters.status)
  ];
  if (scope === "preventives") {
    fields.push(
      filterInput("serviceType", "Tipo preventiva", filters.serviceType, "search", "Ex.: troca de óleo"),
      filterSelect("priority", "Prioridade", filterOptions(["Baixa", "Media", "Alta", "Critica"], "Todas"), filters.priority),
      filterInput("requestDate", "Data solicitação", filters.requestDate, "date"),
      filterInput("pickupDate", "Data retirada", filters.pickupDate, "date"),
      filterInput("executionDate", "Data execução", filters.executionDate, "date")
    );
  }
  if (scope === "correctives") {
    fields.push(
      filterSelect("priority", "Prioridade", filterOptions(["Baixa", "Media", "Alta", "Critica"], "Todas"), filters.priority),
      filterSelect("isStopped", "Equipamento parado", [["all", "Todos"], ["true", "Sim"], ["false", "Não"]], filters.isStopped),
      filterInput("failureType", "Tipo de falha", filters.failureType, "search", "Falha..."),
      filterInput("openedAt", "Data abertura", filters.openedAt, "date"),
      filterInput("finishedAt", "Data conclusão", filters.finishedAt, "date")
    );
  }
  if (scope === "materials") {
    fields.push(
      filterSelect("type", "Tipo manutenção", typeOptions, filters.type),
      filterInput("material", "Material", filters.material, "search", "Descrição do material"),
      filterInput("supplier", "Fornecedor", filters.supplier, "search", "Fornecedor"),
      filterInput("requestedAt", "Data solicitação", filters.requestedAt, "date"),
      filterInput("availableAt", "Data disponibilização", filters.availableAt, "date"),
      filterInput("pickedUpAt", "Data retirada", filters.pickedUpAt, "date")
    );
  }
  return filterCard(scope, fields, resultCount);
}

function filterCard(scope, fields, resultCount) {
  return `
    <section class="analysis-filter" data-filter-scope="${scope}">
      <div class="filter-heading">
        <div>
          <h3>Filtros de Análise</h3>
          <p>Refine indicadores, gráficos e registros deste módulo.</p>
        </div>
        <span class="result-count">${resultCount} registro(s)</span>
      </div>
      <div class="filter-grid">${fields.join("")}</div>
      <div class="filter-actions">
        <button class="primary-button" type="button" data-action="applyFilters" data-scope="${scope}">Filtrar</button>
        <button class="ghost-button" type="button" data-action="clearFilters" data-scope="${scope}">Limpar filtros</button>
      </div>
    </section>
  `;
}

function filterInput(field, label, value = "", type = "text", placeholder = "") {
  return `<label>${label}<input type="${type}" data-filter-field="${field}" value="${esc(value || "")}" placeholder="${esc(placeholder)}" /></label>`;
}

function filterSelect(field, label, options, selected = "") {
  return `<label>${label}<select data-filter-field="${field}">${options.map(([value, text]) => `<option value="${esc(value)}" ${String(selected || "all") === String(value) ? "selected" : ""}>${esc(displayLabel(text))}</option>`).join("")}</select></label>`;
}

function filterOptions(values, allLabel = "Todos") {
  return [["all", allLabel], ...values.filter(Boolean).map((value) => [value, value])];
}

function uniqueFleetValues(field) {
  return [...new Set(state.fleet.map((item) => item[field]).filter(Boolean))].sort(natural);
}

function uniqueMechanicalClasses() {
  return [...new Set(state.fleet.map(mechanicalClassLabel).filter(Boolean))].sort(natural);
}

function uniqueOperationalClasses(mechanicalClass = "all") {
  return [...new Set(state.fleet
    .filter((item) => matchMechanicalClass(mechanicalClass, item))
    .map((item) => item.operationalClass)
    .filter(Boolean))]
    .sort(natural);
}

function fleetPicker(prefix, selectedFleetId = "") {
  return `
    <label class="full">Buscar equipamento, placa ou modelo
      <input type="search" data-fleet-search="${prefix}" placeholder="Digite frota, placa, modelo, filial ou classe..." />
    </label>
    <label class="full">Equipamento da frota
      <select name="fleetId" data-fleet-select="${prefix}" required>
        <option value="">Selecione...</option>
        ${fleetOptionHtml("", selectedFleetId)}
      </select>
    </label>
    <div class="full muted" data-fleet-info="${prefix}">Selecione um equipamento para preencher frota, modelo e filial.</div>
  `;
}

function preventiveForm(record = {}) {
  return `
    <input type="hidden" name="_recordId" value="${esc(record.id || "")}" />
    ${fleetPicker("preventive", record.fleetId)}
    ${select("status", "Status", ["Aguardando material", "Material disponivel", "Material retirado", "Executada", "Cancelada"], record.status)}
    ${select("priority", "Prioridade", ["Baixa", "Media", "Alta", "Critica"], record.priority || "Media")}
    ${input("serviceType", "Tipo de preventiva", record.serviceType || "Troca de óleo e filtros")}
    ${input("requestDate", "Solicitação do material", record.requestDate, "date")}
    ${input("availableDate", "Disponibilização para retirada", record.availableDate, "date")}
    ${input("pickupDate", "Retirada pelo planejador", record.pickupDate, "date")}
    ${input("executionDate", "Execução da preventiva", record.executionDate, "date")}
    ${textarea("notes", "Observações", record.notes)}
    ${formActions()}
  `;
}

function correctiveForm(record = {}) {
  return `
    <input type="hidden" name="_recordId" value="${esc(record.id || "")}" />
    ${fleetPicker("corrective", record.fleetId)}
    ${select("priority", "Prioridade", ["Baixa", "Media", "Alta", "Critica"], record.priority || "Media")}
    ${select("status", "Status", ["Aberto", "Em diagnostico", "Aguardando peca", "Em execucao", "Concluido", "Cancelado"], record.status)}
    <label>Equipamento parado?
      <select name="isStopped">
        <option value="false">Nao</option>
        <option value="true" ${record.isStopped ? "selected" : ""}>Sim</option>
      </select>
    </label>
    ${input("openedAt", "Abertura", record.openedAt || dateTimeLocalNow(), "datetime-local")}
    ${input("startedAt", "Inicio do reparo", record.startedAt, "datetime-local")}
    ${input("finishedAt", "Conclusão", record.finishedAt, "datetime-local")}
    ${input("workOrder", "O.S.", record.workOrder)}
    ${input("forecastAt", "Previsão de saída", record.forecastAt, "datetime-local")}
    ${input("failureType", "Tipo de falha", record.failureType)}
    ${textarea("description", "Descrição da falha", record.description)}
    ${formActions()}
  `;
}

function materialForm(record = {}) {
  return `
    <input type="hidden" name="_recordId" value="${esc(record.id || "")}" />
    ${fleetPicker("material", record.fleetId)}
    ${select("maintenanceType", "Tipo de manutenção", ["Preventiva", "Corretiva"], record.maintenanceType || "Preventiva")}
    ${select("status", "Status", ["Solicitado", "Disponivel", "Retirado", "Cancelado"], record.status)}
    ${input("material", "Material", record.material)}
    ${input("quantity", "Quantidade", record.quantity || "1")}
    ${input("requestedAt", "Solicitação", record.requestedAt || today(), "date")}
    ${input("availableAt", "Disponibilização", record.availableAt, "date")}
    ${input("pickedUpAt", "Retirada", record.pickedUpAt, "date")}
    ${input("supplier", "Fornecedor", record.supplier)}
    ${textarea("notes", "Observações", record.notes)}
    ${formActions()}
  `;
}

function formActions() {
  return `<div class="form-actions full"><button class="primary-button" type="button" data-action="saveMaintenance">Salvar</button><button class="ghost-button" type="reset">Limpar</button></div>`;
}

function input(name, label, value = "", type = "text") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value || "")}" /></label>`;
}

function select(name, label, values, selected = "") {
  return `<label>${label}<select name="${name}">${values.map((value) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(displayLabel(value))}</option>`).join("")}</select></label>`;
}

function textarea(name, label, value = "") {
  return `<label class="full">${label}<textarea name="${name}">${esc(value || "")}</textarea></label>`;
}

function preventiveRows() {
  const rows = filterRecords("preventives", state.preventives).sort((a, b) => preventiveTotalDays(b) - preventiveTotalDays(a));
  return table(["Equipamento", "Status", "Prioridade", "Solicitacao", "Disp.", "Retirada", "Execucao", "Solic->Disp", "Disp->Ret", "Ret->Exec", "Total", "Acoes"], rows.map((item) => [
    fleetLabel(item),
    pill(item.status, preventiveTotalDays(item) > GOALS.preventiveTotalDays && isOpen(item) ? "danger" : item.status === "Executada" ? "success" : "warning"),
    pill(item.priority || "Media", item.priority === "Critica" || item.priority === "Alta" ? "danger" : "info"),
    fmtDate(item.requestDate),
    fmtDate(item.availableDate),
    fmtDate(item.pickupDate),
    fmtDate(item.executionDate),
    stagePill(daysBetween(item.requestDate, item.availableDate || today()), 0),
    stagePill(daysBetween(item.availableDate, item.pickupDate || today()), 0.5, !item.availableDate),
    stagePill(daysBetween(item.pickupDate, item.executionDate || today()), 2, !item.pickupDate),
    stagePill(preventiveTotalDays(item), GOALS.preventiveTotalDays),
    rowActions("preventives", item.id)
  ]));
}

function correctiveRows() {
  const rows = filterRecords("correctives", state.correctives).sort((a, b) => correctiveHours(b) - correctiveHours(a));
  return table(["Equipamento", "Status", "Prioridade", "Parado", "Abertura", "Horas", "Acoes"], rows.map((item) => [
    fleetLabel(item),
    pill(item.status, correctiveSlaLevel(item)),
    pill(item.priority || "Media", item.priority === "Critica" || item.priority === "Alta" ? "danger" : "info"),
    item.isStopped ? pill("Sim", "danger") : pill("Nao", "success"),
    fmtDateTime(item.openedAt),
    `${fmt(correctiveHours(item))}h`,
    rowActions("correctives", item.id)
  ]));
}

function materialRows() {
  const rows = filterRecords("materials", state.materials).sort((a, b) => materialLeadDays(b) - materialLeadDays(a));
  return table(["Equipamento", "Material", "Tipo", "Status", "Solicitacao", "Disponivel", "Retirada", "Solic->Disp", "Disp->Ret", "Total", "Acoes"], rows.map((item) => [
    fleetLabel(item),
    esc(item.material || "-"),
    item.maintenanceType || "-",
    pill(item.status, materialLeadDays(item) > GOALS.materialLeadDays && isMaterialOpen(item) ? "danger" : item.status === "Retirado" ? "success" : "warning"),
    fmtDate(item.requestedAt),
    fmtDate(item.availableAt),
    fmtDate(item.pickedUpAt),
    stagePill(daysBetween(item.requestedAt, item.availableAt || today()), 0),
    stagePill(daysBetween(item.availableAt, item.pickedUpAt || today()), 0.5, !item.availableAt),
    stagePill(materialLeadDays(item), GOALS.materialLeadDays),
    rowActions("materials", item.id)
  ]));
}

function ensurePreventivePanelLoaded(force = false) {
  const panel = state.preventivePanel;
  if (panel.loading || (panel.loaded && !force)) return;
  loadPreventivePanel();
}

async function loadPreventivePanel() {
  const panel = state.preventivePanel;
  if (!panel.sheetUrl) {
    panel.rows = [];
    panel.loaded = true;
    panel.error = "Informe o link CSV publicado do Google Sheets.";
    scheduleRender();
    return;
  }
  panel.loading = true;
  panel.error = "";
  scheduleRender();
  try {
    const response = await fetch(cacheBustedUrl(panel.sheetUrl));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    const rows = parseCsv(csv);
    panel.summary = extractPreventivePanelSummary(rows);
    panel.rows = rows.filter(isPreventivePanelRow);
    panel.loaded = true;
    panel.error = "";
  } catch (error) {
    panel.rows = [];
    panel.loaded = true;
    panel.error = "Nao foi possivel carregar a planilha. Confira se o CSV esta publicado.";
  } finally {
    panel.loading = false;
    scheduleRender();
  }
}

function preventivePanelVisibleRows() {
  const panel = state.preventivePanel;
  const query = normalizeSearch(panel.filters.query || "");
  return panel.rows.filter((row) => {
    const status = preventivePanelStatus(row);
    const branch = preventivePanelBranch(row);
    const mechanicalClass = valueByKey(row, ["Classe Mecânica", "Classe Mecanica"]);
    const operationalClass = valueByKey(row, ["Classe Operacional"]);
    const priority = valueByKey(row, ["Prioridade"]);
    const serviceType = valueByKey(row, ["Tipo Preventiva", "Tipo de preventiva", "Tipo"]);
    const referenceDate = panelRowDate(row);
    const queryMatch = !query || normalizeSearch(Object.values(row).join(" ")).includes(query);
    const statusMatch =
      panel.filters.status === "all" ||
      (panel.filters.status === "Em aderencia" ? isPreventiveAdherent(row) : status === panel.filters.status);
    const branchMatch = panel.filters.branch === "all" || branch === panel.filters.branch;
    const mechanicalClassMatch = !panel.filters.mechanicalClass || panel.filters.mechanicalClass === "all" || mechanicalClass === panel.filters.mechanicalClass;
    const classMatch = !panel.filters.operationalClass || panel.filters.operationalClass === "all" || operationalClass === panel.filters.operationalClass;
    const priorityMatch = !panel.filters.priority || panel.filters.priority === "all" || priority === panel.filters.priority;
    const typeMatch = !panel.filters.serviceType || panel.filters.serviceType === "all" || serviceType === panel.filters.serviceType;
    const startMatch = !panel.filters.periodStart || (referenceDate && referenceDate >= panel.filters.periodStart);
    const endMatch = !panel.filters.periodEnd || (referenceDate && referenceDate <= panel.filters.periodEnd);
    return queryMatch && statusMatch && branchMatch && mechanicalClassMatch && classMatch && priorityMatch && typeMatch && startMatch && endMatch;
  });
}

function preventivePanelMetrics(rows) {
  const total = rows.length;
  const overdueRows = rows.filter(isPreventiveOverdue);
  const onTimeRows = rows.filter((row) => !isPreventiveOverdue(row));
  const adherentRows = rows.filter(isPreventiveAdherent);
  const dueSoonRows = rows.filter(isPreventiveDueSoon);
  const maxRow = overdueRows
    .map((row) => ({ row, hours: preventiveOverdueHours(row) }))
    .sort((a, b) => b.hours - a.hours)[0];
  return {
    total,
    onTime: onTimeRows.length,
    overdue: overdueRows.length,
    adherent: adherentRows.length,
    dueSoon: dueSoonRows.length,
    onTimeRate: total ? onTimeRows.length / total : 0,
    overdueRate: total ? overdueRows.length / total : 0,
    adherenceRate: total ? adherentRows.length / total : 0,
    maxOverdueHours: maxRow ? maxRow.hours : 0,
    maxOverdueLabel: maxRow ? preventivePrimaryLabel(maxRow.row) : "",
    branchesWithOverdue: new Set(overdueRows.map(preventivePanelBranch).filter(Boolean)).size,
    completed: rows.filter((row) => normalize(preventivePanelStatus(row)).includes("conclu") || normalize(preventivePanelStatus(row)).includes("execut")).length
  };
}

function preventivePanelField(field, label, type, value = "", options = [], placeholder = "") {
  if (type === "select") {
    return `<label>${label}<select data-preventive-panel-field="${field}">${options.map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}" ${String(value || "all") === String(optionValue) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}</select></label>`;
  }
  return `<label>${label}<input type="${type}" data-preventive-panel-field="${field}" value="${esc(value || "")}" placeholder="${esc(placeholder)}" /></label>`;
}

function preventivePanelUniqueValues(terms) {
  return [...new Set(state.preventivePanel.rows.map((row) => valueByKey(row, terms)).filter(Boolean))].sort(natural);
}

function preventivePanelOperationalClasses(mechanicalClass = "all") {
  return [...new Set(state.preventivePanel.rows
    .filter((row) => mechanicalClass === "all" || valueByKey(row, ["Classe Mecânica", "Classe Mecanica"]) === mechanicalClass)
    .map((row) => valueByKey(row, ["Classe Operacional"]))
    .filter(Boolean))]
    .sort(natural);
}

function preventivePanelGroup(rows, terms) {
  return groupRows(rows.filter(isPreventiveOverdue), (row) => valueByKey(row, terms) || "Não informado").slice(0, 10);
}

function panelRowDate(row) {
  const raw = valueByKey(row, ["Data", "Vencimento", "Data Preventiva", "Previsão"]);
  if (!raw) return "";
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function preventiveComplianceLine(metrics) {
  const onTimePercent = metrics.total ? (metrics.onTime / metrics.total) * 100 : 0;
  const overduePercent = metrics.total ? (metrics.overdue / metrics.total) * 100 : 0;
  const adherencePercent = metrics.total ? (metrics.adherent / metrics.total) * 100 : 0;
  return `
    <div class="preventive-line">
      <div class="preventive-line-base">
        <button class="preventive-segment success" type="button" data-action="filterPreventivePanel" data-status="Em dia" style="width:${onTimePercent}%" title="Em dia: ${metrics.onTime}" aria-label="Filtrar ${metrics.onTime} preventivas em dia"></button>
        <button class="preventive-segment danger" type="button" data-action="filterPreventivePanel" data-status="Vencida" style="width:${overduePercent}%" title="Vencidas: ${metrics.overdue}" aria-label="Filtrar ${metrics.overdue} preventivas vencidas"></button>
      </div>
      <div class="preventive-adherence-marker" style="width:${adherencePercent}%">
        <button type="button" data-action="filterPreventivePanel" data-status="Em aderencia">Em aderencia: ${metrics.adherent} (${fmtPercent(metrics.adherenceRate)})</button>
      </div>
    </div>
    <div class="preventive-legend">
      <span><i class="legend-dot green"></i>Em dia</span>
      <span><i class="legend-dot blue"></i>Em aderencia</span>
      <span><i class="legend-dot red"></i>Vencidas</span>
    </div>
  `;
}

function preventiveBranchRiskRows(rows) {
  return groupRows(rows.filter(isPreventiveOverdue), preventivePanelBranch).slice(0, 10);
}

function preventiveOverdueRanking(rows) {
  const ranking = rows
    .map((row) => ({ row, hours: preventiveOverdueHours(row) }))
    .filter((item) => item.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);
  if (!ranking.length) return `<div class="empty compact">Nao ha preventivas vencidas no filtro atual.</div>`;
  return `
    <div class="ranking-list-v2">
      ${ranking.map((item, index) => `
        <div class="ranking-row">
          <strong>${index + 1}</strong>
          <div>
            <span>${esc(preventivePrimaryLabel(item.row))}</span>
            <small>${fmt(item.hours)}h vencida | ${esc(preventivePanelBranch(item.row) || "Sem filial")}</small>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function preventivePanelTable(rows) {
  if (!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  const preferred = ["Equipamento", "Placa", "Modelo", "Filial", "Vence em", "Vencida", "Desvio"];
  const allHeaders = Object.keys(rows[0] || {});
  const headers = preferred.map((name) => findPanelKey(rows[0], [name])).filter(Boolean);
  allHeaders.forEach((header) => {
    if (!headers.includes(header) && headers.length < 10) headers.push(header);
  });
  return table(headers, rows.slice(0, 250).map((row) => headers.map((header) => esc(row[header] || "-"))));
}

function preventivePanelStatuses() {
  return ["Em dia", "Vencida", "Em aderencia"];
}

function preventivePanelBranches() {
  return [...new Set(state.preventivePanel.rows.map(preventivePanelBranch).filter(Boolean))].sort(natural);
}

function preventivePanelStatus(row) {
  return isPreventiveOverdue(row) ? "Vencida" : "Em dia";
}

function preventivePanelBranch(row) {
  return valueByKey(row, ["filial", "unidade", "base"]);
}

function preventivePrimaryLabel(row) {
  const equipment = valueByKey(row, ["equipamento", "frota", "prefixo"]);
  const plate = valueByKey(row, ["placa"]);
  const model = valueByKey(row, ["modelo"]);
  return [equipment, plate, model].filter(Boolean).join(" | ") || "Preventiva";
}

function isPreventivePanelRow(row) {
  return Boolean(valueByKey(row, ["placa"]) || valueByKey(row, ["equipamento", "frota", "prefixo"]));
}

function isPreventiveOverdue(row) {
  return preventiveOverdueHours(row) > 0;
}

function isPreventiveDueSoon(row) {
  const due = preventiveDueInHours(row);
  return !isPreventiveOverdue(row) && due > 0 && due <= 50;
}

function isPreventiveAdherent(row) {
  const deviationKey = findPanelKey(row, ["desvio"]);
  if (deviationKey && String(row[deviationKey] || "").trim() !== "") {
    return Math.abs(numberValue(row[deviationKey])) <= 50;
  }
  if (isPreventiveOverdue(row)) return preventiveOverdueHours(row) <= 50;
  return isPreventiveDueSoon(row);
}

function preventiveOverdueHours(row) {
  const key = findPanelKey(row, ["vencida", "atraso"]);
  return key ? Math.max(0, numberValue(row[key])) : 0;
}

function preventiveDueInHours(row) {
  const key = findPanelKey(row, ["vence em", "vencimento"]);
  return key ? Math.max(0, numberValue(row[key])) : 0;
}

function extractPreventivePanelSummary(rows) {
  return rows.reduce((acc, row) => {
    const label = normalizeSearch(valueByKey(row, ["equipamento", "indicador", "status"]));
    const value = numberValue(valueByKey(row, ["modelo", "valor", "quantidade"]));
    if (label.includes("frota")) acc.total = value;
    if (label.includes("em dia")) acc.onTime = value;
    if (label.includes("vencida")) acc.overdue = value;
    return acc;
  }, {});
}

function preventivePanelStatusMessage() {
  const panel = state.preventivePanel;
  if (!panel.loaded) return "Aguardando carregamento da planilha.";
  return `${panel.rows.length} preventiva(s) carregada(s) da fonte publicada.`;
}

function findPanelKey(row, terms) {
  return Object.keys(row || {}).find((key) => {
    const normalizedKey = normalizeSearch(key);
    return terms.some((term) => normalizedKey.includes(normalizeSearch(term)));
  });
}

function valueByKey(row, terms) {
  const key = findPanelKey(row, terms);
  return key ? String(row[key] || "").trim() : "";
}

function numberValue(value) {
  const cleaned = String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cacheBustedUrl(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

function filterRecords(scope, rows) {
  const filters = state.filters[scope] || {};
  const query = normalizeSearch(filters.query || "");
  return rows.filter((item) => {
    const fleet = fleetById(item.fleetId);
    const statusMatch =
      !filters.status ||
      filters.status === "all" ||
      (filters.status === "open" ? (scope === "materials" ? isMaterialOpen(item) : isOpen(item)) : item.status === filters.status);
    const typeMatch = !filters.type || filters.type === "all" || item.maintenanceType === filters.type;
    const queryMatch = !query || recordSearchText(item).includes(query);
    const branchMatch = matchTextFilter(filters.branch, fleet.branch || item.branch);
    const mechanicalClassMatch = matchMechanicalClass(filters.mechanicalClass, fleet, item);
    const classMatch = matchOperationalClass(filters.operationalClass, fleet, item);
    const priorityMatch = matchTextFilter(filters.priority, item.priority);
    const stoppedMatch = !filters.isStopped || filters.isStopped === "all" || String(Boolean(item.isStopped)) === filters.isStopped;
    const serviceTypeMatch = containsFilter(filters.serviceType, item.serviceType);
    const failureTypeMatch = containsFilter(filters.failureType, item.failureType);
    const materialMatch = containsFilter(filters.material, item.material);
    const supplierMatch = containsFilter(filters.supplier, item.supplier);
    const datesMatch = [
      ["requestDate", item.requestDate],
      ["pickupDate", item.pickupDate],
      ["executionDate", item.executionDate],
      ["openedAt", item.openedAt],
      ["finishedAt", item.finishedAt],
      ["requestedAt", item.requestedAt],
      ["availableAt", item.availableAt],
      ["pickedUpAt", item.pickedUpAt]
    ].every(([key, value]) => matchDateFilter(filters[key], value));
    return statusMatch && typeMatch && queryMatch && branchMatch && mechanicalClassMatch && classMatch && priorityMatch
      && stoppedMatch && serviceTypeMatch && failureTypeMatch && materialMatch && supplierMatch && datesMatch;
  });
}

function filterFleetRows(rows, scope = "fleet") {
  const filters = state.filters[scope] || {};
  const query = normalizeSearch(filters.query || filters.fleet || filters.model || "");
  return rows.filter((item) => {
    const activeValue = item.active === false ? "inactive" : "active";
    return (!query || fleetSearchText(item).includes(query))
      && containsFilter(filters.model, item.model)
      && containsFilter(filters.manufacturer, item.manufacturer)
      && matchTextFilter(filters.branch, item.branch)
      && matchMechanicalClass(filters.mechanicalClass, item)
      && matchOperationalClass(filters.operationalClass, item)
      && matchTextFilter(filters.status, item.situation || item.status)
      && (!filters.active || filters.active === "all" || filters.active === activeValue);
  });
}

function matchTextFilter(filterValue, value) {
  return !filterValue || filterValue === "all" || normalize(filterValue) === normalize(value);
}

function containsFilter(filterValue, value) {
  return !filterValue || filterValue === "all" || normalizeSearch(value).includes(normalizeSearch(filterValue));
}

function matchDateFilter(filterValue, value) {
  if (!filterValue) return true;
  return String(value || "").slice(0, 10) === String(filterValue).slice(0, 10);
}

function matchOperationalClass(filterValue, fleet, fallback = {}) {
  if (!filterValue || filterValue === "all") return true;
  return normalize(filterValue) === normalize(fleet.operationalClass || fallback.operationalClass);
}

function matchMechanicalClass(filterValue, fleet, fallback = {}) {
  if (!filterValue || filterValue === "all") return true;
  const filter = normalize(filterValue);
  const current = normalize(mechanicalClassLabel(fleet, fallback));
  return current === filter || current.includes(filter) || filter.includes(current);
}

function mechanicalClassLabel(fleet = {}, fallback = {}) {
  if (fleet.mechanicalClass) return fleet.mechanicalClass;
  if (fallback.mechanicalClass) return fallback.mechanicalClass;
  return {
    caminhao: "Caminhões e similares",
    maquina: "Máquinas e similares",
    utilitario: "Veículos leves e similares",
    gerador: "Geradores e similares",
    outro: "Outros"
  }[fleet.category || fallback.category] || "Outros";
}

function maintenanceStatusBucket(record) {
  const status = normalize(record.status);
  if (["concluido", "concluida", "executada", "executado", "retirado"].includes(status)) return "completed";
  if (["cancelado", "cancelada"].includes(status)) return "cancelled";
  if (["aberto", "solicitado", "aguardandomaterial"].includes(status)) return "open";
  return "progress";
}

function executiveKpis(rows, overduePredicate) {
  const activeRows = rows.filter((item) => maintenanceStatusBucket(item) !== "cancelled");
  return `
    <section class="grid executive-kpi-grid">
      ${kpi("Total de registros", activeRows.length, "Resultado dos filtros", "accent")}
      ${kpi("Em aberto", activeRows.filter((item) => maintenanceStatusBucket(item) === "open").length, "Aguardando início", "purple")}
      ${kpi("Em andamento", activeRows.filter((item) => maintenanceStatusBucket(item) === "progress").length, "Fluxo em execução", "orange")}
      ${kpi("Concluídos", activeRows.filter((item) => maintenanceStatusBucket(item) === "completed").length, "Finalizados", "accent")}
      ${kpi("Vencidos", activeRows.filter(overduePredicate).length, "Acima do prazo", "danger")}
    </section>
  `;
}

function recordSearchText(record) {
  const fleet = fleetById(record.fleetId);
  return normalizeSearch([
    record.equipment,
    record.plate,
    record.model,
    record.branch,
    record.status,
    record.priority,
    record.material,
    record.maintenanceType,
    record.failureType,
    fleet.equipment,
    fleet.plate,
    fleet.model,
    fleet.branch,
    fleet.mechanicalClass,
    fleet.operationalClass
  ].join(" "));
}

function fleetRows() {
  return table(["Equipamento", "Placa", "Classe mecânica", "Classe operacional", "Modelo", "Ano", "Filial", "Status"], state.fleet.map((item) => [
    esc(item.equipment || item.id),
    esc(item.plate || "-"),
    pill(mechanicalClassLabel(item), item.active === false ? "danger" : "purple"),
    esc(item.operationalClass || "-"),
    `${esc(item.manufacturer || "")} ${esc(item.model || "-")}`,
    esc(item.yearModel || "-"),
    esc(item.branch || "-"),
    item.active === false ? pill("Inativo", "danger") : pill("Ativo", "success")
  ]));
}

function fleetBars(rows, key, color) {
  const grouped = groupRows(rows, (item) => item[key] || "Nao informado").slice(0, 10);
  if (!grouped.length) return `<div class="empty">Nenhum ativo encontrado nesta categoria.</div>`;
  return renderBars(grouped.map((item) => [item.label, item.count, color]));
}

function listPanel(title, _searchId, rows) {
  return `<article class="card table-wrap" style="margin-top:16px"><div class="card-pad"><h2>${title}</h2></div>${rows}</article>`;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  return `
    <div class="table-scroll">
      <table>
        <thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function mtrSummary(metrics) {
  const rows = [
    ["Frota patrimonial", metrics.truckPatrimonial, metrics.machinePatrimonial, metrics.totalPatrimonial],
    ["Frota operacional", metrics.truckOperational, metrics.machineOperational, metrics.totalOperational],
    ["Tecnicamente retidos", metrics.vtr.length, metrics.mtr.length, metrics.retained.length],
    ["Aguardando pecas", metrics.awaitingParts.trucks, metrics.awaitingParts.machines, metrics.awaitingParts.total],
    ["Disponibilidade", fmtPercent(metrics.truckAvailability), fmtPercent(metrics.machineAvailability), fmtPercent(metrics.totalAvailability)]
  ];
  return `
    <div class="mtr-summary">
      <div class="mtr-summary-head"><span>Indicador</span><span>Caminhoes</span><span>Maquinas</span><span>Total</span></div>
      ${rows.map((row) => `
        <div class="mtr-summary-row">
          <strong>${esc(row[0])}</strong>
          <span>${esc(row[1])}</span>
          <span>${esc(row[2])}</span>
          <span>${esc(row[3])}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function availabilityCard(label, total, retained, availabilityValue, color) {
  const retainedRate = total ? retained / total : 0;
  return `
    <div class="availability-card ${color}">
      <div>
        <span>${esc(label)}</span>
        <strong>${fmtPercent(availabilityValue)}</strong>
        <small>${retained} retido(s) de ${total} operacional(is)</small>
      </div>
      <div class="availability-meter" aria-hidden="true">
        <i style="width:${Math.min(100, Math.max(0, retainedRate * 100))}%"></i>
      </div>
    </div>
  `;
}

function mtrAlertGrid(metrics) {
  const alerts = [
    ["Sem previsao", metrics.withoutForecast, "Retidos sem previsao de saida", "warning"],
    ["Previsao vencida", metrics.forecastOverdue, "Saida planejada ja vencida", "danger"],
    ["Acima de 15 dias", metrics.over15Days, "Paradas longas", "orange"],
    ["Acima de 30 dias", metrics.over30Days, "Criticidade elevada", "danger"],
    ["Alta/Critica", metrics.criticalPriority, "Prioridade operacional", "purple"],
    ["Disponibilidade total", fmtPercent(metrics.totalAvailability), "Frota operacional", "success"]
  ];
  return `
    <div class="alert-grid">
      ${alerts.map(([label, value, hint, level]) => `
        <div class="alert-tile ${level}">
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
          <small>${esc(hint)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function rowActions(type, id) {
  return `<div class="row-actions"><button class="ghost-button" type="button" data-action="edit" data-type="${type}" data-id="${esc(id)}">Editar</button><button class="danger-button" type="button" data-action="delete" data-type="${type}" data-id="${esc(id)}">Excluir</button></div>`;
}

function kpi(label, value, hint, cls = "") {
  return `<article class="card kpi ${cls}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function pill(label, level = "info") {
  const map = { success: "success", ok: "success", warning: "warning", danger: "danger", bottleneck: "danger", purple: "purple", info: "info" };
  return `<span class="pill ${map[level] || "info"}">${esc(displayLabel(label))}</span>`;
}

function displayLabel(value) {
  const labels = {
    "Aguardando peca": "Aguardando peça",
    "Material disponivel": "Material disponível",
    "Em diagnostico": "Em diagnóstico",
    "Em execucao": "Em execução",
    "Concluido": "Concluído",
    "Disponivel": "Disponível",
    "Media": "Média",
    "Critica": "Crítica"
  };
  return labels[value] || value;
}

function stagePill(value, goal, pending = false) {
  if (pending) return `<span class="stage-chip pending" title="Etapa ainda não iniciada">Pendente</span>`;
  const level = value > goal ? "danger" : "success";
  return `<span class="stage-chip ${level}" title="Meta: ${fmt(goal)}d">${fmt(value)}d</span>`;
}

function renderBars(items, emptyText = "Sem registros para exibir.") {
  const total = items.reduce((sum, item) => sum + Number(item[1] || 0), 0);
  if (!items.length || total === 0) return `<div class="empty compact">${esc(emptyText)}</div>`;
  const max = Math.max(1, ...items.map((item) => item[1]));
  return `<div class="metric-bar">${items.map(([label, value, color]) => `
    <div class="bar-row">
      <strong>${esc(label)}</strong>
      <div class="bar-track"><div class="bar-fill ${color}" style="width:${Math.max(4, (value / max) * 100)}%"></div></div>
      <span>${value}</span>
    </div>`).join("")}</div>`;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.getAttribute("id") === "fleetImportForm") {
    await withFormLock(form, () => importFleet(form));
    return;
  }
  await submitMaintenanceForm(form);
}

async function submitMaintenanceForm(form) {
  try {
    const formId = form.getAttribute("id");
    const map = {
      preventiveForm: ["preventives", buildMaintenanceRecord],
      correctiveForm: ["correctives", buildMaintenanceRecord],
      materialForm: ["materials", buildMaintenanceRecord]
    };

    if (!map[formId]) {
      throw new Error("Formulário de manutenção não reconhecido.");
    }
    const [collectionName, builder] = map[formId];
    const record = builder(form, collectionName);
    const validation = validateRecord(collectionName, record);
    if (!validation.ok) {
      showToast(validation.message, "danger");
      return;
    }
    await withFormLock(form, async () => {
      await saveRecord(collectionName, record);
      form.reset();
      showToast(record.id ? "Registro atualizado com sucesso." : "Registro salvo com sucesso.", "success");
    });
  } catch (error) {
    console.error("Falha ao preparar registro de manutencao:", error);
    showToast(error.message || "Não foi possível preparar o registro.", "danger");
  }
}

async function saveRecord(collectionName, record) {
  const { id, ...fields } = record;
  const payload = {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  };
  if (id) {
    await setDoc(doc(db, COLLECTIONS[collectionName], id), payload, { merge: true });
  } else {
    await addDoc(collection(db, COLLECTIONS[collectionName]), {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: state.user.email
    });
  }
}

async function withFormLock(form, action) {
  const buttons = Array.from(form.querySelectorAll("button"));
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    showToast(error.message || "Não foi possível concluir a operação.", "danger");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function validateRecord(collectionName, record) {
  if (!record.fleetId) return invalid("Selecione um equipamento da frota.");
  if (collectionName === "preventives") {
    if (!record.requestDate) return invalid("Informe a data de solicitação do material.");
    return validateDateFlow([
      ["Solicitação do material", record.requestDate],
      ["Disponibilização", record.availableDate],
      ["Retirada pelo planejador", record.pickupDate],
      ["Execução", record.executionDate]
    ]);
  }
  if (collectionName === "correctives") {
    if (!record.openedAt) return invalid("Informe a data e hora de abertura da corretiva.");
    return validateDateFlow([
      ["Abertura", record.openedAt],
      ["Início do reparo", record.startedAt],
      ["Conclusão", record.finishedAt]
    ]);
  }
  if (collectionName === "materials") {
    if (!record.material || !record.material.trim()) return invalid("Informe o material solicitado.");
    if (!record.requestedAt) return invalid("Informe a data de solicitação do material.");
    return validateDateFlow([
      ["Solicitação", record.requestedAt],
      ["Disponibilização", record.availableAt],
      ["Retirada", record.pickedUpAt]
    ]);
  }
  return { ok: true };
}

function validateDateFlow(steps) {
  let previous = null;
  let previousLabel = "";
  for (const [label, value] of steps) {
    if (!value) continue;
    const current = new Date(value);
    if (Number.isNaN(current.getTime())) return invalid(`Data inválida em ${label}.`);
    if (previous && current < previous) {
      return invalid(`${label} não pode ser anterior a ${previousLabel}.`);
    }
    previous = current;
    previousLabel = label;
  }
  return { ok: true };
}

function invalid(message) {
  return { ok: false, message };
}

function buildMaintenanceRecord(form, collectionName) {
  const data = Object.fromEntries(new FormData(form).entries());
  const { _recordId: id, ...fields } = data;
  const fleet = state.fleet.find((item) => item.id === data.fleetId) || {};
  return {
    ...fields,
    id,
    isStopped: fields.isStopped === "true",
    equipment: fleet.equipment || "",
    plate: fleet.plate || "",
    branch: fleet.branch || "",
    model: fleet.model || "",
    manufacturer: fleet.manufacturer || "",
    mechanicalClass: fleet.mechanicalClass || "",
    operationalClass: fleet.operationalClass || "",
    category: fleet.category || "",
    source: "sistema-v2",
    collectionName
  };
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "delete") {
    const type = button.dataset.type;
    const record = state[type]?.find((item) => item.id === button.dataset.id);
    const reference = record ? plainFleetLabel(record) : "selecionado";
    if (confirm(`Confirma a exclusão do registro de ${reference}? Esta ação não pode ser desfeita.`)) {
      try {
        await deleteDoc(doc(db, COLLECTIONS[type], button.dataset.id));
        showToast("Registro excluído com sucesso.", "success");
      } catch (error) {
        showToast("Não foi possível excluir o registro. Tente novamente.", "danger");
      }
    }
  }
  if (action === "saveMaintenance") {
    const form = button.closest("form");
    if (form) await submitMaintenanceForm(form);
  }
  if (action === "importFleet") {
    const form = button.closest("form");
    if (form) await withFormLock(form, () => importFleet(form));
  }
  if (action === "edit") editRecord(button.dataset.type, button.dataset.id);
  if (action === "exportCsv") exportCsv();
  if (action === "savePreventivePanelSource") savePreventivePanelSource();
  if (action === "refreshPreventivePanel") ensurePreventivePanelLoaded(true);
  if (action === "exportPreventivePanel") exportPreventivePanel();
  if (action === "exportRetentionAnalysis") exportRetentionAnalysis();
  if (action === "filterPreventivePanel") {
    state.preventivePanel.filters.status = button.dataset.status || "all";
    render();
    view.querySelector("[data-preventive-panel-filter]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "applyFilters") {
    persistFilters();
    render();
    showToast("Filtros aplicados.", "success");
  }
  if (action === "clearFilters") {
    const scope = button.dataset.scope;
    if (scope === "preventivePanel") {
      state.preventivePanel.filters = { query: "", status: "all", branch: "all", mechanicalClass: "all", operationalClass: "all", priority: "all", serviceType: "all", periodStart: "", periodEnd: "" };
    } else {
      state.filters[scope] = {};
      persistFilters();
    }
    render();
  }
  if (action === "refreshView") {
    stopListeners();
    startListeners();
  }
}

function handleInput(event) {
  if (event.target.matches("[data-fleet-search]")) filterFleetSelect(event.target);
  if (event.target.matches("[data-fleet-select]")) updateFleetInfo(event.target);
  if (event.target.matches("[data-filter-field]")) updateFilter(event.target);
  if (event.target.matches("[data-preventive-panel-field]")) updatePreventivePanelFilter(event.target);
}

function handleChange(event) {
  if (event.target.matches("[data-fleet-select]")) updateFleetInfo(event.target);
  if (event.target.matches("[data-filter-field]")) updateFilter(event.target);
  if (event.target.matches("[data-preventive-panel-field]")) updatePreventivePanelFilter(event.target);
}

function updateFilter(field) {
  const bar = field.closest("[data-filter-scope]");
  if (!bar) return;
  const scope = bar.dataset.filterScope;
  state.filters[scope] = {
    ...(state.filters[scope] || {}),
    [field.dataset.filterField]: field.value
  };
  if (field.dataset.filterField === "mechanicalClass") {
    state.filters[scope].operationalClass = "all";
  }
  persistFilters();
  pendingFocus = { scope, field: field.dataset.filterField };
  scheduleRender();
}

function updatePreventivePanelFilter(field) {
  state.preventivePanel.filters[field.dataset.preventivePanelField] = field.value;
  if (field.dataset.preventivePanelField === "mechanicalClass") {
    state.preventivePanel.filters.operationalClass = "all";
  }
  scheduleRender();
}

function loadStoredFilters() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    Object.values(parsed).forEach((filters) => {
      if (filters && LEGACY_MECHANICAL_FILTERS.includes(filters.operationalClass)) {
        filters.mechanicalClass = filters.operationalClass;
        filters.operationalClass = "all";
      }
    });
    return parsed;
  } catch {
    return {};
  }
}

function persistFilters() {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state.filters));
}

function savePreventivePanelSource() {
  const input = view.querySelector("[data-panel-source]");
  const nextUrl = input ? input.value.trim() : "";
  state.preventivePanel.sheetUrl = nextUrl;
  state.preventivePanel.loaded = false;
  localStorage.setItem(PREVENTIVE_PANEL_URL_KEY, nextUrl);
  showToast("Fonte do painel de preventivas salva.", "success");
  ensurePreventivePanelLoaded(true);
}

function updateFleetInfo(selectEl) {
  const prefix = selectEl.dataset.fleetSelect;
  const target = view.querySelector(`[data-fleet-info="${prefix}"]`);
  const fleet = state.fleet.find((item) => item.id === selectEl.value);
  if (!target) return;
  target.textContent = fleet
    ? `${fleet.equipment || "-"} | ${fleet.plate || "sem placa"} | ${fleet.model || "sem modelo"} | Classe mecânica: ${mechanicalClassLabel(fleet)} | Classe operacional: ${fleet.operationalClass || "não informada"} | ${fleet.branch || "sem filial"}`
    : "Selecione um equipamento para preencher frota, modelo e filial.";
}

function filterFleetSelect(inputEl) {
  const prefix = inputEl.dataset.fleetSearch;
  const selectEl = view.querySelector(`[data-fleet-select="${prefix}"]`);
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">Selecione...</option>${fleetOptionHtml(inputEl.value, current)}`;
  if (current && Array.from(selectEl.options).some((option) => option.value === current)) {
    selectEl.value = current;
  }
  updateFleetInfo(selectEl);
}

function fleetOptionHtml(query = "", selectedFleetId = "") {
  const term = normalizeSearch(query);
  const activeFleet = state.fleet.filter((item) => item.active !== false);
  let rows = activeFleet.filter((item) => !term || fleetSearchText(item).includes(term));
  rows = rows.sort((a, b) => natural(a.equipment, b.equipment)).slice(0, term ? 120 : 80);

  if (selectedFleetId && !rows.some((item) => item.id === selectedFleetId)) {
    const selected = activeFleet.find((item) => item.id === selectedFleetId);
    if (selected) rows.unshift(selected);
  }

  return rows
    .map((item) => `<option value="${esc(item.id)}" ${item.id === selectedFleetId ? "selected" : ""}>${esc(fleetOptionLabel(item))}</option>`)
    .join("");
}

function fleetSearchText(item) {
  return normalizeSearch([
    item.equipment,
    item.plate,
    item.model,
    item.manufacturer,
    item.branch,
    item.operationalClass,
    item.mechanicalClass
  ].join(" "));
}

function fleetOptionLabel(item) {
  return `${item.equipment || item.id} - ${item.plate || "sem placa"} - ${item.model || "sem modelo"} - ${item.branch || "sem filial"}`;
}

function editRecord(type, id) {
  const record = state[type].find((item) => item.id === id);
  if (!record) return;
  const forms = {
    preventives: ["preventiveForm", preventiveForm],
    correctives: ["correctiveForm", correctiveForm],
    materials: ["materialForm", materialForm]
  };
  const [formId, renderer] = forms[type] || [];
  const form = document.querySelector(`#${formId}`);
  if (!form) return;
  form.innerHTML = renderer(record);
  const select = form.querySelector("[name='fleetId']");
  if (select) {
    select.value = record.fleetId || "";
    updateFleetInfo(select);
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function importFleet(form) {
  const file = form.querySelector("#fleetFile").files[0];
  if (!file) {
    showToast("Selecione um arquivo Excel ou CSV para atualizar a frota.", "warning");
    return;
  }
  const rows = await readFileRows(file);
  const imported = normalizeInventoryRows(rows);
  if (!imported.length) {
    throw new Error("Nenhum ativo valido foi encontrado no arquivo.");
  }
  const importedIds = new Set(imported.map((item) => item.id));
  const operations = imported.map((record) => ({
    ref: doc(db, COLLECTIONS.fleet, record.id),
    data: {
      ...record,
      active: true,
      source: "inventory",
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email
    }
  }));
  state.fleet.forEach((record) => {
    if (!importedIds.has(record.id) && record.active !== false) {
      operations.push({
        ref: doc(db, COLLECTIONS.fleet, record.id),
        data: {
        active: false,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.email
        }
      });
    }
  });
  await commitFleetOperations(operations);
  form.reset();
  showToast(`Frota atualizada: ${imported.length} ativo(s) importado(s).`, "success");
}

async function commitFleetOperations(operations) {
  const chunkSize = 450;
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(db);
    operations.slice(index, index + chunkSize).forEach((operation) => {
      batch.set(operation.ref, operation.data, { merge: true });
    });
    await batch.commit();
  }
}

async function readFileRows(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return parseCsv(await file.text());
  }
  if (!XLSX) throw new Error("Biblioteca de Excel indisponivel.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const matrix = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) matrix.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) matrix.push(row);
  const [headerRow = [], ...body] = matrix;
  const headers = headerRow.map((header, index) => header || `Coluna ${index + 1}`);
  return body.map((values) => headers.reduce((acc, header, index) => {
    acc[header] = values[index] || "";
    return acc;
  }, {}));
}

function detectCsvDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function normalizeInventoryRows(rows) {
  const unique = new Map();
  rows.forEach((row) => {
    const record = {
      mechanicalClass: pick(row, ["Classe Mecanica", "Classe Mecânica", "classe_mecanica"]),
      equipment: pick(row, ["Equipamento", "Equip.", "Equip", "equipment"]),
      plate: normalizePlate(pick(row, ["Placa", "Equip.@Placa", "Equip Placa", "plate"])),
      yearModel: pick(row, ["Ano Modelo", "Ano@Modelo", "Ano", "yearModel"]),
      operationalClass: pick(row, ["Classe Operacional", "Classe operacional2", "classe_operacional"]),
      manufacturer: pick(row, ["Fabricante", "manufacturer"]),
      model: pick(row, ["Modelo", "model"]),
      branch: pick(row, ["Filial", "Empr.Filial", "Empresa Filial", "branch"]),
      situation: pick(row, ["Situacao", "Situação", "status"])
    };
    const id = normalizeId(record.equipment);
    if (!id) return;
    unique.set(id, { ...record, id, category: categorize(record.mechanicalClass), active: true });
  });
  return Array.from(unique.values());
}

function pick(row, names) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]));
  for (const name of names) {
    const value = normalized[normalize(name)];
    if (value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeRecord(name, id, data) {
  return {
    ...data,
    id,
    active: data.active !== false
  };
}

function recordTimestamp(record) {
  const value = record.updatedAt || record.createdAt || "";
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function topBottlenecks() {
  return [
    ...state.correctives.filter(isOpen).map((item) => ({ ref: item, kind: "Corretiva", status: item.status, score: correctiveHours(item), time: `${fmt(correctiveHours(item))}h`, level: correctiveSlaLevel(item) })),
    ...state.preventives.filter(isOpen).map((item) => ({ ref: item, kind: "Preventiva", status: item.status, score: preventiveTotalDays(item) * 24, time: `${fmt(preventiveTotalDays(item))}d`, level: preventiveTotalDays(item) > GOALS.preventiveTotalDays ? "danger" : "success" })),
    ...state.materials.filter(isMaterialOpen).map((item) => ({ ref: item, kind: `Material ${item.maintenanceType || ""}`, status: item.status, score: materialLeadDays(item) * 24, time: `${fmt(materialLeadDays(item))}d`, level: materialLeadDays(item) > GOALS.materialLeadDays ? "danger" : "success" }))
  ].sort((a, b) => b.score - a.score).slice(0, 8);
}

function buildDashboardMetrics(source = {}) {
  const preventives = source.preventives || state.preventives;
  const correctives = source.correctives || state.correctives;
  const materials = source.materials || state.materials;
  const openPreventives = preventives.filter(isOpen);
  const openCorrectives = correctives.filter(isOpen);
  const pendingMaterials = materials.filter(isMaterialOpen);
  const stopped = openCorrectives.filter((item) => item.isStopped);
  const allMonitorable = [
    ...preventives.map((item) => ({ ref: item, type: "Preventiva", overdue: preventiveTotalDays(item) > GOALS.preventiveTotalDays && isOpen(item), hours: preventiveTotalDays(item) * 24 })),
    ...correctives.map((item) => ({ ref: item, type: "Corretiva", overdue: correctiveSlaLevel(item) === "danger" && isOpen(item), hours: correctiveHours(item) })),
    ...materials.map((item) => ({ ref: item, type: "Material", overdue: materialLeadDays(item) > GOALS.materialLeadDays && isMaterialOpen(item), hours: materialLeadDays(item) * 24 }))
  ];
  const overdue = allMonitorable.filter((item) => item.overdue);
  const onTime = allMonitorable.filter((item) => !item.overdue);
  const bottleneckHours = overdue.map((item) => item.hours);
  const biggestBottleneck = topBottlenecks()[0];
  return {
    preventives,
    correctives,
    materials,
    openPreventives,
    openCorrectives,
    pendingMaterials,
    stopped,
    totalMaintenances: preventives.length + correctives.length,
    openMaintenances: openPreventives.length + openCorrectives.length,
    overdue,
    onTime,
    averageBottleneckHours: average(bottleneckHours),
    biggestBottleneck: biggestBottleneck ? {
      time: biggestBottleneck.time,
      label: `${biggestBottleneck.kind} - ${plainFleetLabel(biggestBottleneck.ref)}`
    } : null,
    criticalEquipments: buildCriticalEquipments(openCorrectives, openPreventives, pendingMaterials),
    awaitingPartsStopped: stopped.filter((item) => isAwaitingCorrectiveMaterial(item)).length
  };
}

function buildCriticalEquipments(openCorrectives, openPreventives, pendingMaterials) {
  return [
    ...openCorrectives
      .filter((item) => item.isStopped || ["Critica", "Alta"].includes(item.priority) || correctiveSlaLevel(item) === "danger")
      .map((item) => ({
        ref: item,
        reason: item.isStopped ? "Equipamento parado" : `Corretiva ${item.priority || "sem prioridade"}`,
        impact: `${fmt(correctiveHours(item))}h`,
        level: item.isStopped || correctiveSlaLevel(item) === "danger" ? "danger" : "warning"
      })),
    ...openPreventives
      .filter((item) => preventiveTotalDays(item) > GOALS.preventiveTotalDays)
      .map((item) => ({
        ref: item,
        reason: "Preventiva acima da meta",
        impact: `${fmt(preventiveTotalDays(item))}d`,
        level: "danger"
      })),
    ...pendingMaterials
      .filter((item) => materialLeadDays(item) > GOALS.materialLeadDays)
      .map((item) => ({
        ref: item,
        reason: `Material ${item.maintenanceType || ""} pendente`,
        impact: `${fmt(materialLeadDays(item))}d`,
        level: "warning"
      }))
  ].sort((a, b) => criticalScore(b) - criticalScore(a));
}

function criticalScore(item) {
  const value = parseFloat(String(item.impact).replace(",", ".")) || 0;
  return (item.level === "danger" ? 1000 : 0) + value;
}

function stageBottleneckRows() {
  const stages = [
    ["Solicitação → Disponibilização", average(state.preventives.filter((item) => item.requestDate).map((item) => daysBetween(item.requestDate, item.availableDate || today())))],
    ["Disponibilização → Retirada", average(state.preventives.filter((item) => item.availableDate).map((item) => daysBetween(item.availableDate, item.pickupDate || today())))],
    ["Retirada → Execução", average(state.preventives.filter((item) => item.pickupDate).map((item) => daysBetween(item.pickupDate, item.executionDate || today())))],
    ["Material solicitado → retirado", average(state.materials.filter((item) => item.requestedAt).map(materialLeadDays))],
    ["Corretiva aberta", average(state.correctives.filter(isOpen).map((item) => correctiveHours(item) / 24))]
  ];
  return stages.map(([label, value]) => ({
    label,
    value: Number(value.toFixed(1)),
    level: value > GOALS.preventiveTotalDays ? "danger" : value > 1 ? "orange" : "purple"
  }));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildMtrMetrics() {
  const filters = state.filters.mtr || {};
  const activeFleet = state.fleet.filter((item) => item.active !== false).filter((fleet) => {
    const query = normalizeSearch(filters.query || "");
    return (!query || fleetSearchText(fleet).includes(query))
      && matchTextFilter(filters.branch, fleet.branch)
      && matchMechanicalClass(filters.mechanicalClass, fleet)
      && matchOperationalClass(filters.operationalClass, fleet);
  });
  const allowedFleetIds = new Set(activeFleet.map((item) => item.id));
  const filteredCorrectives = state.correctives.filter((item) => {
    const fleet = fleetById(item.fleetId);
    const retainedNow = isOpen(item) && item.isStopped;
    const awaitingParts = isAwaitingCorrectiveMaterial(item);
    const openedDate = String(item.openedAt || "").slice(0, 10);
    return allowedFleetIds.has(item.fleetId)
      && matchTextFilter(filters.status, item.status)
      && (!filters.retained || filters.retained === "all" || String(retainedNow) === filters.retained)
      && (!filters.awaitingParts || filters.awaitingParts === "all" || String(awaitingParts) === filters.awaitingParts)
      && (!filters.periodStart || openedDate >= filters.periodStart)
      && (!filters.periodEnd || openedDate <= filters.periodEnd)
      && (!filters.query || recordSearchText({ ...item, ...fleet }).includes(normalizeSearch(filters.query)));
  });
  const truckFleet = activeFleet.filter((item) => item.category === "caminhao");
  const machineFleet = activeFleet.filter((item) => item.category === "maquina");
  const operationalFleet = activeFleet.filter(isOperationalFleet);
  const operationalTrucks = operationalFleet.filter((item) => item.category === "caminhao");
  const operationalMachines = operationalFleet.filter((item) => item.category === "maquina");
  const retained = filteredCorrectives
    .filter((item) => isOpen(item) && item.isStopped && fleetById(item.fleetId).active !== false)
    .sort((a, b) => correctiveHours(b) - correctiveHours(a));
  const vtr = retained.filter((item) => categoryOfFleet(item.fleetId) === "caminhao");
  const mtr = retained.filter((item) => categoryOfFleet(item.fleetId) === "maquina");
  const awaitingParts = retained.filter((item) => isAwaitingCorrectiveMaterial(item));
  const operationalTotal = operationalFleet.length;
  const stoppedDays = retained.map((item) => correctiveHours(item) / 24);
  const longestStopped = retained[0] || null;
  const classFailures = buildOperationalClassFailures(activeFleet, retained, filteredCorrectives);
  const retentionAnalysis = buildRetentionAnalysis(activeFleet, retained, filteredCorrectives);
  return {
    totalPatrimonial: activeFleet.length,
    truckPatrimonial: truckFleet.length,
    machinePatrimonial: machineFleet.length,
    totalOperational: operationalFleet.length,
    truckOperational: operationalTrucks.length,
    machineOperational: operationalMachines.length,
    retained,
    vtr,
    mtr,
    awaitingParts: {
      trucks: awaitingParts.filter((item) => categoryOfFleet(item.fleetId) === "caminhao").length,
      machines: awaitingParts.filter((item) => categoryOfFleet(item.fleetId) === "maquina").length,
      total: awaitingParts.length
    },
    retainedRate: operationalTotal ? retained.length / operationalTotal : 0,
    averageStoppedDays: average(stoppedDays),
    longestStoppedDays: longestStopped ? correctiveHours(longestStopped) / 24 : 0,
    longestStoppedLabel: longestStopped ? plainFleetLabel(longestStopped) : "",
    forecastOverdue: retained.filter(isForecastOverdue).length,
    withoutForecast: retained.filter((item) => !item.forecastAt && !item.expectedExitAt && !item.finishedAt).length,
    over15Days: retained.filter((item) => correctiveHours(item) / 24 > 15).length,
    over30Days: retained.filter((item) => correctiveHours(item) / 24 > 30).length,
    criticalPriority: retained.filter((item) => ["Critica", "Alta"].includes(item.priority)).length,
    ageBuckets: {
      upTo3: retained.filter((item) => correctiveHours(item) / 24 <= 3).length,
      upTo7: retained.filter((item) => {
        const days = correctiveHours(item) / 24;
        return days > 3 && days <= 7;
      }).length,
      upTo15: retained.filter((item) => {
        const days = correctiveHours(item) / 24;
        return days > 7 && days <= 15;
      }).length,
      over15: retained.filter((item) => correctiveHours(item) / 24 > 15).length
    },
    classFailures,
    retentionAnalysis,
    filteredCorrectives,
    truckAvailability: availability(operationalTrucks.length, vtr.length),
    machineAvailability: availability(operationalMachines.length, mtr.length),
    totalAvailability: availability(operationalTotal, retained.length)
  };
}

function buildOperationalClassFailures(activeFleet, retained, correctives = state.correctives) {
  const retainedIds = new Set(retained.map((item) => item.id));
  const fleetTotals = activeFleet.reduce((acc, fleet) => {
    const category = fleet.category || "outro";
    const mechanicalClass = mechanicalClassLabel(fleet);
    const label = fleet.operationalClass || "Sem classe operacional";
    const key = `${mechanicalClass}::${label}`;
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
  const groups = new Map();

  correctives
    .filter((item) => !["cancelado", "cancelada"].includes(normalize(item.status)))
    .forEach((item) => {
      const fleet = fleetById(item.fleetId);
      if (!fleet.id || fleet.active === false) return;
      const category = fleet.category || item.category || "outro";
      const mechanicalClass = mechanicalClassLabel(fleet, item);
      const label = fleet.operationalClass || item.operationalClass || "Sem classe operacional";
      const key = `${mechanicalClass}::${label}`;
      const current = groups.get(key) || {
        label,
        category,
        mechanicalClass,
        failures: 0,
        assetIds: new Set(),
        retainedNow: 0
      };
      current.failures += 1;
      current.assetIds.add(item.fleetId);
      if (retainedIds.has(item.id)) current.retainedNow += 1;
      groups.set(key, current);
    });

  const ranking = Array.from(groups.entries())
    .map(([key, item]) => {
      const fleetCount = fleetTotals.get(key) || 0;
      return {
        label: item.label,
        category: item.category,
        mechanicalClass: item.mechanicalClass,
        failures: item.failures,
        affectedAssets: item.assetIds.size,
        retainedNow: item.retainedNow,
        ratePer100: fleetCount ? (item.failures / fleetCount) * 100 : 0
      };
    })
    .sort((a, b) => b.failures - a.failures || b.ratePer100 - a.ratePer100 || natural(a.label, b.label));

  return {
    ranking,
    trucks: ranking.filter((item) => item.category === "caminhao"),
    machines: ranking.filter((item) => item.category === "maquina"),
    totalFailures: ranking.reduce((sum, item) => sum + item.failures, 0)
  };
}

function buildRetentionAnalysis(activeFleet, retained, correctives) {
  const retainedByFleet = new Map(retained.map((item) => [item.fleetId, item]));
  const failureCount = correctives.reduce((acc, item) => {
    acc.set(item.fleetId, (acc.get(item.fleetId) || 0) + 1);
    return acc;
  }, new Map());
  const groups = new Map();

  activeFleet.forEach((fleet) => {
    const mechanicalClass = mechanicalClassLabel(fleet);
    const operationalClass = fleet.operationalClass || "Não classificado";
    const key = `${mechanicalClass}::${operationalClass}`;
    const group = groups.get(key) || {
      mechanicalClass,
      operationalClass,
      total: 0,
      operational: 0,
      retained: 0,
      awaitingParts: 0,
      stoppedDays: [],
      failures: 0
    };
    const retainedRecord = retainedByFleet.get(fleet.id);
    group.total += 1;
    group.operational += retainedRecord ? 0 : 1;
    group.failures += failureCount.get(fleet.id) || 0;
    if (retainedRecord) {
      const days = correctiveHours(retainedRecord) / 24;
      group.retained += 1;
      group.stoppedDays.push(days);
      if (isAwaitingCorrectiveMaterial(retainedRecord)) group.awaitingParts += 1;
    }
    groups.set(key, group);
  });

  const rows = Array.from(groups.values()).map((group) => ({
    ...group,
    retentionRate: group.total ? group.retained / group.total : 0,
    availability: availability(group.total, group.retained),
    averageStoppedDays: average(group.stoppedDays),
    longestStoppedDays: group.stoppedDays.length ? Math.max(...group.stoppedDays) : 0,
    impact: group.retained * 100 + group.awaitingParts * 35 + group.failures * 10 + average(group.stoppedDays)
  }));
  const sortBy = (field, ascending = false) => [...rows]
    .sort((a, b) => ascending ? a[field] - b[field] : b[field] - a[field])
    .slice(0, 10);
  return {
    rows: rows.sort((a, b) => b.retained - a.retained || b.failures - a.failures || natural(a.operationalClass, b.operationalClass)),
    mostFailures: sortBy("failures"),
    mostRetention: sortBy("retentionRate"),
    lowestAvailability: sortBy("availability", true),
    mostAwaitingParts: sortBy("awaitingParts"),
    longestStopped: sortBy("longestStoppedDays"),
    cards: {
      mostFailures: sortBy("failures")[0],
      mostRetention: sortBy("retentionRate")[0],
      lowestAvailability: sortBy("availability", true)[0],
      mostAwaitingParts: sortBy("awaitingParts")[0],
      longestAverage: sortBy("averageStoppedDays")[0],
      highestImpact: sortBy("impact")[0]
    }
  };
}

function renderRetentionAnalysis(metrics) {
  const analysis = metrics.retentionAnalysis;
  const cards = analysis.cards;
  const cardValue = (item, formatter = (value) => value) => item ? `${esc(item.operationalClass)} | ${formatter(item)}` : "Sem dados";
  return `
    <section class="section-block">
      <div class="section-title">
        <div>
          <p class="eyebrow">Visão gerencial</p>
          <h2>Análise de Retenções por Classe Operacional</h2>
          <p>Classes operacionais analisadas dentro de suas respectivas classes mecânicas.</p>
        </div>
      </div>
      <div class="grid executive-card-grid">
        ${executiveInsight("Classe que mais quebra", cardValue(cards.mostFailures, (item) => `${item.failures} falha(s)`), "purple")}
        ${executiveInsight("Maior retenção", cardValue(cards.mostRetention, (item) => fmtPercent(item.retentionRate)), "danger")}
        ${executiveInsight("Menor disponibilidade", cardValue(cards.lowestAvailability, (item) => fmtPercent(item.availability)), "orange")}
        ${executiveInsight("Mais aguardando peças", cardValue(cards.mostAwaitingParts, (item) => `${item.awaitingParts} ativo(s)`), "warning")}
        ${executiveInsight("Maior tempo médio parado", cardValue(cards.longestAverage, (item) => `${fmt(item.averageStoppedDays)}d`), "danger")}
        ${executiveInsight("Maior impacto operacional", cardValue(cards.highestImpact, (item) => `${fmt(item.impact)} pts`), "accent")}
      </div>
      <div class="grid analytics-grid" style="margin-top:16px">
        <article class="card card-pad">
          <h2>Retenção por classe operacional</h2>
          ${renderBars(analysis.mostRetention.map((item) => [item.operationalClass, Number((item.retentionRate * 100).toFixed(1)), "danger"]), "Não há retenções no filtro atual.")}
        </article>
        <article class="card card-pad">
          <h2>Disponibilidade por classe operacional</h2>
          ${renderBars([...analysis.rows].sort((a, b) => a.availability - b.availability).slice(0, 10).map((item) => [item.operationalClass, Number((item.availability * 100).toFixed(1)), "success"]), "Não há classes operacionais para comparar.")}
        </article>
      </div>
      <article class="card" style="margin-top:16px">
        <div class="card-pad section-heading">
          <div><h2>Ranking executivo por classe operacional</h2><p class="muted">Cada classe operacional permanece vinculada à sua classe mecânica.</p></div>
          <div class="toolbar">
            <span class="data-badge">${analysis.rows.length} grupo(s)</span>
            <button class="ghost-button" type="button" data-action="exportRetentionAnalysis">Exportar Excel</button>
          </div>
        </div>
        <div class="table-wrap">
          ${table(["Classe mecânica", "Classe operacional", "Frota total", "Operacional", "Retidos", "% retenção", "Disponibilidade", "Aguardando peças", "Média parada", "Maior parada", "Falhas"], analysis.rows.map((item) => [
            esc(item.mechanicalClass),
            `<strong>${esc(item.operationalClass)}</strong>`,
            item.total,
            item.operational,
            item.retained,
            fmtPercent(item.retentionRate),
            fmtPercent(item.availability),
            item.awaitingParts,
            `${fmt(item.averageStoppedDays)}d`,
            `${fmt(item.longestStoppedDays)}d`,
            item.failures
          ]))}
        </div>
      </article>
      <div class="grid ranking-grid" style="margin-top:16px">
        ${rankingCard("Top 10 Classes que Mais Quebram", analysis.mostFailures, "failures", (item) => `${item.failures} falha(s)`)}
        ${rankingCard("Top 10 Maior Retenção", analysis.mostRetention, "retentionRate", (item) => fmtPercent(item.retentionRate))}
        ${rankingCard("Top 10 Menor Disponibilidade", analysis.lowestAvailability, "availability", (item) => fmtPercent(item.availability))}
        ${rankingCard("Top 10 Mais Aguardando Peças", analysis.mostAwaitingParts, "awaitingParts", (item) => `${item.awaitingParts} ativo(s)`)}
        ${rankingCard("Top 10 Maior Tempo Parado", analysis.longestStopped, "longestStoppedDays", (item) => `${fmt(item.longestStoppedDays)}d`)}
      </div>
    </section>
  `;
}

function executiveInsight(label, value, level) {
  return `<article class="card executive-insight ${level}"><span>${esc(label)}</span><strong>${value}</strong></article>`;
}

function rankingCard(title, rows, _field, formatter) {
  return `<article class="card card-pad"><h2>${esc(title)}</h2>${rows.length ? `<ol class="ranking-list">${rows.map((item) => `<li><span>${esc(item.operationalClass)}<small>${esc(item.mechanicalClass)}</small></span><strong>${esc(formatter(item))}</strong></li>`).join("")}</ol>` : `<div class="empty compact">Sem dados no filtro atual.</div>`}</article>`;
}

function isForecastOverdue(record) {
  const forecast = record.forecastAt || record.expectedExitAt;
  if (!forecast || !isOpen(record)) return false;
  return new Date(forecast) < new Date();
}

function isOperationalFleet(record) {
  const situation = normalize(record.situation || record.status || "");
  if (!situation) return record.active !== false;
  return situation.includes("emuso") || situation.includes("operacional") || situation.includes("ativo");
}

function availability(total, retained) {
  if (!total) return 0;
  return Math.max(0, 1 - retained / total);
}

function fmtPercent(value) {
  return `${((Number(value) || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function groupRows(rows, getter) {
  const grouped = rows.reduce((acc, item) => {
    const label = String(getter(item) || "Nao informado").trim() || "Nao informado";
    acc.set(label, (acc.get(label) || 0) + 1);
    return acc;
  }, new Map());
  return Array.from(grouped.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || natural(a.label, b.label));
}

function severityColor(value) {
  const text = normalize(value);
  if (text.includes("critica") || text.includes("alta")) return "danger";
  if (text.includes("media")) return "warning";
  if (text.includes("aguardandopeca") || text.includes("concessionario") || text.includes("bloqueado")) return "danger";
  if (text.includes("diagnostico") || text.includes("reforma") || text.includes("servico")) return "warning";
  if (text.includes("concluido") || text.includes("liberado")) return "success";
  return "purple";
}

function isOpen(record) {
  return !["concluido", "concluida", "cancelado", "cancelada", "executado", "executada"].includes(normalize(record.status));
}

function isMaterialOpen(record) {
  return !["retirado", "cancelado"].includes(normalize(record.status));
}

function isAwaitingCorrectiveMaterial(corrective) {
  if (normalize(corrective.status).includes("aguardandopeca")) return true;
  return state.materials.some((material) => (
    material.fleetId === corrective.fleetId
    && normalize(material.maintenanceType) === "corretiva"
    && isMaterialOpen(material)
  ));
}

function preventiveTotalDays(record) {
  const start = record.requestDate;
  const end = record.executionDate || today();
  return daysBetween(start, end);
}

function materialLeadDays(record) {
  return daysBetween(record.requestedAt, record.pickedUpAt || record.availableAt || today());
}

function correctiveHours(record) {
  const start = record.openedAt;
  const end = record.finishedAt || new Date().toISOString();
  return hoursBetween(start, end);
}

function correctiveSlaLevel(record) {
  const hours = correctiveHours(record);
  const goal = GOALS.correctiveHours[record.priority] || GOALS.correctiveHours.Media;
  if (!isOpen(record)) return "success";
  if (hours > goal) return "danger";
  if (hours >= goal * 0.8) return "warning";
  return "success";
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const endDate = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diff = endDate - startDate;
  return Math.max(0, diff / 86400000);
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, (endDate - startDate) / 3600000);
}

function fleetLabel(record) {
  const fleet = state.fleet.find((item) => item.id === record.fleetId) || record;
  return `<strong>${esc(fleet.equipment || record.equipment || "-")}</strong><span class="subtle">${esc(fleet.plate || record.plate || "sem placa")} - ${esc(fleet.model || record.model || "sem modelo")} - ${esc(fleet.branch || record.branch || "sem filial")}</span>`;
}

function plainFleetLabel(record) {
  const fleet = fleetById(record.fleetId);
  return fleet.equipment || record.equipment || "-";
}

function fleetById(fleetId) {
  return state.fleet.find((item) => item.id === fleetId) || {};
}

function categoryOfFleet(fleetId) {
  return fleetById(fleetId).category || "outro";
}

function labelCategory(category) {
  return { caminhao: "Caminhao", maquina: "Maquina", utilitario: "Utilitario", gerador: "Gerador", outro: "Outro" }[category] || "Outro";
}

function categorize(value) {
  const text = normalize(value);
  if (text.includes("caminh")) return "caminhao";
  if (text.includes("maquina")) return "maquina";
  if (text.includes("utilitario") || text.includes("vuc")) return "utilitario";
  if (text.includes("gerador")) return "gerador";
  return "outro";
}

function exportCsv() {
  const sheets = [
    {
      name: "Preventivas",
      rows: [
        ["ID", "Equipamento", "Placa", "Filial", "Modelo", "Classe mecânica", "Classe operacional", "Status", "Prioridade", "Tipo", "Solicitação", "Disponibilização", "Retirada", "Execução", "Lead time (dias)", "Em atraso"],
        ...state.preventives.map((item) => excelMaintenanceIdentity(item).concat([
          item.status,
          displayLabel(item.priority || ""),
          item.serviceType || "",
          item.requestDate || "",
          item.availableDate || "",
          item.pickupDate || "",
          item.executionDate || "",
          preventiveTotalDays(item),
          preventiveTotalDays(item) > GOALS.preventiveTotalDays ? "Sim" : "Não"
        ]))
      ]
    },
    {
      name: "Corretivas",
      rows: [
        ["ID", "Equipamento", "Placa", "Filial", "Modelo", "Classe mecânica", "Classe operacional", "Status", "Prioridade", "Equipamento parado", "Abertura", "Início do reparo", "Conclusão", "O.S.", "Tipo de falha", "Tempo (horas)", "Fora do SLA"],
        ...state.correctives.map((item) => excelMaintenanceIdentity(item).concat([
          displayLabel(item.status || ""),
          displayLabel(item.priority || ""),
          item.isStopped ? "Sim" : "Não",
          item.openedAt || "",
          item.startedAt || "",
          item.finishedAt || "",
          item.workOrder || "",
          item.failureType || "",
          Number(correctiveHours(item).toFixed(1)),
          correctiveSlaLevel(item) === "danger" ? "Sim" : "Não"
        ]))
      ]
    },
    {
      name: "Materiais",
      rows: [
        ["ID", "Equipamento", "Placa", "Filial", "Modelo", "Classe mecânica", "Classe operacional", "Status", "Tipo de manutenção", "Material", "Quantidade", "Fornecedor", "Solicitação", "Disponibilização", "Retirada", "Lead time (dias)", "Em atraso"],
        ...state.materials.map((item) => excelMaintenanceIdentity(item).concat([
          displayLabel(item.status || ""),
          item.maintenanceType || "",
          item.material || "",
          item.quantity || "",
          item.supplier || "",
          item.requestedAt || "",
          item.availableAt || "",
          item.pickedUpAt || "",
          materialLeadDays(item),
          materialLeadDays(item) > GOALS.materialLeadDays ? "Sim" : "Não"
        ]))
      ]
    }
  ];
  if (exportExcelWorkbook(sheets, `manutencao-multilixo-${today()}.xlsx`)) {
    showToast("Arquivo Excel gerado com sucesso.", "success");
  }
}

function exportPreventivePanel() {
  const rows = preventivePanelVisibleRows();
  if (!rows.length) {
    showToast("Nao ha dados de preventivas para exportar.", "warning");
    return;
  }
  const headers = Object.keys(rows[0]);
  if (exportExcelWorkbook([{
    name: "Painel Preventivas",
    rows: [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]
  }], `painel-preventivas-${today()}.xlsx`)) {
    showToast("Painel de preventivas exportado para Excel.", "success");
  }
}

function exportRetentionAnalysis() {
  const rows = buildMtrMetrics().retentionAnalysis.rows;
  if (!rows.length) {
    showToast("Não há dados de retenção para exportar.", "warning");
    return;
  }
  const data = [
    ["classe_mecanica", "classe_operacional", "frota_total", "frota_operacional", "retidos", "percentual_retencao", "disponibilidade", "aguardando_pecas", "media_dias_parada", "maior_parada", "falhas"],
    ...rows.map((item) => [
      item.mechanicalClass,
      item.operationalClass,
      item.total,
      item.operational,
      item.retained,
      fmtPercent(item.retentionRate),
      fmtPercent(item.availability),
      item.awaitingParts,
      fmt(item.averageStoppedDays),
      fmt(item.longestStoppedDays),
      item.failures
    ])
  ];
  if (exportExcelWorkbook([{ name: "Retenções VTR MTR", rows: data }], `retencoes-vtr-mtr-${today()}.xlsx`)) {
    showToast("Análise de retenções exportada para Excel.", "success");
  }
}

function excelMaintenanceIdentity(record) {
  const fleet = fleetById(record.fleetId);
  return [
    record.id || "",
    fleet.equipment || record.equipment || "",
    fleet.plate || record.plate || "",
    fleet.branch || record.branch || "",
    fleet.model || record.model || "",
    mechanicalClassLabel(fleet, record),
    fleet.operationalClass || record.operationalClass || ""
  ];
}

function exportExcelWorkbook(sheets, filename) {
  if (!XLSX) {
    showToast("A biblioteca de Excel não está disponível. Atualize a página e tente novamente.", "danger");
    return false;
  }
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const columnCount = Math.max(0, ...rows.map((row) => row.length));
    worksheet["!cols"] = Array.from({ length: columnCount }, (_, index) => {
      const width = Math.max(...rows.slice(0, 300).map((row) => String(row[index] ?? "").length), 10);
      return { wch: Math.min(45, width + 2) };
    });
    if (rows.length && rows[0].length) {
      worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: Math.max(0, rows.length - 1), c: rows[0].length - 1 }
      }) };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
  });
  XLSX.writeFile(workbook, filename, { compression: true });
  return true;
}

function countAll() {
  return state.fleet.length + state.preventives.length + state.correctives.length + state.materials.length;
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-");
}

function normalizePlate(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function fmt(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateTimeLocalNow() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function natural(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
}

function esc(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function showToast(message, level = "info") {
  toast.textContent = message;
  toast.dataset.state = level;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4200);
}

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, "\"\"")}"`;
}
