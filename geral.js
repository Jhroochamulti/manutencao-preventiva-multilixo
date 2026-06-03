const STORAGE_KEY = "multilixo-preventivas";

const fallbackRecords = [
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
    model: "Pa carregadeira",
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

let panelRecords = loadPanelRecords();
let rows = recordsToRows(panelRecords);

let searchTerm = "";
let statusFilter = "all";
let bottleneckFilter = "all";
let periodStart = "";
let periodEnd = "";
const INDICATOR_GOALS = {
  leadTime: 2.5,
  requestAvailable: 0,
  availablePickup: 0.5,
  pickupExecution: 2
};

document.querySelector("#searchInputGeneral").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#statusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  render();
});

document.querySelector("#bottleneckFilter").addEventListener("change", (event) => {
  bottleneckFilter = event.target.value;
  render();
});

document.querySelector("#periodStart").addEventListener("change", (event) => {
  periodStart = event.target.value;
  render();
});

document.querySelector("#periodEnd").addEventListener("change", (event) => {
  periodEnd = event.target.value;
  render();
});

document.querySelector("#exportButton").addEventListener("click", exportCsv);
document.querySelector("#exportPdfGeneralButton").addEventListener("click", exportGeneralPdf);

function loadPanelRecords() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return JSON.parse(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackRecords));
  return fallbackRecords;
}

function refreshFromPanelRecords() {
  panelRecords = loadPanelRecords();
  rows = recordsToRows(panelRecords);
}

function recordsToRows(records) {
  return records.map((record, index) => {
    const stages = {
      requestAvailable: diffDays(record.requestDate, record.availableDate),
      pickupExecution: diffDays(record.pickupDate, record.executionDate),
      total: diffDays(record.requestDate, record.executionDate)
    };

    return {
      id: record.id || `record-${index}`,
      equipment: record.machine,
      fleet: record.fleet || "-",
      branch: record.branch || "-",
      model: record.model || "-",
      year: record.year || "-",
      machine: record.machine,
      status: record.status || statusFromRecord(record),
      requestDate: record.requestDate,
      availableDate: record.availableDate,
      pickupDate: record.pickupDate,
      executionDate: record.executionDate,
      serviceType: record.serviceType || "Preventiva",
      notes: record.notes || "",
      sourceOrder: index
    };
  });
}

function statusFromRecord(record) {
  if (record.executionDate) return "Concluída";
  if (record.pickupDate) return "Material Retirado";
  if (record.availableDate) return "Material Disponível";
  return "Aguardando Material";
}

function render() {
  refreshFromPanelRecords();
  const visibleRows = filteredRows();

  renderStats(visibleRows);
  renderAnalysis(visibleRows);
  renderRows(visibleRows);
}

function filteredRows() {
  return rows.filter((item) => {
    const text = `${item.equipment} ${item.fleet} ${item.branch} ${item.model} ${item.year} ${item.status} ${item.serviceType} ${item.notes}`.toLowerCase();
    const worst = worstStage(item);
    return (
      (!searchTerm || text.includes(searchTerm)) &&
      matchesPeriod(item) &&
      (statusFilter === "all" || item.status === statusFilter) &&
      (bottleneckFilter === "all" || worst.key === bottleneckFilter)
    );
  });
}

function renderStats(items) {
  const summary = calculateSummary(items);
  updateGoalStat("#statLeadTime", summary.leadTime, INDICATOR_GOALS.leadTime);
  updateGoalStat("#statRequestAvailable", summary.requestAvailable, INDICATOR_GOALS.requestAvailable);
  updateGoalStat("#statAvailablePickup", summary.availablePickup, INDICATOR_GOALS.availablePickup);
  updateGoalStat("#statPickupExecution", summary.pickupExecution, INDICATOR_GOALS.pickupExecution);
}

function updateGoalStat(selector, value, goal) {
  const element = document.querySelector(selector);
  if (!element) return;

  element.textContent = formatNumber(value);
  const card = element.closest("article");
  if (!card) return;

  const isAboveGoal = value > goal;
  card.classList.toggle("above-goal", isAboveGoal);
  card.classList.toggle("on-goal", !isAboveGoal);
}

function renderAnalysis(items) {
  renderBottleneckBars(items);
  renderGapRanking(items);
}

function renderBottleneckBars(items) {
  const container = document.querySelector("#bottleneckBars");
  const totals = {
    requestAvailable: 0,
    availablePickup: 0,
    pickupExecution: 0
  };

  items.forEach((item) => {
    totals[worstStage(item).key] += 1;
  });

  const max = Math.max(1, ...Object.values(totals));
  container.innerHTML = Object.entries(totals)
    .map(([key, value]) => {
      const width = Math.max(6, (value / max) * 100);
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${stageLabel(key)}</strong>
            <span>${value} equipamento${value === 1 ? "" : "s"}</span>
          </div>
          <div class="bar-track"><span style="width:${width}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderGapRanking(items) {
  const container = document.querySelector("#gapRanking");
  const ranking = items
    .map((item) => ({ ...item, worst: worstStage(item) }))
    .sort((a, b) => b.worst.days - a.worst.days)
    .slice(0, 5);

  if (!ranking.length) {
    container.innerHTML = `<p class="analysis-empty">Nenhum registro encontrado para os filtros aplicados.</p>`;
    return;
  }

  container.innerHTML = ranking
    .map((item, index) => `
      <div class="ranking-row">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(item.equipment)}</strong>
          <small>${stageLabel(item.worst.key)}</small>
        </div>
        <b>${item.worst.days}d</b>
      </div>
    `)
    .join("");
}

function calculateSummary(items) {
  const count = items.length || 1;
  const totals = items.reduce(
    (acc, item) => {
      const stages = getStages(item);
      acc.requestAvailable += stages.requestAvailable || 0;
      acc.availablePickup += stages.availablePickup || 0;
      acc.pickupExecution += stages.pickupExecution || 0;
      acc.leadTime += stages.total || 0;
      return acc;
    },
    { requestAvailable: 0, availablePickup: 0, pickupExecution: 0, leadTime: 0 }
  );
  const requestAverage = totals.requestAvailable / count;
  const availableAverage = totals.availablePickup / count;
  const executionAverage = totals.pickupExecution / count;

  return {
    requestAvailable: requestAverage,
    availablePickup: availableAverage,
    pickupExecution: executionAverage,
    leadTime: totals.leadTime / count
  };
}

function renderRows(items) {
  const body = document.querySelector("#generalTableBody");
  const template = document.querySelector("#generalRowTemplate");
  body.innerHTML = "";

  items.forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const cells = row.querySelectorAll("td");
    const stages = getStages(item);

    cells[0].innerHTML = `<strong>${escapeHtml(item.equipment)}</strong>`;
    cells[1].textContent = item.fleet;
    cells[2].textContent = item.branch;
    cells[3].textContent = item.model;
    cells[4].textContent = item.year;
    cells[5].textContent = item.serviceType;
    cells[6].innerHTML = statusPill(item.status);
    cells[7].textContent = item.notes || "-";
    cells[8].textContent = formatDate(item.requestDate);
    cells[9].textContent = formatDate(item.availableDate);
    cells[10].textContent = formatDate(item.pickupDate);
    cells[11].textContent = formatDate(item.executionDate);
    cells[12].innerHTML = dayPill(stages.requestAvailable, 2);
    cells[13].innerHTML = dayPill(stages.availablePickup, 1);
    cells[14].innerHTML = dayPill(stages.pickupExecution, 3);
    cells[15].innerHTML = dayPill(stages.total, 7);
    cells[16].innerHTML = delayPill(stages.requestPickup, 3);
    cells[17].innerHTML = delayPill(stages.requestAvailable, 2);
    cells[18].innerHTML = delayPill(stages.total, 7);
    cells[19].innerHTML = `
      <div class="general-row-actions">
        <button class="table-action" type="button" title="Editar" data-action="edit" data-id="${item.id}">Editar</button>
        <button class="table-action delete" type="button" title="Excluir" data-action="delete" data-id="${item.id}">Excluir</button>
      </div>
    `;

    body.appendChild(row);
  });

  body.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "edit") {
        editFromGeneral(button.dataset.id);
      } else {
        deleteFromGeneral(button.dataset.id);
      }
    });
  });
}

function editFromGeneral(id) {
  window.location.href = `./index.html?v=46&edit=${encodeURIComponent(id)}#nova-preventiva`;
}

function deleteFromGeneral(id) {
  const record = panelRecords.find((item) => item.id === id);
  if (!record) return;

  panelRecords = panelRecords.filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(panelRecords));
  rows = recordsToRows(panelRecords);
  render();
}

function matchesPeriod(item) {
  if (!periodStart && !periodEnd) return true;
  const date = item.requestDate;
  if (!date) return false;
  if (periodStart && toDate(date) < toDate(periodStart)) return false;
  if (periodEnd && toDate(date) > toDate(periodEnd)) return false;
  return true;
}

function getStages(item) {
  return {
    requestAvailable: diffDays(item.requestDate, item.availableDate || todayValue()),
    availablePickup: item.availableDate ? diffDays(item.availableDate, item.pickupDate || todayValue()) : null,
    pickupExecution: item.pickupDate ? diffDays(item.pickupDate, item.executionDate || todayValue()) : null,
    requestPickup: diffDays(item.requestDate, item.pickupDate || todayValue()),
    total: diffDays(item.requestDate, item.executionDate || todayValue())
  };
}

function hasBottleneck(item) {
  const stages = getStages(item);
  return (
    (stages.requestAvailable !== null && stages.requestAvailable > 4) ||
    (stages.pickupExecution !== null && stages.pickupExecution > 5) ||
    (stages.total !== null && stages.total > 9)
  );
}

function worstStage(item) {
  const stages = getStages(item);
  return [
    { key: "requestAvailable", days: stages.requestAvailable || 0 },
    { key: "availablePickup", days: stages.availablePickup || 0 },
    { key: "pickupExecution", days: stages.pickupExecution || 0 }
  ].sort((a, b) => b.days - a.days)[0];
}

function stageLabel(key) {
  return {
    requestAvailable: "Solicitação até disponibilidade",
    availablePickup: "Disponível até retirada",
    pickupExecution: "Retirada até execução"
  }[key];
}

function statusPill(status) {
  const className = {
    "Aguardando Material": "waiting",
    "Material Disponível": "available",
    "Material Retirado": "picked",
    Concluída: "done"
  }[status] || "waiting";
  return `<span class="status-pill ${className}">${escapeHtml(status)}</span>`;
}

function dayPill(value, target) {
  if (value === null) return `<span class="dash-pill">-</span>`;
  return `<span class="stage-pill ${stageClass(value, target)}">${value}d</span>`;
}

function delayPill(value, target) {
  if (value === null) return `<span class="dash-pill">-</span>`;
  const delay = Math.max(0, value - target);
  return `<span class="stage-pill ${stageClass(delay, 0)}">${delay}d</span>`;
}

function stageClass(value, target) {
  if (value <= target) return "ok";
  if (value <= target + 2) return "attention";
  return "bottleneck";
}

function diffDays(start, end) {
  if (!start || !end) return null;
  return Math.round((toDate(end) - toDate(start)) / 86400000);
}

function toDate(value) {
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

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
}

function exportCsv() {
  const header = ["Equipamento", "Placa", "Filial", "Modelo", "Ano", "Preventiva", "Status", "Observacoes", "Solicitacao", "Disponivel", "Retirada", "Execucao"];
  const lines = rows.map((item) => [
    item.equipment,
    item.fleet,
    item.branch,
    item.model,
    item.year,
    item.serviceType,
    item.status,
    item.notes,
    formatDate(item.requestDate),
    formatDate(item.availableDate),
    formatDate(item.pickupDate),
    formatDate(item.executionDate)
  ].join(";"));
  const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "manutencao-preventiva.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportGeneralPdf() {
  const visibleRows = filteredRows();
  const tableRows = visibleRows.map((item) => {
    const stages = getStages(item);
    const worst = worstStage(item);
    return `
      <tr>
        <td><strong>${escapeHtml(item.equipment)}</strong></td>
        <td>${escapeHtml(item.fleet)}</td>
        <td>${escapeHtml(item.branch)}</td>
        <td>${escapeHtml(item.model)}</td>
        <td>${escapeHtml(item.year)}</td>
        <td>${escapeHtml(item.serviceType)}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.notes || "-")}</td>
        <td>${formatDate(item.requestDate)}</td>
        <td>${formatDate(item.availableDate)}</td>
        <td>${formatDate(item.pickupDate)}</td>
        <td>${formatDate(item.executionDate)}</td>
        <td>${formatExportDays(stages.requestAvailable)}</td>
        <td>${formatExportDays(stages.availablePickup)}</td>
        <td>${formatExportDays(stages.pickupExecution)}</td>
        <td>${formatExportDays(stages.total)}</td>
        <td>${escapeHtml(stageLabel(worst.key))}: ${worst.days}d</td>
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
        <title>Relatório Geral de Manutenção Preventiva</title>
        <style>
          :root { --green:#bfdd25; --purple:#6e3781; --orange:#f18225; --line:#d9dde5; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #1f2933; font-family: Arial, Helvetica, sans-serif; }
          header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; border-bottom: 4px solid var(--green); padding-bottom: 16px; }
          h1 { margin: 0; color: var(--purple); font-size: 25px; }
          p { margin: 6px 0 0; color: #667085; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
          .card { padding: 11px; border: 1px solid var(--line); border-radius: 8px; border-top: 4px solid var(--green); }
          .card strong { display:block; color: var(--purple); font-size: 22px; }
          .card span { color:#667085; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { padding: 7px; border: 1px solid var(--line); text-align: left; vertical-align: top; }
          th { color: var(--purple); background: #f7f8fa; }
          small { color:#667085; }
          @media print {
            body { padding: 10mm; }
            button { display: none; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Informações gerais de manutenção preventiva</h1>
            <p>Relatório filtrado gerado em ${new Intl.DateTimeFormat("pt-BR").format(new Date())}</p>
          </div>
          <button onclick="window.print()">Salvar em PDF</button>
        </header>
        <section class="summary">
          <div class="card"><strong>${visibleRows.length}</strong><span>Total filtrado</span></div>
          <div class="card"><strong>${document.querySelector("#statRequestAvailable").textContent}</strong><span>Solicitação até disponibilidade</span></div>
          <div class="card"><strong>${document.querySelector("#statLeadTime").textContent}</strong><span>Lead time total</span></div>
          <div class="card"><strong>${document.querySelector("#statPickupExecution").textContent}</strong><span>Retirada até execução</span></div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Placa</th>
              <th>Filial</th>
              <th>Modelo</th>
              <th>Ano</th>
              <th>Preventiva</th>
              <th>Status</th>
              <th>Observações</th>
              <th>Solicitação</th>
              <th>Disponível</th>
              <th>Retirada</th>
              <th>Execução</th>
              <th>Solic-Disp</th>
              <th>Disp-Retir</th>
              <th>Retir-Exec</th>
              <th>Total</th>
              <th>Maior gargalo</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <script>
          window.addEventListener("load", () => setTimeout(() => window.print(), 250));
        </script>
      </body>
    </html>
  `);
  report.document.close();
}

function formatExportDays(value) {
  return value === null ? "-" : `${value}d`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
