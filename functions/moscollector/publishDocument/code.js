// publishDocument - выдача документа файлом через встроенное хранилище платформы.
//
// Форматы:
//   docx  - настоящий Word через npm-пакет docx (зависимость коллекции)
//   xls   - таблица в формате SpreadsheetML 2003, Excel открывает её штатно
//   txt, md, csv, html - текст как есть
//
// Почему xls без библиотеки. SpreadsheetML - это XML, который Excel понимает
// с 2003 года. Ради одной таблицы тащить вторую зависимость незачем: пакеты
// для xlsx рассчитаны на Node со стримами, а здесь третье окружение,
// и проверять его пришлось бы отдельно.
//
// Http.post для загрузки не годится: его body объявлен как JSON-объект
// и multipart не отправит. Поэтому глобальный fetch с FormData.

var UPLOAD_URL = "https://bot.jaicp.com/restapi/file/upload";

var MIME_BY_EXTENSION = {
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  htm: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

var DEFAULT_MIME = "application/octet-stream";

// Хранилище отдаёт файл без указания кодировки, и Windows читает его в CP1251:
// кириллица превращается в "РРЅСЃС‚СЂСѓРєС†РёСЏ". charset в MIME при загрузке
// до скачивающего не доезжает, поэтому признак кодировки кладём внутрь файла.
var BOM = "﻿";
var BOM_EXTENSIONS = { txt: true, md: true, csv: true };

function extensionOf(name) {
  var match = /\.([0-9a-zA-Z]+)$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

function mimeFor(name) {
  return MIME_BY_EXTENSION[extensionOf(name)] || DEFAULT_MIME;
}

function needsBom(name) {
  return BOM_EXTENSIONS[extensionOf(name)] === true;
}

function withEncoding(name, text) {
  var body = String(text == null ? "" : text);

  if (needsBom(name)) {
    return body.charAt(0) === BOM ? body : BOM + body;
  }

  var extension = extensionOf(name);
  if (extension === "html" || extension === "htm") {
    if (/charset/i.test(body)) {
      return body;
    }
    if (!/<html[\s>]/i.test(body)) {
      return '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
        "</head><body>" + body + "</body></html>";
    }
    return body.replace(/<head[^>]*>/i, function (match) {
      return match + '<meta charset="utf-8">';
    });
  }

  return body;
}

function uniqueName(name, stamp) {
  var raw = String(name || "document.txt");
  var extension = extensionOf(raw);
  var base = extension ? raw.slice(0, -(extension.length + 1)) : raw;
  base = base.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
  return base + "-" + stamp + (extension ? "." + extension : ".txt");
}

function linkFrom(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload.link || payload.url || payload.fileUrl || null;
}

// ---------- таблица ----------

// Модель охотнее всего рисует markdown-таблицу, поэтому её и разбираем.
// Заодно принимаем TSV и строки с разделителем ";" - на случай, если модель
// решит выдать таблицу иначе.
function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(line);
}

function splitRow(line) {
  var text = String(line);

  if (text.indexOf("|") !== -1) {
    var cells = text.split("|");
    // У markdown-таблицы крайние разделители дают пустые ячейки по краям.
    if (cells.length && cells[0].trim() === "") { cells.shift(); }
    if (cells.length && cells[cells.length - 1].trim() === "") { cells.pop(); }
    return cells.map(function (cell) { return cell.trim(); });
  }
  if (text.indexOf("\t") !== -1) {
    return text.split("\t").map(function (cell) { return cell.trim(); });
  }
  if (text.indexOf(";") !== -1) {
    return text.split(";").map(function (cell) { return cell.trim(); });
  }
  return [text.trim()];
}

function parseRows(text) {
  return String(text == null ? "" : text)
    .split(/\r?\n/)
    .filter(function (line) { return line.trim() !== "" && !isSeparatorRow(line); })
    .map(splitRow);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Excel показывает число правым краем и умеет считать по нему, поэтому тип
// проставляем честно. Кириллические подписи при этом остаются строками.
function cellXml(value) {
  var text = String(value == null ? "" : value);
  var isNumber = text !== "" && /^-?\d+([.,]\d+)?$/.test(text);
  if (isNumber) {
    return '<Cell><Data ss:Type="Number">' + text.replace(",", ".") + "</Data></Cell>";
  }
  return '<Cell><Data ss:Type="String">' + escapeXml(text) + "</Data></Cell>";
}

function toSpreadsheetXml(rows, sheetName) {
  var body = rows.map(function (row) {
    return "<Row>" + row.map(cellXml).join("") + "</Row>";
  }).join("");

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="' + escapeXml(sheetName || "Лист1") + '">' +
    "<Table>" + body + "</Table></Worksheet></Workbook>";
}

// ---------- Word ----------

// Пакет приходит глобальной переменной с именем из code-name, require здесь
// нет. Рабочий объект у большинства сборок лежит в .default.
function docxLib() {
  if (typeof docx === "undefined" || !docx) {
    return null;
  }
  return docx.default ? docx.default : docx;
}

function buildDocxDocument(lib, text) {
  var lines = String(text == null ? "" : text).split(/\r?\n/);
  var children = [];
  var headingUsed = false;

  lines.forEach(function (line) {
    var trimmed = line.trim();

    if (trimmed === "") {
      children.push(new lib.Paragraph({ text: "" }));
      return;
    }
    // Первая непустая строка становится заголовком документа.
    if (!headingUsed) {
      headingUsed = true;
      children.push(new lib.Paragraph({ text: trimmed, heading: lib.HeadingLevel.HEADING_1 }));
      return;
    }
    children.push(new lib.Paragraph({ children: [new lib.TextRun(trimmed)] }));
  });

  return new lib.Document({ sections: [{ children: children }] });
}

async function docxBlob(text) {
  var lib = docxLib();
  if (!lib || !lib.Document || !lib.Packer) {
    return null;
  }

  var document = buildDocxDocument(lib, text);

  // В браузерных сборках есть toBlob, в серверных - только toBuffer.
  // Какая здесь, заранее неизвестно, поэтому пробуем обе.
  if (typeof lib.Packer.toBlob === "function") {
    return await lib.Packer.toBlob(document);
  }
  var buffer = await lib.Packer.toBuffer(document);
  return new Blob([buffer], { type: MIME_BY_EXTENSION.docx });
}

// ---------- загрузка ----------

function missingGlobals() {
  var missing = [];
  if (typeof fetch === "undefined") { missing.push("fetch"); }
  if (typeof FormData === "undefined") { missing.push("FormData"); }
  if (typeof Blob === "undefined") { missing.push("Blob"); }
  return missing;
}

async function bodyBlob(fileName, text) {
  var extension = extensionOf(fileName);

  if (extension === "docx") {
    var blob = await docxBlob(text);
    return blob ? { blob: blob } : { error: "docx_missing" };
  }

  if (extension === "xls") {
    var xml = toSpreadsheetXml(parseRows(text));
    return { blob: new Blob([xml], { type: MIME_BY_EXTENSION.xls }) };
  }

  return {
    blob: new Blob([withEncoding(fileName, text)], { type: mimeFor(fileName) })
  };
}

async function run(name, text) {
  var missing = missingGlobals();
  if (missing.length) {
    await Log.error({
      message: "Встроенное хранилище недоступно из песочницы",
      data: { missing: missing }
    });
    return { ok: false, reason: "runtime_missing", missing: missing };
  }

  var fileName = uniqueName(name, Date.now());
  var prepared = await bodyBlob(fileName, text);

  if (prepared.error) {
    await Log.error({
      message: "Не удалось собрать документ",
      data: { reason: prepared.error, fileName: fileName, docxType: typeof docx }
    });
    return { ok: false, reason: prepared.error, fileName: fileName };
  }

  var botId = await Context.getBotId();
  var form = new FormData();
  form.append("file", prepared.blob, fileName);
  form.append("botId", botId);

  var response = await fetch(UPLOAD_URL, { method: "POST", body: form });

  if (response.status !== 200) {
    var detail = "";
    try {
      detail = await response.text();
    } catch (error) {
      detail = "тело ответа не прочиталось";
    }
    await Log.error({
      message: "Хранилище отклонило загрузку",
      data: { status: response.status, detail: String(detail).slice(0, 500), fileName: fileName }
    });
    return { ok: false, reason: "upload_failed", status: response.status };
  }

  var payload = await response.json();
  var url = linkFrom(payload);

  if (!url) {
    await Log.error({
      message: "Хранилище приняло файл, но ссылки в ответе нет",
      data: { payloadKeys: Object.keys(payload || {}), fileName: fileName }
    });
    return { ok: false, reason: "no_link", payloadKeys: Object.keys(payload || {}) };
  }

  await Log.info({ message: "Документ загружен", data: { fileName: fileName, url: url } });

  // Реакция отправляет файл в канал сразу, ссылка в ответе нужна агенту,
  // чтобы он мог назвать её текстом. Подтверждение на узле не включаем:
  // из функции с hitl-tool-config реакции до канала могут не дойти.
  await Reactions.sendFile({ url: url, name: fileName });

  return { ok: true, url: url, name: fileName };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    extensionOf: extensionOf,
    mimeFor: mimeFor,
    uniqueName: uniqueName,
    linkFrom: linkFrom,
    needsBom: needsBom,
    withEncoding: withEncoding,
    isSeparatorRow: isSeparatorRow,
    splitRow: splitRow,
    parseRows: parseRows,
    escapeXml: escapeXml,
    cellXml: cellXml,
    toSpreadsheetXml: toSpreadsheetXml,
    buildDocxDocument: buildDocxDocument
  };
} else {
  return run(fileName, content);
}
