// searchRegulations - поиск по базе знаний KHub с отсечкой по релевантности.
//
// Зачем обёртка вместо прямого вызова Rag.retrieveChunks узлом-инструментом.
//
// Rag.retrieveChunks возвращает фиксированное число чанков всегда, даже когда
// в базе ничего похожего нет: на вопрос про премию мастера участка он честно
// вернул 7 фрагментов про допуск в коллектор и делопроизводство с лучшим
// score 4.1, тогда как на настоящее попадание score был 15-18.7. То есть
// "пустой список" как признак "не найдено" не работает - такого списка
// не бывает. Решение принимается по score, и принимать его должен код,
// а не модель: у кода порог один и тот же от запуска к запуску.
//
// Второй эффект: у модели пропадает повод искать снова другими словами.
// Без явного found=false она уходит в цикл переформулировок и упирается
// в лимит последовательных вызовов, теряя весь ход.

var MAX_ITEMS = 5;
var MAX_CONTENT = 1200;

function isRelevant(chunk, minScore) {
  return Boolean(chunk) && typeof chunk.score === "number" && chunk.score >= minScore;
}

// Оставляем только то, что нужно модели для ответа с ссылкой на источник.
// Полные чанки раздувают контекст и провоцируют пересказ лишнего.
function toItem(chunk) {
  var source = chunk.source || {};
  var content = String(chunk.content || "");
  return {
    content: content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) + "…" : content,
    document: source.path || null,
    url: source.externalLink || null,
    score: chunk.score
  };
}

function selectChunks(chunks, minScore) {
  if (!Array.isArray(chunks) || !chunks.length) {
    return { found: false, reason: "empty", topScore: null, checked: 0 };
  }

  var scores = chunks
    .map(function (chunk) { return chunk && typeof chunk.score === "number" ? chunk.score : null; })
    .filter(function (score) { return score !== null; });
  var topScore = scores.length ? Math.max.apply(null, scores) : null;

  // Порог решает один вопрос: есть ли вообще попадание. Решает он его
  // по лучшему чанку, а не по каждому.
  //
  // Раньше порог применялся к каждому чанку, и это оказалось вредно: на вопрос
  // о порядке допуска выше 8 прошёл ровно один фрагмент - "область применения",
  // а разделы с самим порядком остались за бортом. Модель получила обрывок,
  // увидела, что ответа в нём нет, и ушла рассуждать вместо ответа.
  //
  // Соседние чанки того же документа сами по себе релевантны: KHub отдаёт их
  // по убыванию, и они про то же самое. Поэтому при попадании отдаём верхушку
  // целиком, а при промахе не отдаём ничего.
  if (topScore === null || topScore < minScore) {
    return { found: false, reason: "not_relevant", topScore: topScore, checked: chunks.length };
  }

  var ranked = chunks.filter(function (chunk) {
    return chunk && typeof chunk.score === "number";
  });
  ranked.sort(function (a, b) { return b.score - a.score; });

  return {
    found: true,
    items: ranked.slice(0, MAX_ITEMS).map(toItem),
    topScore: topScore,
    checked: chunks.length
  };
}

async function run(text, ragKey, threshold) {
  // Порог - настройка узла, а не константа кода. Без него считать нельзя:
  // молчаливое значение по умолчанию разошлось бы с тем, что видно в интерфейсе.
  if (typeof threshold !== "number" || !isFinite(threshold)) {
    await Log.error({
      message: "Порог релевантности не задан",
      data: { minScore: threshold, type: typeof threshold }
    });
    return { found: false, reason: "misconfigured", query: text };
  }

  var response = await Rag.retrieveChunks({ ragIntegration: ragKey, query: text });
  var result = selectChunks(response && response.chunks, threshold);

  await Log.info({
    message: "Поиск по базе знаний",
    data: {
      query: text,
      found: result.found,
      reason: result.reason || null,
      topScore: result.topScore,
      checked: result.checked,
      minScore: threshold
    }
  });

  result.query = text;
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isRelevant: isRelevant, toItem: toItem, selectChunks: selectChunks };
} else {
  return run(query, ragIntegration, minScore);
}
