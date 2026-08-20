// helpdeskCreate - создание заявки в HelpDeskEddy с поиском дублей.
//
// Разбор API - src/integrations/helpdeskeddy.md. Оттуда три вещи, которые
// определили эту реализацию:
//
// 1. Тело запроса - JSON, поэтому берём системный Http.post, а не fetch.
// 2. GET /tickets/ отдаёт data объектом, ключи которого - ID заявок, а не
//    массивом. Наивный .map по нему падает.
// 3. Превышение лимита запросов блокирует доступ на 20 минут. Поэтому
//    повторных попыток нет: одна попытка, затем честный отказ. Ретраи
//    в день демонстрации стоили бы дороже, чем несозданная заявка.

var SETTINGS_KEY = "helpdesk";
var RULES_KEY = "sla-rules";
var DEDUP_PAGE_SIZE = 30;

function documentValue(document) {
  if (!document || typeof document !== "object") {
    return null;
  }
  return document.value && typeof document.value === "object" ? document.value : document;
}

function isFilled(value) {
  return typeof value === "string" && value.trim() !== "" && value.indexOf("ЗАПОЛНИТЬ") === -1;
}

// Настройка без хоста и ключа бесполезна, а молчаливое значение по умолчанию
// увело бы запросы неизвестно куда.
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

// btoa в песочнице может не быть - она уже показала, что окружение своё.
// Учётные данные ASCII, поэтому хватает простой таблицы.
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

// data приходит объектом с ID в ключах, а не массивом.
function ticketsOf(body) {
  var data = body && body.data;
  if (!data || typeof data !== "object") {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  return Object.keys(data).map(function (key) { return data[key]; });
}

function isOpen(ticket, closedStatusIds) {
  var closed = Array.isArray(closedStatusIds) ? closedStatusIds : [];
  var status = String(ticket && ticket.status_id);
  return closed.indexOf(status) === -1 && String(ticket && ticket.deleted) !== "1";
}

// Дубль - открытая заявка по той же системе с тем же кодом ошибки. Без кода
// ошибки не дедуплицируем вовсе: совпадение по одному лишь названию системы
// склеило бы разные проблемы в одну заявку.
function findDuplicate(tickets, errorCode, system, closedStatusIds) {
  if (!isFilled(errorCode)) {
    return null;
  }
  var needle = String(errorCode).trim().toLowerCase();
  var systemNeedle = String(system || "").trim().toLowerCase();

  var matches = tickets.filter(function (ticket) {
    if (!isOpen(ticket, closedStatusIds)) {
      return false;
    }
    var haystack = (String(ticket.title || "") + " " + String(ticket.description || "")).toLowerCase();
    if (haystack.indexOf(needle) === -1) {
      return false;
    }
    return systemNeedle === "" || haystack.indexOf(systemNeedle) !== -1;
  });

  return matches.length ? matches[0] : null;
}

function priorityFor(rules, categoryId, errorCode) {
  var source = documentValue(rules) || {};
  var codes = Array.isArray(source.errorCodes) ? source.errorCodes : [];
  var categories = Array.isArray(source.categories) ? source.categories : [];

  if (isFilled(errorCode)) {
    var byCode = codes.filter(function (entry) {
      return String(entry.code).toLowerCase() === String(errorCode).trim().toLowerCase();
    })[0];
    if (byCode && byCode.priority) {
      return byCode.priority;
    }
  }

  var byCategory = categories.filter(function (entry) { return entry.id === categoryId; })[0];
  return byCategory ? byCategory.defaultPriority : null;
}

function reactionFor(rules, priorityCode) {
  var source = documentValue(rules) || {};
  var list = Array.isArray(source.priorities) ? source.priorities : [];
  var found = list.filter(function (entry) { return entry.code === priorityCode; })[0];
  return found ? found.reaction : null;
}

// Незаполненные сопоставления не отправляем: HelpDeskEddy подставит свои
// значения по умолчанию, и заявка создастся в любом случае.
function buildTicketBody(settings, input, priorityCode) {
  var body = {
    title: input.title,
    description: input.description,
    create_from_user: 1
  };

  if (isFilled(settings.defaultUserEmail)) {
    body.user_email = settings.defaultUserEmail;
  }
  if (typeof settings.departmentId === "number") {
    body.department_id = settings.departmentId;
  }
  if (typeof settings.typeId === "number") {
    body.type_id = settings.typeId;
  }

  var mapping = settings.priorityByCode || {};
  if (priorityCode && typeof mapping[priorityCode] === "number") {
    body.priority_id = mapping[priorityCode];
  }

  return body;
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

async function run(input) {
  var settingsDoc = await Db.get({ dbIntegration: input.dbIntegration, documentKey: SETTINGS_KEY });
  var settings = readSettings(settingsDoc);

  if (settings.state !== "ok") {
    await Log.error({
      message: "Интеграция с HelpDeskEddy не настроена",
      data: { state: settings.state, missing: settings.missing || null, keys: settings.keys }
    });
    return { ok: false, reason: "not_configured", missing: settings.missing || null };
  }

  var config = settings.value;
  var headers = { Authorization: authHeader(config.email, config.apiKey), Accept: "application/json" };
  var rulesDoc = await Db.get({ dbIntegration: input.dbIntegration, documentKey: RULES_KEY });

  // Шаг 1: поиск дублей. Отдельного фильтра "только открытые" без знания ID
  // статусов не построить, поэтому отбираем на своей стороне.
  if (isFilled(input.errorCode)) {
    var search = await Http.get({
      url: apiUrl(config.host, "/tickets/"),
      params: { search: String(input.errorCode).trim(), page: 1, deleted: 0 },
      headers: headers
    });

    if (search.status === 200) {
      var duplicate = findDuplicate(
        ticketsOf(search.body),
        input.errorCode,
        input.system,
        config.closedStatusIds
      );
      if (duplicate) {
        await Log.info({
          message: "Найдена открытая заявка с тем же признаком",
          data: { number: duplicate.unique_id, errorCode: input.errorCode }
        });
        return {
          ok: true,
          duplicate: true,
          number: duplicate.unique_id || String(duplicate.id),
          title: duplicate.title,
          status: duplicate.status_id,
          createdAt: duplicate.date_created
        };
      }
    } else {
      // Поиск не удался - это не повод не создавать заявку. Хуже создать
      // дубль, чем потерять обращение.
      await Log.warn({
        message: "Поиск дублей не выполнен, создаём заявку",
        data: { status: search.status }
      });
    }
  }

  // Шаг 2: создание.
  var priorityCode = priorityFor(rulesDoc, input.categoryId, input.errorCode);
  var response = await Http.post({
    url: apiUrl(config.host, "/tickets/"),
    headers: headers,
    body: buildTicketBody(config, input, priorityCode)
  });

  if (response.status !== 200 && response.status !== 201) {
    await Log.error({
      message: "HelpDeskEddy отклонил создание заявки",
      data: { status: response.status, body: JSON.stringify(response.body || "").slice(0, 500) }
    });
    return { ok: false, reason: failureReason(response.status), status: response.status };
  }

  var created = (response.body && response.body.data) || {};
  var number = created.unique_id || (created.id ? String(created.id) : null);

  await Log.info({
    message: "Заявка создана",
    data: { number: number, priority: priorityCode, errorCode: input.errorCode || null }
  });

  return {
    ok: true,
    duplicate: false,
    number: number,
    status: created.status_id || null,
    priority: priorityCode,
    reaction: reactionFor(rulesDoc, priorityCode)
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    base64Ascii: base64Ascii,
    authHeader: authHeader,
    apiUrl: apiUrl,
    ticketsOf: ticketsOf,
    isOpen: isOpen,
    findDuplicate: findDuplicate,
    priorityFor: priorityFor,
    reactionFor: reactionFor,
    buildTicketBody: buildTicketBody,
    readSettings: readSettings,
    failureReason: failureReason
  };
} else {
  return run({
    title: title,
    description: description,
    system: system,
    errorCode: errorCode,
    categoryId: categoryId,
    dbIntegration: dbIntegration
  });
}
