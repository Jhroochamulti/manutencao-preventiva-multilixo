const STORAGE_KEY = "multilixo-preventivas";
const EDIT_KEY_STORAGE = "multilixo-edit-key";
const SHARED_API_URL = "https://script.google.com/macros/s/AKfycbzXhMpVZQeFS4PEujgoNT47IKeIfbJ1G_PxEy7cPEuubEvEuEu5T9DoIHbh9UV5J-oZ/exec";

const defaultRecords = [
  {
    id: "mlx-default-001",
    machine: "Escavadeira Volvo EC210",
    fleet: "MLX-042",
    branch: "Matriz",
    model: "Volvo EC210",
    year: "2021",
    serviceType: "Óleo + filtros",
    status: "Concluída",
    requestDate: "2026-05-03",
    availableDate: "2026-05-08",
    pickupDate: "2026-05-10",
    executionDate: "2026-05-17",
    notes: "Filtro separador chegou depois do kit principal."
  },
  {
    id: "mlx-default-002",
    machine: "Caminhao compactador",
    fleet: "MLX-118",
    branch: "Operacional",
    model: "Compactador",
    year: "2020",
    serviceType: "Troca de óleo do motor",
    status: "Concluída",
    requestDate: "2026-05-11",
    availableDate: "2026-05-12",
    pickupDate: "2026-05-15",
    executionDate: "2026-05-16",
    notes: "Aguardou janela operacional."
  },
  {
    id: "mlx-default-003",
    machine: "Pa carregadeira 02",
    fleet: "MLX-077",
    branch: "Matriz",
    model: "Pá carregadeira",
    year: "2019",
    serviceType: "Sistema hidráulico",
    status: "Concluída",
    requestDate: "2026-05-18",
    availableDate: "2026-05-24",
    pickupDate: "2026-05-24",
    executionDate: "2026-05-29",
    notes: "Gargalo concentrado em disponibilidade de material."
  }
];

let records = [];
let activeFilter = "all";
let searchTerm = "";
const inventoryRecords = Array.isArray(window.MULTILIXO_INVENTARIO) ? window.MULTILIXO_INVENTARIO : [];
const inventoryByPlate = new Map(inventoryRecords.map((item) => [normalizePlate(item.placa), item]));
const INDICATOR_GOALS = {
  leadTime: 2.5,
  almoxarifado: 0,
  planejamento: 0.5,
  execucao: 2
};

const form = document.querySelector("#maintenanceForm");
const formPanel = document.querySelector("#formPanel");
const formTitle = document.querySelector("#formTitle");
const rowTemplate = document.querySelector("#rowTemplate");
const recordsTable = document.querySelector("#recordsTable");
const tableWrap = document.querySelector(".table-wrap");
const fleetInput = document.querySelector("#fleet");
const inventoryStatus = document.querySelector("#inventoryStatus");
const plateOptions = document.querySelector("#plateOptions");

populatePlateOptions();

document.querySelector("#openFormButton").addEventListener("click", () => {
  openPreventiveForm();
});

document.querySelector("#closeFormButton").addEventListener("click", () => {
  form.reset();
  document.querySelector("#recordId").value = "";
  formTitle.textContent = "Nova preventiva";
});

document.querySelector("#resetFormButton").addEventListener("click", () => {
  document.querySelector("#recordId").value = "";
  formTitle.textContent = "Nova preventiva";
});

document.querySelector("#quickNewButton").addEventListener("click", () => {
  openPreventiveForm();
});

fleetInput.addEventListener("input", () => {
  applyInventoryLookup(fleetInput.value);
});

fleetInput.addEventListener("blur", () => {
  applyInventoryLookup(fleetInput.value, true);
});

document.querySelector("#exportPanelButton").addEventListener("click", exportPanelCsv);
document.querySelector("#exportPdfButton").addEventListener("click", exportPanelPdf);

document.querySelector("#searchInput").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    render();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const record = {
    id: document.querySelector("#recordId").value || crypto.randomUUID(),
    machine: formData.get("machine").trim(),
    fleet: formData.get("fleet").trim().toUpperCase(),
    branch: formData.get("branch").trim(),
    model: formData.get("model").trim(),
    year: formData.get("year"),
    serviceType: formData.get("serviceType"),
    status: formData.get("status"),
    requestDate: formData.get("requestDate"),
    availableDate: formData.get("availableDate"),
    pickupDate: formData.get("pickupDate"),
    executionDate: formData.get("executionDate"),
    notes: formData.get("notes").trim()
  };

  if (!datesAreSequential(record)) {
    alert("As datas precisam seguir a ordem do processo: solicitação, disponibilização, retirada e execução.");
    return;
  }

  if (!statusMatchesDates(record)) {
    alert("O status selecionado precisa combinar com as datas preenchidas.");
    return;
  }

  const existingIndex = records.findIndex((item) => item.id === record.id);
  const action = existingIndex >= 0 ? "update" : "create";

  try {
    const result = await sharedRequest(action, record);
    const savedRecord = result.record || record;

    if (existingIndex >= 0) {
      records[existingIndex] = savedRecord;
    } else {
      records.unshift(savedRecord);
    }

    persistLocal();
    form.reset();
    document.querySelector("#recordId").value = "";
    formTitle.textContent = "Nova preventiva";
    render();
  } catch (error) {
    alert(`Não foi possível salvar na planilha compartilhada: ${error.message}`);
  }
});

if (window.location.hash === "#nova-preventiva") {
  setTimeout(openPreventiveForm, 120);
}

const editIdFromUrl = new URLSearchParams(window.location.search).get("edit");

function openPreventiveForm() {
  formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  fleetInput.focus();
}

function populatePlateOptions() {
  if (!plateOptions || !inventoryRecords.length) return;

  plateOptions.innerHTML = inventoryRecords
    .map((item) => `<option value="${escapeHtml(item.placa)}">${escapeHtml(item.equipamento)} - ${escapeHtml(item.modelo)}</option>`)
    .join("");
}

function applyInventoryLookup(value, showMissing = false) {
  const plate = normalizePlate(value);

  if (!plate) {
    setInventoryStatus("Digite a placa para buscar equipamento, filial, modelo e ano.", "");
    return;
  }

  const item = inventoryByPlate.get(plate);

  if (!item) {
    if (showMissing || plate.length >= 5) {
      setInventoryStatus("Placa não encontrada na base. Os campos podem ser preenchidos manualmente.", "warning");
    }
    return;
  }

  fleetInput.value = item.placa;
  document.querySelector("#machine").value = item.equipamento;
  document.querySelector("#branch").value = item.filial;
  document.querySelector("#model").value = item.modelo;
  document.querySelector("#year").value = item.ano;
  setInventoryStatus(`Dados preenchidos pela base: ${item.equipamento} - ${item.modelo}.`, "success");
}

function setInventoryStatus(text, state) {
  if (!inventoryStatus) return;

  inventoryStatus.textContent = text;
  inventoryStatus.dataset.state = state;
}

function normalizePlate(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function loadRecords() {
  const localRecords = readLocalRecords().filter((record) => !String(record.id || "").startsWith("mlx-default-"));

  try {
    const result = await sharedRequest("list");
    records = Array.isArray(result.records) ? result.records : [];

    if (!records.length && localRecords.length) {
      records = await migrateLocalRecords(localRecords);
    }

    persistLocal();
  } catch (error) {
    console.warn("Usando dados locais porque a planilha compartilhada não respondeu.", error);
    records = localRecords;
  }
}

function readLocalRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.warn("Dados locais inválidos.", error);
    return [];
  }
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

async function migrateLocalRecords(localRecords) {
  const shouldMigrate = confirm(
    `Encontramos ${localRecords.length} preventiva(s) salvas neste navegador. Deseja enviar esses dados para a planilha compartilhada?`
  );

  if (!shouldMigrate) return localRecords;

  const migrated = [];

  for (const record of localRecords) {
    const result = await sharedRequest("create", record);
    migrated.push(result.record || record);
  }

  return migrated;
}

function sharedRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `multilixoCallback${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const params = new URLSearchParams({ action, callback: callbackName });
    const protectedActions = ["create", "update", "delete"];

    if (protectedActions.includes(action) && !payload.editKey) {
      const editKey = getEditKey();
      if (!editKey) {
        reject(new Error("Chave de edição não informada."));
        return;
      }
      params.set("editKey", editKey);
    }

    Object.entries(payload).forEach(([key, value]) => {
      params.set(key, value ?? "");
    });

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (data) => {
      cleanup();
      if (data && data.ok) {
        resolve(data);
      } else {
        reject(new Error((data && data.error) || "Resposta inválida da planilha."));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Falha de comunicação com a planilha."));
    };

    script.src = `${SHARED_API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function getEditKey() {
  const savedKey = sessionStorage.getItem(EDIT_KEY_STORAGE);
  if (savedKey) return savedKey;

  const typedKey = prompt("Digite a chave de edição autorizada:");
  const cleanKey = String(typedKey || "").trim();

  if (cleanKey) {
    sessionStorage.setItem(EDIT_KEY_STORAGE, cleanKey);
  }

  return cleanKey;
}

function datesAreSequential(record) {
  if ((record.pickupDate && !record.availableDate) || (record.executionDate && !record.pickupDate)) {
    return false;
  }

  const dates = [record.requestDate, record.availableDate, record.pickupDate, record.executionDate].filter(Boolean);
  return dates.every((date, index) => index === 0 || toDate(dates[index - 1]) <= toDate(date));
}

function statusMatchesDates(record) {
  const rules = {
    "Material Disponível": Boolean(record.availableDate),
    "Material Retirado": Boolean(record.availableDate && record.pickupDate),
    "Concluída": Boolean(record.availableDate && record.pickupDate && record.executionDate)
  };

  return record.status === "Aguardando Material" || rules[record.status];
}

function toDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const diff = toDate(end) - toDate(start);
  return Math.round(diff / 86400000);
}

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function stageMetric(start, end, pendingLabel) {
  if (!start) return { days: null, pending: false, label: "" };
  if (end) return { days: daysBetween(start, end), pending: false, label: "" };
  return { days: daysBetween(start, todayValue()), pending: true, label: pendingLabel };
}

function calculateStages(record) {
  return {
    almoxarifado: stageMetric(record.requestDate, record.availableDate, "Aguardando disponibilização"),
    planejamento: stageMetric(record.availableDate, record.pickupDate, "Aguardando retirada"),
    execucao: stageMetric(record.pickupDate, record.executionDate, "Aguardando execução")
  };
}

function getWorstStage(record) {
  const stages = calculateStages(record);
  return [
    ["almoxarifado", stages.almoxarifado.days || 0],
    ["execucao", stages.execucao.days || 0]
  ].sort((a, b) => b[1] - a[1])[0];
}

function filteredRecords() {
  return records.filter((record) => {
    const haystack = `${record.machine} ${record.fleet} ${record.branch || ""} ${record.model || ""} ${record.year || ""} ${record.serviceType}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    const matchesFilter = activeFilter === "all" || getWorstStage(record)[0] === activeFilter;
    return matchesSearch && matchesFilter;
  });
}

function render() {
  const rows = filteredRecords();
  renderSummary();
  renderTable(rows);
}

function renderSummary() {
  const totalOrders = document.querySelector("#totalOrders");
  if (totalOrders) totalOrders.textContent = records.length;

  const totals = records.reduce(
    (acc, record) => {
      const stages = calculateStages(record);
      acc.almoxarifado += stages.almoxarifado.days || 0;
      acc.planejamento += stages.planejamento.days || 0;
      acc.execucao += stages.execucao.days || 0;
      acc.leadTime += daysBetween(record.requestDate, record.executionDate || todayValue()) || 0;
      return acc;
    },
    { almoxarifado: 0, planejamento: 0, execucao: 0, leadTime: 0 }
  );

  const count = records.length || 1;
  const averages = {
    almoxarifado: totals.almoxarifado / count,
    planejamento: totals.planejamento / count,
    execucao: totals.execucao / count
  };
  const largest = [
    ["almoxarifado", averages.almoxarifado],
    ["execucao", averages.execucao]
  ].sort((a, b) => b[1] - a[1])[0];

  const leadTime = totals.leadTime / count;
  updateGoalBoard("#stageWarehouse", averages.almoxarifado, INDICATOR_GOALS.almoxarifado);
  updateGoalBoard("#stageTotal", leadTime, INDICATOR_GOALS.leadTime);
  updateGoalBoard("#stagePlanner", averages.planejamento, INDICATOR_GOALS.planejamento);
  updateGoalBoard("#stageExecution", averages.execucao, INDICATOR_GOALS.execucao);
  updateGoalMetric("#stageWarehouseTop", averages.almoxarifado, INDICATOR_GOALS.almoxarifado);
  updateGoalMetric("#stagePlannerTop", averages.planejamento, INDICATOR_GOALS.planejamento);
  updateGoalMetric("#stageExecutionTop", averages.execucao, INDICATOR_GOALS.execucao);
  updateGoalMetric("#averageLeadTime", leadTime, INDICATOR_GOALS.leadTime);
}

function updateGoalMetric(selector, value, goal) {
  const element = document.querySelector(selector);
  if (!element) return;

  element.textContent = formatNumber(value);
  const card = element.closest(".metric");
  if (!card) return;

  const isAboveGoal = value > goal;
  card.classList.toggle("above-goal", isAboveGoal);
  card.classList.toggle("on-goal", !isAboveGoal);
}

function updateGoalBoard(selector, value, goal) {
  const element = document.querySelector(selector);
  if (!element) return;

  element.textContent = formatNumber(value);
  const card = element.closest("article");
  if (!card) return;

  const isAboveGoal = value > goal;
  card.classList.toggle("above-goal", isAboveGoal);
  card.classList.toggle("on-goal", !isAboveGoal);
}

function renderTable(rows) {
  recordsTable.innerHTML = "";
  tableWrap.classList.toggle("is-empty", rows.length === 0);

  rows.forEach((record) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const cells = row.querySelectorAll("td");
    const stages = calculateStages(record);
    const totalDays = daysBetween(record.requestDate, record.executionDate || todayValue());
    const [worstStage, days] = getWorstStage(record);

    cells[0].innerHTML = `
      <div class="machine-cell">
        <strong>${escapeHtml(record.machine)}</strong>
        <span>${escapeHtml(record.fleet)}</span>
        <span>${escapeHtml(equipmentDetails(record))}</span>
      </div>
    `;
    cells[1].innerHTML = `
      <strong>${escapeHtml(record.serviceType)}</strong>
      <span class="subtle">${escapeHtml(record.status || statusFromDates(record))}</span>
      <span class="subtle">${escapeHtml(record.notes || "Sem observações")}</span>
    `;
    cells[2].innerHTML = dateCell(record.requestDate);
    cells[3].innerHTML = dateCell(record.availableDate);
    cells[4].innerHTML = dateCell(record.pickupDate);
    cells[5].innerHTML = dateCell(record.executionDate);
    cells[6].innerHTML = processDays(stages.almoxarifado);
    cells[7].innerHTML = processDays(stages.planejamento);
    cells[8].innerHTML = processDays(stages.execucao);
    cells[9].innerHTML = processDays(totalDays, "total");
    cells[10].innerHTML = `<span class="badge ${badgeClass(days)}">${stageLabel(worstStage)}: ${days} dias</span>`;
    cells[11].innerHTML = `
      <div class="row-actions">
        <button class="text-button" type="button" data-action="edit" data-id="${record.id}">Editar</button>
        <button class="text-button delete-button" type="button" data-action="delete" data-id="${record.id}">Excluir</button>
      </div>
    `;

    recordsTable.appendChild(row);
  });

  recordsTable.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "edit") {
        editRecord(button.dataset.id);
      } else {
        deleteRecord(button.dataset.id);
      }
    });
  });
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  Object.entries(record).forEach(([key, value]) => {
    const field = document.querySelector(`#${key === "id" ? "recordId" : key}`);
    if (field) field.value = value;
  });

  formTitle.textContent = "Editar preventiva";
  formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  try {
    await sharedRequest("delete", { id });
    records = records.filter((item) => item.id !== id);
    persistLocal();
    render();
  } catch (error) {
    alert(`Não foi possível excluir na planilha compartilhada: ${error.message}`);
  }
}

function dateCell(date, days) {
  if (!date) {
    return `<span class="pending-date">Pendente</span>`;
  }

  const dayInfo = Number.isInteger(days) ? `<small>${days} dias da etapa anterior</small>` : "";
  return `
    <div class="date-stack">
      <strong>${formatDate(date)}</strong>
      ${dayInfo}
    </div>
  `;
}

function processDays(metric, tone = "") {
  const normalized = typeof metric === "number" ? { days: metric, pending: false, label: "" } : metric;
  if (normalized.days === null) return `<span class="pending-date">Aguardando etapa anterior</span>`;

  const label = normalized.pending ? `<span class="pending-label">${escapeHtml(normalized.label)}</span>` : `<span class="subtle">dias</span>`;
  return `<strong class="days-count ${tone} ${normalized.pending ? "pending" : ""}">${normalized.days}</strong>${label}`;
}

function exportPanelCsv() {
  const header = [
    "Equipamento",
    "Placa",
    "Filial",
    "Modelo",
    "Ano",
    "Preventiva",
    "Status",
    "Solicitação",
    "Disponibilização",
    "Retirada",
    "Execução",
    "Solicitação até disponibilização",
    "Disponível até retirada",
    "Retirada até execução",
    "Total",
    "Maior gargalo",
    "Observações"
  ];

  const lines = records.map((record) => {
    const stages = calculateStages(record);
    const totalDays = daysBetween(record.requestDate, record.executionDate || todayValue());
    const [worstStage, worstDays] = getWorstStage(record);

    return [
      record.machine,
      record.fleet,
      record.branch || "",
      record.model || "",
      record.year || "",
      record.serviceType,
      record.status || statusFromDates(record),
      formatDateForExport(record.requestDate),
      formatDateForExport(record.availableDate),
      formatDateForExport(record.pickupDate),
      formatDateForExport(record.executionDate),
      exportStage(stages.almoxarifado),
      exportStage(stages.planejamento),
      exportStage(stages.execucao),
      `${totalDays} dias`,
      `${stageLabel(worstStage)}: ${worstDays} dias`,
      record.notes || ""
    ].map(csvCell).join(";");
  });

  const csv = [header.map(csvCell).join(";"), ...lines].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "manutencao-preventiva-maquinas.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportPanelPdf() {
  const rows = records.map((record) => {
    const stages = calculateStages(record);
    const totalDays = daysBetween(record.requestDate, record.executionDate || todayValue());
    const [worstStage, worstDays] = getWorstStage(record);

    return `
      <tr>
        <td><strong>${escapeHtml(record.machine)}</strong><br><small>${escapeHtml(record.fleet)} • ${escapeHtml(equipmentDetails(record))}</small></td>
        <td>${escapeHtml(record.serviceType)}</td>
        <td>${escapeHtml(record.status || statusFromDates(record))}</td>
        <td>${formatDateForExport(record.requestDate)}</td>
        <td>${formatDateForExport(record.availableDate)}</td>
        <td>${formatDateForExport(record.pickupDate)}</td>
        <td>${formatDateForExport(record.executionDate)}</td>
        <td>${escapeHtml(exportStage(stages.almoxarifado))}</td>
        <td>${escapeHtml(exportStage(stages.planejamento))}</td>
        <td>${escapeHtml(exportStage(stages.execucao))}</td>
        <td>${totalDays} dias</td>
        <td>${escapeHtml(stageLabel(worstStage))}: ${worstDays} dias</td>
      </tr>
    `;
  }).join("");

  const report = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!report) {
    alert("Não foi possível abrir a janela de PDF. Verifique se o bloqueador de pop-ups está ativo.");
    return;
  }

  report.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatório de Manutenção Preventiva</title>
        <style>
          :root { --green:#bfdd25; --purple:#6e3781; --orange:#f18225; --line:#d9dde5; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #1f2933; font-family: Arial, Helvetica, sans-serif; }
          header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; border-bottom: 4px solid var(--green); padding-bottom: 18px; }
          h1 { margin: 0; color: var(--purple); font-size: 26px; }
          p { margin: 6px 0 0; color: #667085; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
          .card { padding: 12px; border: 1px solid var(--line); border-radius: 8px; border-top: 4px solid var(--green); }
          .card strong { display:block; color: var(--purple); font-size: 24px; }
          .card span { color:#667085; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { padding: 8px; border: 1px solid var(--line); text-align: left; vertical-align: top; }
          th { color: var(--purple); background: #f7f8fa; }
          small { color:#667085; }
          @media print {
            body { padding: 12mm; }
            button { display: none; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Manutenção preventiva de máquinas</h1>
            <p>Relatório de SLA operacional gerado em ${new Intl.DateTimeFormat("pt-BR").format(new Date())}</p>
          </div>
          <button onclick="window.print()">Salvar em PDF</button>
        </header>
        <section class="summary">
          <div class="card"><strong>${records.length}</strong><span>Total de preventivas</span></div>
          <div class="card"><strong>${document.querySelector("#stageWarehouseTop").textContent}</strong><span>Solicitação até disponibilidade</span></div>
          <div class="card"><strong>${document.querySelector("#averageLeadTime").textContent}</strong><span>Lead time total médio</span></div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Preventiva</th>
              <th>Status</th>
              <th>Solicitação</th>
              <th>Disponível</th>
              <th>Retirada</th>
              <th>Execução</th>
              <th>Solic. até disp.</th>
              <th>Disp. até ret.</th>
              <th>Ret. até exec.</th>
              <th>Total</th>
              <th>Maior gargalo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          window.addEventListener("load", () => setTimeout(() => window.print(), 250));
        </script>
      </body>
    </html>
  `);
  report.document.close();
}

function exportStage(stage) {
  if (!stage || stage.days === null) return "Aguardando etapa anterior";
  return `${stage.days} dias${stage.pending ? ` - ${stage.label}` : ""}`;
}

function equipmentDetails(record) {
  return [record.branch, record.model, record.year].filter(Boolean).join(" • ") || "-";
}

function formatDateForExport(value) {
  return value ? formatDate(value) : "Pendente";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(toDate(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
}

function stageLabel(stage) {
  return {
    almoxarifado: "Solicitação até disponibilização",
    planejamento: "Disponível até retirada",
    execucao: "Retirada até execução"
  }[stage];
}

function statusFromDates(record) {
  if (record.executionDate) return "Concluída";
  if (record.pickupDate) return "Material Retirado";
  if (record.availableDate) return "Material Disponível";
  return "Aguardando Material";
}

function badgeClass(days) {
  if (days <= 1) return "good";
  if (days <= 4) return "medium";
  return "high";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadRecords().then(() => {
  render();

  if (editIdFromUrl) {
    setTimeout(() => editRecord(editIdFromUrl), 120);
  }
});
