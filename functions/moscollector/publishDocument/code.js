// publishDocument - выдача документа файлом через встроенное хранилище платформы.
//
// Написано по образцу из JAICP, но переложено на песочницу Agents Platform:
// import и require здесь отсутствуют, логирование идёт через Log.info, а botId
// не хардкодится - его отдаёт Context.getBotId(). Http.post для загрузки
// не годится: его body объявлен как JSON-объект и multipart не отправит,
// поэтому единственный путь - глобальный fetch с FormData.
//
// Адрес хранилища константой сознательно: это демо-стенд в облаке. На on-prem
// хост другой, и тогда адрес переезжает в документ базы, как остальные настройки.

var UPLOAD_URL = "https://bot.jaicp.com/restapi/file/upload";

var MIME_BY_EXTENSION = {
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  htm: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8"
};

var DEFAULT_MIME = "application/octet-stream";

function extensionOf(name) {
  var match = /\.([0-9a-zA-Z]+)$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

function mimeFor(name) {
  return MIME_BY_EXTENSION[extensionOf(name)] || DEFAULT_MIME;
}

// Хранилище отдаёт файл без указания кодировки, и Windows читает его в CP1251:
// кириллица превращается в "РРЅСЃС‚СЂСѓРєС†РёСЏ". Указания charset в MIME при
// загрузке недостаточно - до скачивающего оно не доезжает. Признак кодировки
// должен лежать внутри самого файла.
//
// Для простого текста это BOM, для HTML - мета-тег. Оба способа работают
// без участия сервера.
var BOM = "﻿";
var BOM_EXTENSIONS = { txt: true, md: true, csv: true };

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
    // Модель прислала голый фрагмент - заворачиваем в документ с кодировкой.
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

// Имя в хранилище делаем уникальным: одинаковые имена от разных сотрудников
// иначе рискуют перетереть друг друга.
function uniqueName(name, stamp) {
  var raw = String(name || "document.txt");
  var extension = extensionOf(raw);
  var base = extension ? raw.slice(0, -(extension.length + 1)) : raw;
  base = base.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
  return base + "-" + stamp + (extension ? "." + extension : ".txt");
}

// Ради одного понятного ответа вместо пяти разных исключений.
function missingGlobals() {
  var missing = [];
  if (typeof fetch === "undefined") { missing.push("fetch"); }
  if (typeof FormData === "undefined") { missing.push("FormData"); }
  if (typeof Blob === "undefined") { missing.push("Blob"); }
  return missing;
}

function linkFrom(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  // Образец возвращал link. Соседние поля проверяем на случай, если форма ответа
  // окажется другой - тогда это будет видно сразу, а не после отладки.
  return payload.link || payload.url || payload.fileUrl || null;
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

  var botId = await Context.getBotId();
  var fileName = uniqueName(name, Date.now());
  var body = withEncoding(fileName, text);

  var form = new FormData();
  form.append("file", new Blob([body], { type: mimeFor(fileName) }), fileName);
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
  // чтобы он мог назвать её текстом. Узел вызывается без подтверждения:
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
    withEncoding: withEncoding
  };
} else {
  return run(fileName, content);
}
