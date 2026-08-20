// probeRuntime - разовая диагностика песочницы. Удалить после проверки.
//
// Вопрос, ради которого она написана: есть ли в песочнице Agents Platform
// глобальные fetch, FormData и Blob. От этого зависит, сможем ли мы грузить
// файлы во встроенное хранилище (bot.jaicp.com/restapi/file/upload) или
// придётся поднимать свой сервис с S3.
//
// Присланный образец кода написан для JAICP: там есть import, log() и
// toPrettyString(). В песочнице Agents Platform require и import отсутствуют,
// а логирование делается через Log.info({message, data}), поэтому переносить
// код напрямую нельзя - сначала надо узнать, что здесь вообще есть.
//
// typeof на необъявленном идентификаторе не бросает ReferenceError, поэтому
// проверки ниже безопасны и не нуждаются в try/catch.

async function run() {
  var report = {
    // Всё, что нужно для multipart-загрузки без своего сервиса.
    fetch: typeof fetch,
    FormData: typeof FormData,
    Blob: typeof Blob,
    Headers: typeof Headers,
    Request: typeof Request,
    Response: typeof Response,

    // Работа с бинарными данными: чем формировать тело файла.
    Buffer: typeof Buffer,
    Uint8Array: typeof Uint8Array,
    ArrayBuffer: typeof ArrayBuffer,
    TextEncoder: typeof TextEncoder,
    btoa: typeof btoa,
    atob: typeof atob,

    // Общая форма окружения.
    globalThis: typeof globalThis,
    process: typeof process,
    require: typeof require,
    setTimeout: typeof setTimeout,
    URL: typeof URL,

    // Что из JAICP-образца отсутствует у нас.
    jaicpLog: typeof log,
    jaicpToPrettyString: typeof toPrettyString
  };

  // Полный идентификатор бота - то, что в образце захардкожено как BOT_ID.
  try {
    report.botId = await Context.getBotId();
  } catch (error) {
    report.botId = "error: " + (error && error.message ? error.message : String(error));
  }

  await Log.info({ message: "probeRuntime", data: report });

  return report;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { run: run };
} else {
  return run();
}
