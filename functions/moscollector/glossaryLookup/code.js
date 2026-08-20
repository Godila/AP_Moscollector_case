// glossaryLookup - расшифровка корпоративных и технических аббревиатур.
//
// Параметры узла приходят переменными верхнего уровня: term, dbIntegration.
// Эталонное содержимое документа - src/db/glossary.json, заливается в базу руками.
//
// Запасного справочника в коде нет намеренно: захардкоженная копия молча
// подменяла бы настройку и расходилась с ней.

var DOCUMENT_KEY = "glossary";

// Db.get на несуществующем ключе возвращает не null, а тот же конверт с пустым
// значением, поэтому проверка на null не сработает никогда.
function documentValue(document) {
  if (!document || typeof document !== "object") {
    return null;
  }
  return document.value && typeof document.value === "object" ? document.value : document;
}

// Состояний три, а не два. Без "absent" код принял бы отсутствие документа
// за порчу и отказался бы его засевать.
function classify(document) {
  var source = documentValue(document);
  if (!source || !Array.isArray(source.entries)) {
    return { state: "absent", keys: source ? Object.keys(source) : [] };
  }
  var usable = source.entries.filter(function (entry) {
    return entry && typeof entry.term === "string" && typeof entry.meaning === "string";
  });
  if (!usable.length) {
    return { state: "broken", keys: Object.keys(source) };
  }
  return { state: "ok", entries: usable };
}

// "АРМ Д.С." и "арм-дс" - одно и то же. Ё приводим к Е: в справочниках пишут по-разному.
function normalizeTerm(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.toUpperCase().replace(/Ё/g, "Е").replace(/[^0-9A-ZА-Я]/g, "");
}

function findTerm(entries, query) {
  var needle = normalizeTerm(query);
  if (!needle) {
    return { status: "not_found", suggestions: [] };
  }

  var exact = null;
  var partial = [];

  entries.forEach(function (entry) {
    var candidate = normalizeTerm(entry.term);
    if (candidate === needle) {
      exact = entry;
      return;
    }
    // Пользователь мог написать часть сокращения ("АРМ" вместо "АРМ ДС")
    // или наоборот дописать лишнее.
    if (candidate.indexOf(needle) === 0 || needle.indexOf(candidate) === 0) {
      partial.push(entry);
    }
  });

  if (exact) {
    return { status: "exact", entry: exact };
  }
  return {
    status: "not_found",
    suggestions: partial.slice(0, 5).map(function (entry) {
      return entry.term;
    })
  };
}

async function run(query, dbKey) {
  // В коллекции с npm-зависимостями встроенные функции возвращают промис,
  // без них - готовое значение. await безвреден в обоих случаях.
  //
  // Сигнатура сверена с .agent/system-functions/Db/get.json: оба поля обязательны,
  // на выходе объявлен ["object", "null"] - значит вернуться может и голый null,
  // и конверт с пустым значением. Оба случая ловит classify как "absent".
  var document = await Db.get({ dbIntegration: dbKey, documentKey: DOCUMENT_KEY });
  var found = classify(document);

  if (found.state !== "ok") {
    await Log.error({
      message: "Справочник аббревиатур не настроен",
      data: { state: found.state, documentKey: DOCUMENT_KEY, keys: found.keys }
    });
    return { found: false, reason: found.state, term: query };
  }

  var result = findTerm(found.entries, query);
  if (result.status !== "exact") {
    return { found: false, reason: "not_found", term: query, suggestions: result.suggestions };
  }

  return {
    found: true,
    term: result.entry.term,
    meaning: result.entry.meaning,
    note: result.entry.note || null,
    seeAlso: result.entry.seeAlso || []
  };
}

// Файл - это тело функции, поэтому return на верхнем уровне легален. В Node
// сработает первая ветка и тесты получат чистые функции, в песочнице module
// нет - сработает вторая. Один файл, ноль сборки.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    documentValue: documentValue,
    classify: classify,
    normalizeTerm: normalizeTerm,
    findTerm: findTerm
  };
} else {
  return run(term, dbIntegration);
}
