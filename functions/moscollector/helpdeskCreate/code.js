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
// Цепочка опознания: собеседник канала -> корпоративная почта -> user_email
// в заявке. Первое звено в eXpress даёт корпоративный аккаунт; в Telegram
// и тестовом виджете его заменяет справочник employees.
//
// Дальше ничего делать не нужно: клиента HelpDeskEddy опознаёт или заводит
// сам по user_email. Отдельного провижининга здесь быть не должно - клиент
// это не сотрудник поддержки, ему не нужны ни пароль, ни группа, ни доступ
// в систему.
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

// Какую почту искать в HelpDeskEddy, в порядке убывания доверия:
//
// 1. справочник - собеседник уже привязан к сотруднику;
// 2. почта, которую сотрудник назвал сам в этом диалоге;
// 3. fallbackUserEmail - подмена для тестового виджета, где clientId меняется
//    каждую сессию. По умолчанию выключена: молча приписать заявку чужому
//    человеку хуже, чем лишний раз спросить.
function resolveRequesterEmail(people, clientId, settings, provided) {
  var person = findPerson(people, clientId);
  if (person && looksLikeEmail(person.email)) {
    return { email: person.email, source: "directory" };
  }
  if (looksLikeEmail(provided)) {
    return { email: String(provided).trim(), source: "asked" };
  }
  if (looksLikeEmail(settings.fallbackUserEmail)) {
    return { email: settings.fallbackUserEmail, source: "fallback" };
  }
  return { email: null, source: "none" };
}

// Привязка канала к клиенту: запоминаем "собеседник - почта", чтобы
// не спрашивать при каждом обращении. ФИО берём из ответа HelpDeskEddy.
function withPerson(employees, clientId, email, fullName) {
  var people = Array.isArray(employees.people) ? employees.people : [];
  var without = people.filter(function (person) {
    return !person || String(person.clientId) !== String(clientId);
  });
  return without.concat([{
    clientId: String(clientId),
    email: String(email).trim(),
    displayName: fullName || null,
    boundBy: "self"
  }]);
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

  // Клиента HelpDeskEddy заводит и опознаёт сам по user_email: если такой
  // адрес уже есть, заявка ляжет на существующего, если нет - создастся новый.
  // Отдельный вызов POST /users/ для этого не нужен, а он ещё и требует пароль,
  // которого у клиента быть не должно.
  if (requester && looksLikeEmail(requester.email)) {
    body.user_email = requester.email;
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

// ---------- сбор сведений и черновик ----------
//
// Состав заявки проверяет функция, а не промт. Указание "спроси недостающее"
// модель выполняла через раз: получив короткое "не работает DocsVision", она
// заводила заявку с этой же строкой в описании. Теперь недостающие поля
// возвращаются списком с готовыми вопросами - тем же приёмом, что и в записке.
//
// Подтверждение тоже держится на коде. Функция создаёт заявку только
// с confirmToken, который сама же выдала вместе с черновиком: не показав
// сотруднику состав заявки, модель токена не получит, а если после
// подтверждения перепишет текст - токен перестанет сходиться.

var DETAIL_QUESTIONS = [
  { name: "system", question: "В какой системе возникла проблема?" },
  { name: "whatHappened", question: "Что вы делали, что ожидали получить и что получилось вместо этого?" },
  { name: "errorCode", question: "Какой код ошибки показала система? Если кода нет, так и напишите — «нет»." },
  { name: "startedAt", question: "Когда это началось?" },
  { name: "repeats", question: "Повторяется ли это или случилось один раз?" }
];

var NO_CODE = ["нет", "нету", "без кода", "не было", "не показала", "отсутствует", "-", "—"];

function saysNoCode(value) {
  return NO_CODE.indexOf(String(value || "").trim().toLowerCase()) !== -1;
}

// Код ошибки, пригодный для поиска дублей. "нет" - это заполненный ответ,
// но искать по нему нечего.
function searchableCode(value) {
  return isFilled(value) && !saysNoCode(value) ? String(value).trim() : null;
}

function missingDetails(input) {
  return DETAIL_QUESTIONS.filter(function (field) {
    return !isFilled(input[field.name]);
  });
}

function composeDescription(input) {
  var code = searchableCode(input.errorCode);
  var lines = [
    "Система: " + String(input.system).trim(),
    "Код ошибки: " + (code || "не указан"),
    "",
    String(input.whatHappened).trim(),
    "",
    "Началось: " + String(input.startedAt).trim(),
    "Повторяемость: " + String(input.repeats).trim(),
    "",
    "Заявка оформлена ИИ-помощником со слов сотрудника."
  ];
  return lines.join("\n");
}

// Короткий отпечаток содержимого. Криптостойкость здесь не нужна: задача
// не в защите, а в том, чтобы подтверждали ровно то, что показали.
function draftToken(title, description, email) {
  var text = String(title) + " " + String(description) + " " + String(email);
  var hash = 5381;
  for (var i = 0; i < text.length; i += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
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

  // Кто ставит заявку: канал -> корпоративная почта -> существующий user_id.
  var clientInfo = await Context.getClientInfo();
  var clientId = clientInfo && clientInfo.id ? String(clientInfo.id) : "";
  var employeesDoc = await Db.get({ dbIntegration: input.dbIntegration, documentKey: EMPLOYEES_KEY });
  var employees = documentValue(employeesDoc) || {};
  var people = Array.isArray(employees.people) ? employees.people : [];

  var identity = resolveRequesterEmail(people, clientId, config, input.requesterEmail);

  // Шаг 1: чего не хватает. Недостающая почта - такой же незаданный вопрос,
  // как и остальные, поэтому спрашиваем всё разом, а не в два подхода.
  var missing = missingDetails(input);
  if (!identity.email) {
    missing = missing.concat([{
      name: "requesterEmail",
      question: "Назовите вашу рабочую почту — заявка будет оформлена от вашего имени."
    }]);
  }

  if (missing.length) {
    return { ok: false, reason: "need_details", missing: missing };
  }

  var requester = { email: identity.email };
  var description = composeDescription(input);
  var priorityCode = priorityFor(rulesDoc, input.categoryId, searchableCode(input.errorCode));
  var token = draftToken(input.title, description, identity.email);

  // Шаг 2: черновик. Пока сотрудник не подтвердил показанный ему состав,
  // наружу не ходим вовсе - ни поиска дублей, ни создания.
  if (String(input.confirmToken || "").trim() !== token) {
    return {
      ok: true,
      stage: "draft",
      confirmToken: token,
      draft: {
        title: input.title,
        description: description,
        system: input.system,
        errorCode: searchableCode(input.errorCode),
        categoryId: input.categoryId || null,
        priority: priorityCode,
        reaction: reactionFor(rulesDoc, priorityCode),
        requesterEmail: identity.email,
        requesterSource: identity.source
      }
    };
  }

  // Шаг 3: поиск дублей. Отдельного фильтра "только открытые" без знания ID
  // статусов не построить, поэтому отбираем на своей стороне.
  var code = searchableCode(input.errorCode);
  if (code) {
    var search = await Http.get({
      url: apiUrl(config.host, "/tickets/"),
      params: { search: code, page: 1, deleted: 0 },
      headers: headers
    });

    if (search.status === 200) {
      var duplicate = findDuplicate(
        ticketsOf(search.body),
        code,
        input.system,
        config.closedStatusIds
      );
      if (duplicate) {
        await Log.info({
          message: "Найдена открытая заявка с тем же признаком",
          data: { number: duplicate.unique_id, errorCode: code }
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

  // Шаг 4: создание.
  var response = await Http.post({
    url: apiUrl(config.host, "/tickets/"),
    headers: headers,
    body: buildTicketBody(
      config,
      { title: input.title, description: description },
      priorityCode,
      requester
    )
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

  // Собеседник назвал почту и заявка прошла - запоминаем, чтобы в следующий
  // раз не спрашивать. Пишем только после успеха: непроверенная почта
  // в справочнике хуже, чем её отсутствие.
  if (identity.source === "asked" && isFilled(clientId)) {
    employees.people = withPerson(
      employees,
      clientId,
      identity.email,
      fullNameOf({ name: created.user_name, lastname: created.user_lastname, email: created.user_email })
    );
    await Db.put({ dbIntegration: input.dbIntegration, documentKey: EMPLOYEES_KEY, value: employees });
  }

  await Log.info({
    message: "Заявка создана",
    data: {
      number: number,
      priority: priorityCode,
      errorCode: code,
      requester: identity.email,
      identitySource: identity.source
    }
  });

  return {
    ok: true,
    stage: "created",
    duplicate: false,
    number: number,
    status: created.status_id || null,
    priority: priorityCode,
    reaction: reactionFor(rulesDoc, priorityCode),
    requester: fullNameOf({ name: created.user_name, lastname: created.user_lastname, email: created.user_email })
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
    resolveRequesterEmail: resolveRequesterEmail,
    fullNameOf: fullNameOf,
    withPerson: withPerson,
    pickUserByEmail: pickUserByEmail,
    readSettings: readSettings,
    failureReason: failureReason,
    saysNoCode: saysNoCode,
    searchableCode: searchableCode,
    missingDetails: missingDetails,
    composeDescription: composeDescription,
    draftToken: draftToken
  };
} else {
  return run({
    title: title,
    system: system,
    whatHappened: whatHappened,
    errorCode: errorCode,
    startedAt: startedAt,
    repeats: repeats,
    categoryId: categoryId,
    requesterEmail: requesterEmail,
    confirmToken: confirmToken,
    dbIntegration: dbIntegration
  });
}
