// navGuide - пошаговые сценарии входа в сервисы и навигации по разделам.
//
// Параметры узла приходят переменными верхнего уровня: request, dbIntegration.
// Эталонное содержимое документа - src/db/nav-scenarios.json.
//
// Запасных сценариев в коде нет: шаги устаревают вместе с интерфейсом, и копия
// в коде расходилась бы с базой молча.

var DOCUMENT_KEY = "nav-scenarios";

// Порог 2, а не 1, потому что совпадения по одному названию сервиса мало.
// На "Не открывается DocsVision, ошибка E-500" сценарий согласования служебной
// записки набирал единицу за слово "DocsVision" и возвращался как найденный -
// формально верно, по сути мусор. Теперь нужно совпадение по разделу (+2)
// или по алиасу (+3), то есть по тому, ЧТО человек хочет сделать,
// а не только где.
var MIN_SCORE = 2;

function documentValue(document) {
  if (!document || typeof document !== "object") {
    return null;
  }
  return document.value && typeof document.value === "object" ? document.value : document;
}

function classify(document) {
  var source = documentValue(document);
  if (!source || !Array.isArray(source.scenarios)) {
    return { state: "absent", keys: source ? Object.keys(source) : [] };
  }
  var usable = source.scenarios.filter(function (scenario) {
    return scenario && Array.isArray(scenario.steps) && scenario.steps.length;
  });
  if (!usable.length) {
    return { state: "broken", keys: Object.keys(source) };
  }
  return { state: "ok", scenarios: usable };
}

// Регистр, пунктуация и Ё роли не играют: запрос приходит из живой речи.
function normalize(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/g, " ")
    .trim();
}

// Слова, которые есть в любой фразе и ничего не различают.
var STOPWORDS = {
  как: true, где: true, что: true, для: true, при: true, это: true,
  мне: true, нужно: true, надо: true, можно: true, посмотреть: true
};

// Сравниваем по усечённым основам: "согласовать" и "согласование" - одно и то же
// для наших целей, а точное совпадение словоформ в русском не работает.
// Пять символов подобраны по нашему же справочнику: "служебную"/"служебной",
// "записку"/"записки", "бригад"/"бригады" сходятся, разные слова - нет.
function stems(text) {
  return normalize(text)
    .split(" ")
    .filter(function (word) {
      return word.length >= 3 && !STOPWORDS[word];
    })
    .map(function (word) {
      return word.slice(0, 5);
    });
}

function coverage(phrase, queryStems) {
  var words = stems(phrase);
  if (!words.length) {
    return 0;
  }
  var hits = words.filter(function (word) {
    return queryStems.indexOf(word) !== -1;
  });
  return hits.length / words.length;
}

// Алиас весомее раздела, раздел весомее сервиса. Название сервиса само по себе
// даёт единицу - этого мало, чтобы пройти порог: одного упоминания системы
// недостаточно, нужно понять, ЧТО с ней хотят сделать.
function scoreScenario(scenario, queryStems) {
  var score = 0;

  var bestAlias = 0;
  (scenario.aliases || []).forEach(function (alias) {
    bestAlias = Math.max(bestAlias, coverage(alias, queryStems));
  });
  if (bestAlias >= 0.5) {
    score += 3;
  }

  if (coverage(scenario.section, queryStems) >= 0.5) {
    score += 2;
  }

  if (coverage(scenario.service, queryStems) >= 0.6) {
    score += 1;
  }

  return score;
}

function findScenario(scenarios, request) {
  var queryStems = stems(request);
  if (!queryStems.length) {
    return { status: "not_found", suggestions: [] };
  }

  var best = null;
  var bestScore = 0;

  scenarios.forEach(function (scenario) {
    var score = scoreScenario(scenario, queryStems);
    if (score > bestScore) {
      best = scenario;
      bestScore = score;
    }
  });

  if (!best || bestScore < MIN_SCORE) {
    return { status: "not_found" };
  }

  return { status: "found", scenario: best, score: bestScore };
}

async function run(query, dbKey) {
  // Сигнатура сверена с .agent/system-functions/Db/get.json.
  var document = await Db.get({ dbIntegration: dbKey, documentKey: DOCUMENT_KEY });
  var found = classify(document);

  if (found.state !== "ok") {
    await Log.error({
      message: "Сценарии навигации не настроены",
      data: { state: found.state, documentKey: DOCUMENT_KEY, keys: found.keys }
    });
    return { found: false, reason: found.state, request: query };
  }

  var result = findScenario(found.scenarios, query);
  if (result.status !== "found") {
    // "Не нашлось" здесь означает только одно: готового сценария в справочнике
    // нет. Ответ при этом вполне может быть в базе знаний - руководства
    // по системам лежат там. Раньше агент на этом останавливался и отправлял
    // сотрудника к руководителю, имея нужный документ под рукой.
    return {
      found: false,
      reason: "not_found",
      request: query,
      tryNext: "searchRegulations",
      hint: "Готового сценария в справочнике нет. Это не значит, что ответа нет: " +
        "поищи в базе знаний через searchRegulations, руководства по системам лежат там. " +
        "Состав справочника сотруднику не перечисляй."
    };
  }

  return {
    found: true,
    service: result.scenario.service,
    section: result.scenario.section,
    steps: result.scenario.steps,
    url: result.scenario.url || null,
    note: result.scenario.note || null
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    documentValue: documentValue,
    classify: classify,
    normalize: normalize,
    stems: stems,
    coverage: coverage,
    scoreScenario: scoreScenario,
    findScenario: findScenario
  };
} else {
  return run(request, dbIntegration);
}
