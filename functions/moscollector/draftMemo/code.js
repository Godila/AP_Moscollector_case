// draftMemo - сборка служебной записки по корпоративному шаблону.
//
// Функция намеренно устроена в два захода. Первый вызов сообщает, каких полей
// не хватает и какими словами их спросить; агент задаёт вопросы, дожидается
// ответов и вызывает функцию повторно с заполненным fieldsJson.
//
// Так состав полей задаёт инструкция по делопроизводству, а не модель:
// список обязательных реквизитов лежит в базе рядом с шаблонами и правится
// без выкладки кода.
//
// Значения полей приходят строкой JSON, а не параметром типа OBJECT: набор
// ключей у каждого шаблона свой, а схема параметров требует описать свойства
// объекта заранее.

var DOCUMENT_KEY = "memo-templates";
var EMPLOYEES_KEY = "employees";

// Заглушки, которыми модель пытается закрыть незаполненное поле, чтобы
// пройти проверку. В выданном документе они и всплывали: "привлечь
// следующих работников: [заполнить]". Считаем их пустотой и спрашиваем
// у сотрудника ещё раз - записка с прочерком вместо фамилий бесполезна.
var PLACEHOLDERS = [
  "заполнить", "уточнить", "указать", "не указано", "неизвестно",
  "нет данных", "данных нет", "tbd", "todo", "n/a", "na", "xxx", "..."
];

function looksLikePlaceholder(value) {
  var text = String(value).trim().toLowerCase().replace(/^[[({<]+|[\])}>]+$/g, "").trim();

  if (text === "" || text === "-" || text === "—" || text === "?" || text === "_") {
    return true;
  }
  return PLACEHOLDERS.indexOf(text) !== -1;
}

function documentValue(document) {
  if (!document || typeof document !== "object") {
    return null;
  }
  return document.value && typeof document.value === "object" ? document.value : document;
}

function classify(document) {
  var source = documentValue(document);
  if (!source || !Array.isArray(source.templates)) {
    return { state: "absent", keys: source ? Object.keys(source) : [] };
  }
  var usable = source.templates.filter(function (template) {
    return template && typeof template.body === "string" && Array.isArray(template.requiredFields);
  });
  if (!usable.length) {
    return { state: "broken", keys: Object.keys(source) };
  }
  return { state: "ok", value: source, templates: usable };
}

function normalize(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.toLowerCase().replace(/ё/g, "е").replace(/[^0-9a-zа-я]+/g, " ").trim();
}

// Совпадение по алиасу весомее совпадения по названию: "выезд бригады"
// должно побеждать общее слово "записка" в заголовке.
function scoreTemplate(template, haystack) {
  var score = 0;

  (template.aliases || []).forEach(function (alias) {
    var needle = normalize(alias);
    if (needle && haystack.indexOf(needle) !== -1) {
      score += 3;
    }
  });

  var title = normalize(template.title);
  if (title && haystack.indexOf(title) !== -1) {
    score += 2;
  }

  return score;
}

function findTemplate(templates, topic) {
  var haystack = normalize(topic);
  if (!haystack) {
    return { status: "not_found" };
  }

  var best = null;
  var bestScore = 0;

  templates.forEach(function (template) {
    var score = scoreTemplate(template, haystack);
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  });

  return best ? { status: "found", template: best } : { status: "not_found" };
}

function parseFields(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, value: {} };
  }
  try {
    var parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false };
  }
}

function isFilled(value) {
  if (typeof value !== "string") {
    return value !== null && value !== undefined;
  }
  return value.trim() !== "" && !looksLikePlaceholder(value);
}

function missingFields(template, fields) {
  return (template.requiredFields || []).filter(function (field) {
    return !isFilled(fields[field.name]);
  });
}

// Плейсхолдеры вида {{name}}. Неизвестные оставляем как есть - это заметно
// в тексте и лучше, чем молча подставленная пустота.
function renderBody(template, fields) {
  return String(template.body).replace(/\{\{\s*([0-9a-zA-Z_]+)\s*\}\}/g, function (match, key) {
    return isFilled(fields[key]) ? String(fields[key]) : match;
  });
}

// ---------- готовый документ ----------
//
// Функция возвращает не только текст записки, но и её же в разметке, из
// которой publishDocument собирает Word: шапка с адресатом, заголовок, тема,
// текст, маршрут согласования, подпись и дата. Иначе оформление документа
// сочиняет модель, а сочиняет она его каждый раз по-новому.

function findPerson(people, clientId) {
  if (!Array.isArray(people) || !clientId) {
    return null;
  }
  var needle = String(clientId);
  var found = people.filter(function (person) {
    return person && String(person.clientId) === needle;
  });
  return found.length ? found[0] : null;
}

// "Пётр" + "Ковалёв" -> "П. Ковалёв". Отчества в справочнике нет, поэтому
// одного инициала достаточно; полное ФИО подставит DocsVision при регистрации.
function signatureName(person) {
  if (!person) {
    return null;
  }
  var lastname = typeof person.lastname === "string" ? person.lastname.trim() : "";
  var name = typeof person.name === "string" ? person.name.trim() : "";

  if (lastname && name) {
    return name.charAt(0).toUpperCase() + ". " + lastname;
  }
  if (lastname) {
    return lastname;
  }
  if (typeof person.displayName === "string" && person.displayName.trim() !== "") {
    return person.displayName.trim();
  }
  return null;
}

function formatDate(date) {
  function pad(value) { return value < 10 ? "0" + value : String(value); }
  return pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." + date.getFullYear();
}

function buildDocument(template, body, author, dateText) {
  var lines = [];
  var position = author && typeof author.position === "string" ? author.position.trim() : "";
  var name = signatureName(author);

  lines.push("> " + (template.addresseeDefault || "Руководителю"));
  lines.push("> ГУП «Москоллектор»");
  lines.push("> ");
  var role = position ? position.charAt(0).toLowerCase() + position.slice(1) : "";
  lines.push("> от: " + (name ? name + (role ? ", " + role : "") : "______________________"));
  lines.push("");
  lines.push("# СЛУЖЕБНАЯ ЗАПИСКА");
  lines.push("");
  lines.push("## " + template.title);
  lines.push("");
  lines.push(body);

  if (Array.isArray(template.approvalRoute) && template.approvalRoute.length) {
    lines.push("");
    lines.push("## Маршрут согласования");
    lines.push("");
    template.approvalRoute.forEach(function (step, index) {
      lines.push(index + 1 + ". " + step);
    });
  }

  if (typeof template.approvalNote === "string" && template.approvalNote.trim() !== "") {
    lines.push("");
    lines.push("**Примечание.** " + template.approvalNote.trim());
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("| " + (position || "Составитель") + " |  | " + (name || "______________________") + " |");
  lines.push("");
  lines.push(dateText);

  return lines.join("\n");
}

async function run(topic, rawFields, dbKey) {
  var parsed = parseFields(rawFields);
  if (!parsed.ok) {
    await Log.error({ message: "fieldsJson не разобрался", data: { raw: String(rawFields).slice(0, 200) } });
    return { ok: false, reason: "bad_fields" };
  }

  var document = await Db.get({ dbIntegration: dbKey, documentKey: DOCUMENT_KEY });
  var found = classify(document);

  if (found.state !== "ok") {
    await Log.error({
      message: "Шаблоны служебных записок не настроены",
      data: { state: found.state, documentKey: DOCUMENT_KEY, keys: found.keys }
    });
    return { ok: false, reason: found.state };
  }

  var match = findTemplate(found.templates, topic);
  if (match.status !== "found") {
    return {
      ok: false,
      reason: "template_not_found",
      available: found.templates.map(function (template) { return template.title; })
    };
  }

  var template = match.template;
  var missing = missingFields(template, parsed.value);

  if (missing.length) {
    return {
      ok: false,
      reason: "need_fields",
      template: template.title,
      missing: missing.map(function (field) {
        return { name: field.name, label: field.label, question: field.question };
      })
    };
  }

  var clientInfo = await Context.getClientInfo();
  var employeesDoc = await Db.get({ dbIntegration: dbKey, documentKey: EMPLOYEES_KEY });
  var employees = documentValue(employeesDoc) || {};
  var author = findPerson(employees.people, clientInfo && clientInfo.id);

  var body = renderBody(template, parsed.value);
  var dateText = formatDate(new Date());

  await Log.info({
    message: "Служебная записка собрана",
    data: { template: template.id, authorKnown: !!author }
  });

  return {
    ok: true,
    title: template.title,
    addressee: template.addresseeDefault || null,
    body: body,
    document: buildDocument(template, body, author, dateText),
    approvalRoute: template.approvalRoute || [],
    approvalNote: template.approvalNote || null,
    requisites: found.value.commonRequisites || [],
    regulationRef: template.regulationRef || null
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    classify: classify,
    normalize: normalize,
    scoreTemplate: scoreTemplate,
    findTemplate: findTemplate,
    parseFields: parseFields,
    missingFields: missingFields,
    renderBody: renderBody,
    isFilled: isFilled,
    looksLikePlaceholder: looksLikePlaceholder,
    findPerson: findPerson,
    signatureName: signatureName,
    formatDate: formatDate,
    buildDocument: buildDocument
  };
} else {
  return run(topic, fieldsJson, dbIntegration);
}
