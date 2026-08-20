// navGuide - пошаговые сценарии входа в сервисы и навигации по разделам.
//
// Параметры узла приходят переменными верхнего уровня: request, dbIntegration.
// Эталонное содержимое документа - src/db/nav-scenarios.json.
//
// Запасных сценариев в коде нет: шаги устаревают вместе с интерфейсом, и копия
// в коде расходилась бы с базой молча.

var DOCUMENT_KEY = "nav-scenarios";
var MIN_SCORE = 1;

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

// Совпадение по алиасу весомее совпадения по названию раздела, а совпадение
// по разделу весомее совпадения по сервису: "список бригад" должен побеждать
// просто "АРМ", иначе на любой вопрос про АРМ вернётся первый попавшийся раздел.
function scoreScenario(scenario, haystack) {
  var score = 0;

  (scenario.aliases || []).forEach(function (alias) {
    var needle = normalize(alias);
    if (needle && haystack.indexOf(needle) !== -1) {
      score += 3;
    }
  });

  var section = normalize(scenario.section);
  if (section && haystack.indexOf(section) !== -1) {
    score += 2;
  }

  var service = normalize(scenario.service);
  if (service && haystack.indexOf(service) !== -1) {
    score += 1;
  }

  return score;
}

function findScenario(scenarios, request) {
  var haystack = normalize(request);
  if (!haystack) {
    return { status: "not_found", suggestions: [] };
  }

  var best = null;
  var bestScore = 0;

  scenarios.forEach(function (scenario) {
    var score = scoreScenario(scenario, haystack);
    if (score > bestScore) {
      best = scenario;
      bestScore = score;
    }
  });

  if (!best || bestScore < MIN_SCORE) {
    return {
      status: "not_found",
      suggestions: scenarios.slice(0, 5).map(function (scenario) {
        return scenario.service + " - " + scenario.section;
      })
    };
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
    return { found: false, reason: "not_found", request: query, suggestions: result.suggestions };
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
    scoreScenario: scoreScenario,
    findScenario: findScenario
  };
} else {
  return run(request, dbIntegration);
}
