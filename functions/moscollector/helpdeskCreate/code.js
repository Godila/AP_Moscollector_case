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
var EMPLOYEES_KEY = "employees";


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

// Постановщик заявки.
//
// Заявки от учётной записи интеграции падали в папку "от меня" администратора
// вместо общей очереди. Постановщиком должен быть сам сотрудник.
//
// Агент сотрудников НЕ создаёт. В HelpDeskEddy они заводятся импортом
// из корпоративного каталога, как и положено, а наше дело - опознать
// существующего и сослаться на его user_id. Если сотрудника в системе нет,
// это пробел в провижининге: чинит администратор, а не бот. Создавать
// пользователя на каждое обращение значило бы засорять систему учётками
// с выдуманными адресами.
//
// Цепочка опознания: собеседник канала -> корпоративная почта -> user_id.
// Первое звено в eXpress даёт корпоративный аккаунт; в Telegram и тестовом
// виджете его заменяет справочник employees.
function findPerson(people, clientId) {
  if (!Array.isArray(people) || !isFilled(clientId)) {
    return null;
  }
  var needle = String(clientId);
  var found = people.filter(function (person) {
    return person && String(person.clientId) === needle;
  });
  return found.length ? found[0] : null;
}

function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Какую почту искать в HelpDeskEddy. Справочник - основной источник,
// fallbackUserEmail - демонстрационная подмена на случай незнакомого
// собеседника, чтобы показ не спотыкался. В бою её быть не должно.
function requesterEmail(people, clientId, settings) {
  var person = findPerson(people, clientId);
  if (person && looksLikeEmail(person.email)) {
    return { email: person.email, source: "directory" };
  }
  if (looksLikeEmail(settings.fallbackUserEmail)) {
    return { email: settings.fallbackUserEmail, source: "fallback" };
  }
  return { email: null, source: "none" };
}

function fullNameOf(user) {
  if (!user) {
    return null;
  }
  var parts = [user.lastname, user.name].filter(function (part) {
    return typeof part === "string" && part.trim() !== "";
  });
  return parts.length ? parts.join(" ") : user.email || null;
}

// exact_search не гарантирует, что первым придёт именно нужный: сверяем сами.
function pickUserByEmail(users, email) {
  var needle = String(email).trim().toLowerCase();
  var found = (users || []).filter(function (user) {
    return user && String(user.email).trim().toLowerCase() === needle;
  });
  return found.length ? found[0] : null;
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
function buildTicketBody(settings, input, priorityCode, requester) {
  var body = {
    title: input.title,
    description: input.description,
    create_from_user: 1
  };

  // Ссылаемся на существующего пользователя по id. user_email здесь не годится:
  // при незнакомом адресе HelpDeskEddy молча заведёт нового пользователя,
  // а нам нужно ровно обратное - опознать, а не создать.
  if (requester && requester.id) {
    body.user_id = requester.id;
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

// Только поиск. Создание пользователей - зона администратора, не агента.
async function lookupUser(config, headers, email) {
  var search = await Http.get({
    url: apiUrl(config.host, "/users/"),
    params: { search: email, exact_search: 1 },
    headers: headers
  });

  if (search.status !== 200) {
    return { state: "lookup_failed", status: search.status };
  }

  var user = pickUserByEmail(ticketsOf(search.body), email);
  if (!user) {
    return { state: "not_registered" };
  }

  return { state: "ok", id: user.id, email: user.email, fullName: fullNameOf(user) };
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

  // Кто ставит заявку: канал -> корпоративная почта -> существующий user_id.
  var clientInfo = await Context.getClientInfo();
  var clientId = clientInfo && clientInfo.id ? String(clientInfo.id) : "";
  var employeesDoc = await Db.get({ dbIntegration: input.dbIntegration, documentKey: EMPLOYEES_KEY });
  var employees = documentValue(employeesDoc) || {};
  var people = Array.isArray(employees.people) ? employees.people : [];

  var identity = requesterEmail(people, clientId, config);
  if (!identity.email) {
    await Log.error({
      message: "Не удалось определить постановщика",
      data: { clientId: clientId, people: people.length }
    });
    return { ok: false, reason: "unknown_requester" };
  }

  var requester = await lookupUser(config, headers, identity.email);

  if (requester.state === "not_registered") {
    await Log.error({
      message: "Сотрудник не заведён в HelpDeskEddy",
      data: { email: identity.email, source: identity.source }
    });
    return { ok: false, reason: "requester_not_registered", email: identity.email };
  }
  if (requester.state !== "ok") {
    return { ok: false, reason: failureReason(requester.status), status: requester.status };
  }

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
    body: buildTicketBody(config, input, priorityCode, requester)
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
    data: {
      number: number,
      priority: priorityCode,
      errorCode: input.errorCode || null,
      requester: requester.email,
      requesterId: requester.id,
      identitySource: identity.source
    }
  });

  return {
    ok: true,
    duplicate: false,
    number: number,
    status: created.status_id || null,
    priority: priorityCode,
    reaction: reactionFor(rulesDoc, priorityCode),
    requester: requester.fullName
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
    findPerson: findPerson,
    looksLikeEmail: looksLikeEmail,
    requesterEmail: requesterEmail,
    fullNameOf: fullNameOf,
    pickUserByEmail: pickUserByEmail,
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
