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

// ---------- разметка ----------
//
// И Word, и Excel собираются из одной облегчённой разметки markdown: модель
// пишет её охотно и без ошибок, а оформление накладываем мы.
//
//   # строка      заголовок документа, по центру
//   ## строка     подзаголовок: тема записки, название раздела
//   > строка      блок в правой половине листа - адресат, реквизиты
//   - строка      маркированный список
//   1. строка     нумерованный список
//   | a | b |     таблица
//   ---           отчёркивание во всю ширину
//   **жирный**, *курсив* внутри строки
//
// Пустая строка разделяет абзацы; соседние строки склеиваются в один абзац,
// потому что модель переносит длинный текст по своему усмотрению, а рваные
// строки в готовом документе выглядят браком.

function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(line);
}

function isTableRow(line) {
  return String(line).trim().indexOf("|") !== -1;
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

// Отчёркивание "---" и разделитель таблицы "|---|---|" пишутся похоже.
// Отличаем по вертикальной черте: она есть только у таблицы.
function isRule(line) {
  var trimmed = String(line).trim();
  return /^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed);
}

function parseBlocks(text) {
  var lines = String(text == null ? "" : text).split(/\r?\n/);
  var blocks = [];
  var paragraph = [];

  function flush() {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  }

  var index = 0;
  while (index < lines.length) {
    var line = lines[index];
    var trimmed = line.trim();

    if (trimmed === "") {
      flush();
      index += 1;
      continue;
    }

    if (isRule(trimmed)) {
      flush();
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (isTableRow(trimmed)) {
      flush();
      var rows = [];
      while (index < lines.length && isTableRow(lines[index]) && lines[index].trim() !== "") {
        if (!isSeparatorRow(lines[index])) {
          rows.push(splitRow(lines[index]));
        } else if (rows.length === 1) {
          rows.headerSeen = true;
        }
        index += 1;
      }
      if (rows.length) {
        blocks.push({ kind: "table", rows: rows, header: rows.headerSeen === true });
      }
      continue;
    }

    var heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: heading[1].length === 1 ? "h1" : "h2", text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flush();
      var aside = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        aside.push(lines[index].replace(/^\s*>\s?/, "").trim());
        index += 1;
      }
      blocks.push({ kind: "aside", lines: aside });
      continue;
    }

    var bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    var ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || ordered) {
      flush();
      var items = [];
      while (index < lines.length) {
        var candidate = lines[index].trim();
        var nextBullet = /^[-*•]\s+(.*)$/.exec(candidate);
        var nextOrdered = /^(\d+)[.)]\s+(.*)$/.exec(candidate);
        if (nextBullet) {
          items.push({ marker: "—", text: nextBullet[1].trim() });
        } else if (nextOrdered) {
          items.push({ marker: nextOrdered[1] + ".", text: nextOrdered[2].trim() });
        } else {
          break;
        }
        index += 1;
      }
      blocks.push({ kind: "list", items: items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flush();
  return blocks;
}

// Если разметки в тексте нет вовсе, первая строка всё равно должна стать
// заголовком: модель иногда присылает голый текст, и документ без заголовка
// выглядит обрывком.
function withFallbackHeading(blocks) {
  var hasHeading = blocks.some(function (block) { return block.kind === "h1"; });
  if (hasHeading || !blocks.length || blocks[0].kind !== "p") {
    return blocks;
  }
  var first = blocks[0];
  if (first.text.length > 120) {
    return blocks;
  }
  return [{ kind: "h1", text: first.text }].concat(blocks.slice(1));
}

// ---------- Excel ----------

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Excel показывает число правым краем и умеет считать по нему, поэтому тип
// проставляем честно. Кириллические подписи при этом остаются строками.
function cellXml(value, styleId) {
  var text = String(value == null ? "" : text2(value));
  var style = styleId ? ' ss:StyleID="' + styleId + '"' : "";
  var isNumber = text !== "" && /^-?\d+([.,]\d+)?$/.test(text);
  if (isNumber) {
    return "<Cell" + style + '><Data ss:Type="Number">' + text.replace(",", ".") + "</Data></Cell>";
  }
  return "<Cell" + style + '><Data ss:Type="String">' + escapeXml(text) + "</Data></Cell>";
}

// Разметку **жирный** внутри ячейки Excel не поддержит, поэтому просто снимаем.
function text2(value) {
  return String(value).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

// Ширина колонок считается по самой длинной ячейке: без этого весь текст
// прячется за границей столбца, и таблицу приходится растягивать руками.
function columnWidths(rows) {
  var widths = [];
  rows.forEach(function (row) {
    row.forEach(function (cell, position) {
      var length = String(cell == null ? "" : cell).length;
      widths[position] = Math.max(widths[position] || 0, length);
    });
  });
  return widths.map(function (length) {
    return Math.min(320, Math.max(60, Math.round(length * 6.2) + 16));
  });
}

function toSpreadsheetXml(rows, sheetName) {
  var widths = columnWidths(rows);
  var columns = widths.map(function (width) {
    return '<Column ss:AutoFitWidth="0" ss:Width="' + width + '"/>';
  }).join("");

  var body = rows.map(function (row, position) {
    var style = position === 0 ? "head" : "body";
    return "<Row" + (position === 0 ? ' ss:StyleID="head"' : "") + ">" +
      row.map(function (cell) { return cellXml(cell, style); }).join("") +
      "</Row>";
  }).join("");

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    "<Styles>" +
    '<Style ss:ID="head">' +
    '<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>' +
    '<Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/>' +
    '<Alignment ss:Vertical="Center" ss:WrapText="1"/>' +
    "<Borders>" +
    '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    "</Borders></Style>" +
    '<Style ss:ID="body">' +
    '<Font ss:FontName="Calibri" ss:Size="11"/>' +
    '<Alignment ss:Vertical="Top" ss:WrapText="1"/>' +
    "<Borders>" +
    '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>' +
    '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>' +
    '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>' +
    '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>' +
    "</Borders></Style>" +
    "</Styles>" +
    '<Worksheet ss:Name="' + escapeXml(sheetName || "Лист1") + '">' +
    '<Table ss:DefaultRowHeight="15">' + columns + body +
    "</Table>" +
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' +
    "<FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal>" +
    "<TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane>" +
    "</WorksheetOptions></Worksheet></Workbook>";
}

// ---------- Word ----------

// Размеры в твипах: 1 мм = 56.7 твипа. Поля по ГОСТ Р 7.0.97: левое 20 мм,
// правое 10 мм, верхнее и нижнее по 20 мм.
var PAGE_MARGIN = { top: 1134, right: 567, bottom: 1134, left: 1134 };
var FIRST_LINE = 709;   // абзацный отступ 12.5 мм
var ASIDE_LEFT = 5670;  // блок адресата начинается со 100 мм - правая половина листа
var TEXT_WIDTH = 11906 - PAGE_MARGIN.left - PAGE_MARGIN.right; // А4 минус поля

// Пакет приходит глобальной переменной с именем из code-name, require здесь
// нет. Рабочий объект у большинства сборок лежит в .default.
function docxLib() {
  if (typeof docx === "undefined" || !docx) {
    return null;
  }
  return docx.default ? docx.default : docx;
}

// Разбор **жирного** и *курсива*. Внутри одной строки, без вложенности:
// большего модель в деловом документе всё равно не использует.
function inlineRuns(lib, text) {
  var runs = [];
  var rest = String(text == null ? "" : text);
  var pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/;

  while (rest !== "") {
    var found = pattern.exec(rest);
    if (!found) {
      runs.push(new lib.TextRun(rest));
      break;
    }
    if (found.index > 0) {
      runs.push(new lib.TextRun(rest.slice(0, found.index)));
    }
    if (found[1] !== undefined) {
      runs.push(new lib.TextRun({ text: found[1], bold: true }));
    } else {
      runs.push(new lib.TextRun({ text: found[2], italics: true }));
    }
    rest = rest.slice(found.index + found[0].length);
  }

  return runs.length ? runs : [new lib.TextRun("")];
}

function cellParagraph(lib, text, bold) {
  return new lib.Paragraph({
    children: bold
      ? [new lib.TextRun({ text: text2(text), bold: true })]
      : inlineRuns(lib, text),
    spacing: { before: 40, after: 40, line: 240 },
    alignment: bold ? lib.AlignmentType.CENTER : lib.AlignmentType.LEFT
  });
}

// Доли колонок по длине содержимого, но не уже 12 % ширины полосы набора:
// колонка "Подпись" пустая по смыслу, и без нижней границы она схлопнулась бы
// в нитку.
function docxColumnWidths(rows, columns) {
  var lengths = [];
  var column;

  for (column = 0; column < columns; column += 1) {
    var longest = 1;
    rows.forEach(function (row) {
      var cell = row[column] === undefined ? "" : String(row[column]);
      longest = Math.max(longest, cell.length);
    });
    lengths.push(longest);
  }

  var floor = 0.12;
  var total = lengths.reduce(function (sum, length) { return sum + length; }, 0);
  var shares = lengths.map(function (length) {
    return Math.max(floor, total ? length / total : 1 / columns);
  });
  var scale = shares.reduce(function (sum, share) { return sum + share; }, 0);

  return shares.map(function (share) {
    return Math.round(TEXT_WIDTH * share / scale);
  });
}

function tableBlock(lib, block) {
  if (!lib.Table || !lib.TableRow || !lib.TableCell) {
    // Сборка без таблиц - лучше отдать строки абзацами, чем уронить документ.
    return block.rows.map(function (row) {
      return new lib.Paragraph({ children: inlineRuns(lib, row.join("   ")) });
    });
  }

  var columns = block.rows.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);

  // Без явных ширин Word раскладывает колонки по единственной строке сетки
  // и таблица получается перекошенной. Считаем доли по длине содержимого.
  var widths = docxColumnWidths(block.rows, columns);

  var rows = block.rows.map(function (row, position) {
    var isHeader = block.header && position === 0;
    var cells = [];
    for (var column = 0; column < columns; column += 1) {
      cells.push(new lib.TableCell({
        children: [cellParagraph(lib, row[column] === undefined ? "" : row[column], isHeader)],
        width: { size: widths[column], type: lib.WidthType.DXA },
        shading: isHeader ? { fill: "DCE6F1" } : undefined,
        margins: { top: 60, bottom: 60, left: 120, right: 120 }
      }));
    }
    return new lib.TableRow({ children: cells, tableHeader: isHeader });
  });

  var table = {
    rows: rows,
    columnWidths: widths,
    width: { size: TEXT_WIDTH, type: lib.WidthType.DXA }
  };

  // Таблица без строки-разделителя - это не данные, а раскладка: подпись,
  // дата, реквизиты в две колонки. Рамки в таком месте выглядят нелепо.
  if (!block.header && lib.BorderStyle) {
    var none = { style: lib.BorderStyle.NONE, size: 0, color: "FFFFFF" };
    table.borders = {
      top: none, bottom: none, left: none, right: none,
      insideHorizontal: none, insideVertical: none
    };
  }

  return [new lib.Table(table)];
}

function renderBlock(lib, block) {
  if (block.kind === "h1") {
    return [new lib.Paragraph({
      children: [new lib.TextRun({ text: text2(block.text), bold: true, size: 30 })],
      alignment: lib.AlignmentType.CENTER,
      spacing: { before: 240, after: 240, line: 240 }
    })];
  }

  if (block.kind === "h2") {
    return [new lib.Paragraph({
      children: [new lib.TextRun({ text: text2(block.text), bold: true })],
      alignment: lib.AlignmentType.LEFT,
      spacing: { before: 240, after: 120, line: 288 }
    })];
  }

  if (block.kind === "aside") {
    return block.lines.map(function (line, position) {
      return new lib.Paragraph({
        children: inlineRuns(lib, line),
        indent: { left: ASIDE_LEFT },
        spacing: {
          before: position === 0 ? 0 : 0,
          after: position === block.lines.length - 1 ? 240 : 0,
          line: 240
        }
      });
    });
  }

  if (block.kind === "list") {
    return block.items.map(function (item) {
      return new lib.Paragraph({
        children: [new lib.TextRun(item.marker + " ")].concat(inlineRuns(lib, item.text)),
        indent: { left: FIRST_LINE, hanging: 340 },
        spacing: { before: 0, after: 60, line: 288 }
      });
    });
  }

  if (block.kind === "rule") {
    return [new lib.Paragraph({
      children: [new lib.TextRun("")],
      spacing: { before: 120, after: 120, line: 240 },
      border: { bottom: { style: lib.BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }
    })];
  }

  if (block.kind === "table") {
    return tableBlock(lib, block);
  }

  return [new lib.Paragraph({
    children: inlineRuns(lib, block.text),
    alignment: lib.AlignmentType.JUSTIFIED,
    indent: { firstLine: FIRST_LINE },
    spacing: { before: 0, after: 120, line: 312 }
  })];
}

function buildDocxDocument(lib, text) {
  var blocks = withFallbackHeading(parseBlocks(text));
  var children = [];

  blocks.forEach(function (block) {
    renderBlock(lib, block).forEach(function (element) {
      children.push(element);
    });
  });

  if (!children.length) {
    children.push(new lib.Paragraph({ children: [new lib.TextRun("")] }));
  }

  return new lib.Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 28 },
          paragraph: { spacing: { line: 312 } }
        }
      }
    },
    sections: [{
      properties: { page: { margin: PAGE_MARGIN } },
      children: children
    }]
  });
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
    isRule: isRule,
    splitRow: splitRow,
    parseRows: parseRows,
    parseBlocks: parseBlocks,
    withFallbackHeading: withFallbackHeading,
    escapeXml: escapeXml,
    cellXml: cellXml,
    columnWidths: columnWidths,
    docxColumnWidths: docxColumnWidths,
    toSpreadsheetXml: toSpreadsheetXml,
    buildDocxDocument: buildDocxDocument
  };
} else {
  return run(fileName, content);
}
