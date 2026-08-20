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
  return typeof value === "string" ? value.trim() !== "" : value !== null && value !== undefined;
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

  await Log.info({ message: "Служебная записка собрана", data: { template: template.id } });

  return {
    ok: true,
    title: template.title,
    addressee: template.addresseeDefault || null,
    body: renderBody(template, parsed.value),
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
    renderBody: renderBody
  };
} else {
  return run(topic, fieldsJson, dbIntegration);
}
