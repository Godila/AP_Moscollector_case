// helpdeskStatus - состояние заявок в HelpDeskEddy.
//
// Названия статусов не хранятся в настройках намеренно: их отдаёт сам
// HelpDeskEddy через GET /statuses/, и справочник в базе рано или поздно
// разошёлся бы с системой. Лишний запрос при лимите в 300 в минуту дешевле,
// чем расхождение, которое заметят на демо.
//
// Разбор API - src/integrations/helpdeskeddy.md.

var SETTINGS_KEY = "helpdesk";
var RECENT_LIMIT = 5;

function documentValue(document) {
  if (!document || typeof document !== "object") {
    return null;
  }
  return document.value && typeof document.value === "object" ? document.value : document;
}

function isFilled(value) {
  return typeof value === "string" && value.trim() !== "" && value.indexOf("ЗАПОЛНИТЬ") === -1;
}

function readSettings(document) {
  var source = documentValue(document);
  if (!source) {
    return { state: "absent", keys: [] };
  }
  var missing = ["host", "email", "apiKey"].filter(function (field) {
    return !isFilled(source[field]);
  });
  if (missing.length) {
    return { state: "incomplete", missing: missing, keys: Object.keys(source) };
  }
  return { state: "ok", value: source };
}

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Ascii(input) {
  var text = String(input);
  var out = "";
  for (var i = 0; i < text.length; i += 3) {
    var c1 = text.charCodeAt(i);
    var c2 = i + 1 < text.length ? text.charCodeAt(i + 1) : NaN;
    var c3 = i + 2 < text.length ? text.charCodeAt(i + 2) : NaN;

    out += B64.charAt(c1 >> 2);
    out += B64.charAt(((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4));
    out += isNaN(c2) ? "=" : B64.charAt(((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6));
    out += isNaN(c3) ? "=" : B64.charAt(c3 & 63);
  }
  return out;
}

function authHeader(email, apiKey) {
  return "Basic " + base64Ascii(email + ":" + apiKey);
}

function apiUrl(host, path) {
  return String(host).replace(/\/+$/, "") + "/api/v2" + path;
}

// У /tickets/ data - объект с ID в ключах, у справочников - массив.
function ticketsOf(body) {
  var data = body && body.data;
  if (!data || typeof data !== "object") {
    return [];
  }
  return Array.isArray(data) ? data : Object.keys(data).map(function (key) { return data[key]; });
}

// name у статуса - объект с переводами: {"ru": "Открыто", "en": "Open"}.
function statusNames(body) {
  var list = (body && body.data) || [];
  var names = {};
  (Array.isArray(list) ? list : []).forEach(function (entry) {
    if (!entry || entry.id === undefined) {
      return;
    }
    var name = entry.name;
    names[String(entry.id)] = name && name.ru ? name.ru : String(entry.id);
  });
  return names;
}

function toTicket(raw, names) {
  var statusId = String(raw.status_id);
  return {
    number: raw.unique_id || String(raw.id),
    title: raw.title || "",
    status: names[statusId] || statusId,
    createdAt: raw.date_created || null,
    updatedAt: raw.date_updated || null
  };
}

function failureReason(status) {
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "request_failed";
}

async function run(number, dbKey) {
  var settingsDoc = await Db.get({ dbIntegration: dbKey, documentKey: SETTINGS_KEY });
  var settings = readSettings(settingsDoc);

  if (settings.state !== "ok") {
    await Log.error({
      message: "Интеграция с HelpDeskEddy не настроена",
      data: { state: settings.state, missing: settings.missing || null, keys: settings.keys }
    });
    return { ok: false, reason: "not_configured" };
  }

  var config = settings.value;
  var headers = { Authorization: authHeader(config.email, config.apiKey), Accept: "application/json" };

  var params = { page: 1, deleted: 0 };
  if (isFilled(number)) {
    params.search = String(number).trim();
    params.exact_search = 1;
  }

  var response = await Http.get({ url: apiUrl(config.host, "/tickets/"), params: params, headers: headers });

  if (response.status !== 200) {
    await Log.error({
      message: "HelpDeskEddy не отдал список заявок",
      data: { status: response.status, number: number || null }
    });
    return { ok: false, reason: failureReason(response.status), status: response.status };
  }

  // Справочник статусов запрашиваем только когда есть что подписывать.
  var raw = ticketsOf(response.body);
  var names = {};
  if (raw.length) {
    var statuses = await Http.get({ url: apiUrl(config.host, "/statuses/"), headers: headers });
    if (statuses.status === 200) {
      names = statusNames(statuses.body);
    }
  }

  var tickets = raw.slice(0, isFilled(number) ? raw.length : RECENT_LIMIT).map(function (item) {
    return toTicket(item, names);
  });

  await Log.info({ message: "Запрошено состояние заявок", data: { number: number || null, found: tickets.length } });

  return { ok: true, tickets: tickets, searchedNumber: isFilled(number) ? String(number).trim() : null };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    readSettings: readSettings,
    base64Ascii: base64Ascii,
    authHeader: authHeader,
    apiUrl: apiUrl,
    ticketsOf: ticketsOf,
    statusNames: statusNames,
    toTicket: toTicket,
    failureReason: failureReason
  };
} else {
  return run(number, dbIntegration);
}
