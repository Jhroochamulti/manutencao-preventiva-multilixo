const SHEET_NAME = "Preventivas";
const EDIT_TOKEN = "SUA_CHAVE_AQUI";

const HEADERS = [
  "id",
  "machine",
  "fleet",
  "branch",
  "model",
  "year",
  "serviceType",
  "status",
  "requestDate",
  "availableDate",
  "pickupDate",
  "executionDate",
  "notes",
  "createdAt",
  "updatedAt"
];

function doGet(e) {
  const params = e.parameter || {};
  const action = params.action || "list";

  try {
    ensureSheet();

    if (action === "list") {
      return output({ ok: true, records: listRecords() }, params.callback);
    }

    authorizeEdit(params);

    if (action === "create") {
      return output({ ok: true, record: createRecord(params) }, params.callback);
    }

    if (action === "update") {
      return output({ ok: true, record: updateRecord(params) }, params.callback);
    }

    if (action === "delete") {
      return output({ ok: true, deletedId: deleteRecord(params.id) }, params.callback);
    }

    return output({ ok: false, error: "Acao invalida." }, params.callback);
  } catch (error) {
    return output({ ok: false, error: error.message }, params.callback);
  }
}

function doPost(e) {
  const body = JSON.parse((e.postData && e.postData.contents) || "{}");
  const action = body.action || "list";

  try {
    ensureSheet();

    if (action === "list") {
      return output({ ok: true, records: listRecords() });
    }

    authorizeEdit(body);

    if (action === "create") {
      return output({ ok: true, record: createRecord(body) });
    }

    if (action === "update") {
      return output({ ok: true, record: updateRecord(body) });
    }

    if (action === "delete") {
      return output({ ok: true, deletedId: deleteRecord(body.id) });
    }

    return output({ ok: false, error: "Acao invalida." });
  } catch (error) {
    return output({ ok: false, error: error.message });
  }
}

function authorizeEdit(data) {
  if (!EDIT_TOKEN || EDIT_TOKEN === "SUA_CHAVE_AQUI") {
    throw new Error("Configure a chave de edicao no Apps Script.");
  }

  if (String(data.editKey || "") !== EDIT_TOKEN) {
    throw new Error("Chave de edicao invalida.");
  }
}

function ensureSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = HEADERS.every((header, index) => firstRow[index] === header);

  if (!hasHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function listRecords() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .filter(row => row.some(value => value !== ""))
    .map(rowToRecord);
}

function createRecord(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const now = new Date().toISOString();
  const record = normalizeRecord({
    ...data,
    id: data.id || Utilities.getUuid(),
    createdAt: data.createdAt || now,
    updatedAt: now
  });

  sheet.appendRow(recordToRow(record));
  return record;
}

function updateRecord(data) {
  if (!data.id) {
    throw new Error("ID obrigatorio para atualizar.");
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const records = listRecords();
  const index = records.findIndex(record => record.id === data.id);

  if (index === -1) {
    throw new Error("Registro nao encontrado.");
  }

  const updated = normalizeRecord({
    ...records[index],
    ...data,
    updatedAt: new Date().toISOString()
  });

  sheet.getRange(index + 2, 1, 1, HEADERS.length).setValues([recordToRow(updated)]);
  return updated;
}

function deleteRecord(id) {
  if (!id) {
    throw new Error("ID obrigatorio para excluir.");
  }

  const records = listRecords();
  const index = records.findIndex(record => record.id === id);

  if (index === -1) {
    throw new Error("Registro nao encontrado.");
  }

  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME).deleteRow(index + 2);
  return id;
}

function rowToRecord(row) {
  const record = {};

  HEADERS.forEach((header, index) => {
    record[header] = row[index] === null || row[index] === undefined ? "" : String(row[index]);
  });

  return record;
}

function recordToRow(record) {
  return HEADERS.map(header => record[header] || "");
}

function normalizeRecord(data) {
  const record = {};

  HEADERS.forEach(header => {
    record[header] = data[header] === null || data[header] === undefined ? "" : String(data[header]);
  });

  return record;
}

function output(data, callback) {
  const json = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
