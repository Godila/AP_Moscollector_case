# Available Functions

This file lists all functions available in this project.
For detailed info about parameters and response, read the corresponding file.

## System Functions

- `Context.getAccountId` — Gets the account ID from the current request's bot ID
  Schema: .agent/system-functions/Context/getAccountId.json
- `Context.getProjectShortName` — Gets the project short name from the current request's bot ID
  Schema: .agent/system-functions/Context/getProjectShortName.json
- `Context.getChannelType` — Gets the channel type from the current request
  Schema: .agent/system-functions/Context/getChannelType.json
- `Context.getBotId` — Gets the bot ID from the current request
  Schema: .agent/system-functions/Context/getBotId.json
- `Context.isTestChannel` — Checks if the current channel is a test channel
  Schema: .agent/system-functions/Context/isTestChannel.json
- `Context.isAsyncChannel` — Checks if the current channel is asynchronous
  Schema: .agent/system-functions/Context/isAsyncChannel.json
- `Context.getRequestId` — Gets the question ID from the current request
  Schema: .agent/system-functions/Context/getRequestId.json
- `Context.getMessageContent` — Gets the content of the message from the current request
  Schema: .agent/system-functions/Context/getMessageContent.json
- `Context.getChatId` — Gets the chat ID from the current request
  Schema: .agent/system-functions/Context/getChatId.json
- `Context.getSessionId` — Gets the session ID from the current request
  Schema: .agent/system-functions/Context/getSessionId.json
- `Context.getClientInfo` — Gets the client information from the current request
  Schema: .agent/system-functions/Context/getClientInfo.json
- `Context.getRawRequest` — Gets the raw request data from the current request
  Schema: .agent/system-functions/Context/getRawRequest.json
- `Context.getLastFunctionResult` — Gets the result of the previously executed function
  Schema: .agent/system-functions/Context/getLastFunctionResult.json
- `Context.getChatHistory` — Retrieves the chat history for the current account
  Schema: .agent/system-functions/Context/getChatHistory.json
- `Context.getEmailContent` — Gets email content from the current request
  Schema: .agent/system-functions/Context/getEmailContent.json
- `Context.getLastStateError` — Gets the structured error of the previously failed node, routed via its error connector
  Schema: .agent/system-functions/Context/getLastStateError.json
- `Credentials.get` — Retrieves credential information by its key
  Schema: .agent/system-functions/Credentials/get.json
- `Db.get` — Finds a single document by documentKey in the specified database collection
  Schema: .agent/system-functions/Db/get.json
- `Db.findByFilters` — Finds documents with filtering and pagination options
  Schema: .agent/system-functions/Db/findByFilters.json
- `Db.countByFilters` — Counts documents matching the filter
  Schema: .agent/system-functions/Db/countByFilters.json
- `Db.put` — Saves a document by documentKey (upsert operation)
  Schema: .agent/system-functions/Db/put.json
- `Db.deleteByFilters` — Deletes multiple documents by filter
  Schema: .agent/system-functions/Db/deleteByFilters.json
- `Db.delete` — Deletes a document by documentKey
  Schema: .agent/system-functions/Db/delete.json
- `Db.updateByFilters` — Updates documents matching the filter
  Schema: .agent/system-functions/Db/updateByFilters.json
- `Email.send` — Sends an email using the specified SMTP integration
  Schema: .agent/system-functions/Email/send.json
- `Http.get` — Sends an HTTP GET request to the specified URL
  Schema: .agent/system-functions/Http/get.json
- `Http.post` — Sends an HTTP POST request to the specified URL
  Schema: .agent/system-functions/Http/post.json
- `Http.put` — Sends an HTTP PUT request to the specified URL
  Schema: .agent/system-functions/Http/put.json
- `Http.delete` — Sends an HTTP DELETE request to the specified URL
  Schema: .agent/system-functions/Http/delete.json
- `Http.patch` — Sends an HTTP PATCH request to the specified URL
  Schema: .agent/system-functions/Http/patch.json
- `Http.send` — Send an HTTP request with the specified method and parameters
  Schema: .agent/system-functions/Http/send.json
- `Llm.sendRequest` — Sends a request to an LLM model
  Schema: .agent/system-functions/Llm/sendRequest.json
- `Llm.sendText` — Sends a simple text message to the LLM and returns the response content
  Schema: .agent/system-functions/Llm/sendText.json
- `Llm.getChatHistory` — Retrieves the chat history in LLM-compatible format
  Schema: .agent/system-functions/Llm/getChatHistory.json
- `Llm.summarizeText` — Summarizes long text to a specified size while preserving key information.
  Schema: .agent/system-functions/Llm/summarizeText.json
- `Rag.retrieveChunks` — Retrieves relevant chunks from a RAG integration based on a query
  Schema: .agent/system-functions/Rag/retrieveChunks.json
- `Rag.generateAnswer` — Generates an answer using a RAG integration based on a query
  Schema: .agent/system-functions/Rag/generateAnswer.json
- `Reactions.sendText` — Sends a text message as a response
  Schema: .agent/system-functions/Reactions/sendText.json
- `Reactions.sendHtml` — Sends a message with HTML formatting
  Schema: .agent/system-functions/Reactions/sendHtml.json
- `Reactions.sendAudio` — Sends an audio file as a response
  Schema: .agent/system-functions/Reactions/sendAudio.json
- `Reactions.sendImage` — Sends an image as a response
  Schema: .agent/system-functions/Reactions/sendImage.json
- `Reactions.sendVideo` — Sends a video as a response
  Schema: .agent/system-functions/Reactions/sendVideo.json
- `Reactions.sendFile` — Sends a file as a response
  Schema: .agent/system-functions/Reactions/sendFile.json
- `Reactions.sendLocation` — Sends a geographic location as a response
  Schema: .agent/system-functions/Reactions/sendLocation.json
- `Reactions.sendRawRequest` — Sends a raw request as a response for advanced use cases
  Schema: .agent/system-functions/Reactions/sendRawRequest.json
- `Telegram.sendVoice` — Sends a voice message to a Telegram chat
  Schema: .agent/system-functions/Telegram/sendVoice.json
- `Telegram.sendText` — Sends a text message to a Telegram chat
  Schema: .agent/system-functions/Telegram/sendText.json
- `Telegram.sendAudio` — Sends an audio file to a Telegram chat
  Schema: .agent/system-functions/Telegram/sendAudio.json
- `Telegram.sendImage` — Sends an image by URL to a Telegram chat
  Schema: .agent/system-functions/Telegram/sendImage.json
- `Telegram.sendButtons` — Sends a message with inline keyboard buttons to a Telegram chat
  Schema: .agent/system-functions/Telegram/sendButtons.json
- `SessionDb.get` — Finds a single document by documentKey
  Schema: .agent/system-functions/SessionDb/get.json
- `SessionDb.findByFilters` — Finds documents with filtering and pagination options
  Schema: .agent/system-functions/SessionDb/findByFilters.json
- `SessionDb.countByFilters` — Counts documents matching the filter
  Schema: .agent/system-functions/SessionDb/countByFilters.json
- `SessionDb.put` — Saves a document by documentKey (upsert operation)
  Schema: .agent/system-functions/SessionDb/put.json
- `SessionDb.delete` — Deletes a document by documentKey
  Schema: .agent/system-functions/SessionDb/delete.json
- `SessionDb.deleteByFilters` — Deletes multiple documents by filter
  Schema: .agent/system-functions/SessionDb/deleteByFilters.json
- `SessionDb.updateByFilters` — Updates documents matching the filter
  Schema: .agent/system-functions/SessionDb/updateByFilters.json
- `Asr.recognize` — Recognizes audio content using the specified ASR integration
  Schema: .agent/system-functions/Asr/recognize.json
- `Tts.synthesize` — Converts text to speech using the specified TTS integration and returns an audio URL
  Schema: .agent/system-functions/Tts/synthesize.json
- `ProjectRouter.callProject` — Calls external project by chat api token and optional custom data
  Schema: .agent/system-functions/ProjectRouter/callProject.json
- `ProjectRouter.switchTo` — Switches the conversation context to another project.
  Schema: .agent/system-functions/ProjectRouter/switchTo.json
- `ProjectRouter.backToOriginalProject` — Returns the conversation context back to the original project
  Schema: .agent/system-functions/ProjectRouter/backToOriginalProject.json
- `ProjectRouter.getCustomData` — Gets the custom data that was passed during the last context switch to this bot
  Schema: .agent/system-functions/ProjectRouter/getCustomData.json
- `AgentContext.addNote` — Adds a text fragment to the context. Empty strings are ignored.
  Schema: .agent/system-functions/AgentContext/addNote.json
- `AgentContext.getNotes` — Returns concatenated text (by time of addition)
  Schema: .agent/system-functions/AgentContext/getNotes.json
- `AgentContext.deleteNotes` — Deletes all stored text notes
  Schema: .agent/system-functions/AgentContext/deleteNotes.json
- `AgentContext.putValue` — Stores a key-value pair in the context. Used to store objects different from text.
  Schema: .agent/system-functions/AgentContext/putValue.json
- `AgentContext.getValue` — Retrieves a previously stored value
  Schema: .agent/system-functions/AgentContext/getValue.json
- `AgentContext.deleteValue` — Deletes a previously stored value
  Schema: .agent/system-functions/AgentContext/deleteValue.json
- `AgentContext.clearContext` — Clears the entire context (both text and KV)
  Schema: .agent/system-functions/AgentContext/clearContext.json
- `Dialer.getCaller` — Returns the phone number of the client. Returns null if rawRequest is not available
  Schema: .agent/system-functions/Dialer/getCaller.json
- `Dialer.hangUp` — Terminates the current call. On telephony channels sends a hangup reply, on other channels sends an optional text message
  Schema: .agent/system-functions/Dialer/hangUp.json
- `Dialer.isIncomingCall` — Checks whether the current call is incoming or outgoing. A call is incoming if there is no outgoing call ID
  Schema: .agent/system-functions/Dialer/isIncomingCall.json
- `Dialer.setNoInputTimeout` — Changes the timeout for waiting for a response from the client. Value is clamped to [100, 20000] ms
  Schema: .agent/system-functions/Dialer/setNoInputTimeout.json
- `Dialer.getAbonentTimezone` — Returns the timezone offset of the client as a formatted string (e.g. '+03:00:00'). Returns null if not available
  Schema: .agent/system-functions/Dialer/getAbonentTimezone.json
- `Dialer.getCallNotConnectedReason` — Returns the reason why an outgoing call was not connected. Returns null if not available
  Schema: .agent/system-functions/Dialer/getCallNotConnectedReason.json
- `Dialer.getCampaignSchedule` — Returns the schedule of the dialing campaign. Returns null if not available
  Schema: .agent/system-functions/Dialer/getCampaignSchedule.json
- `Dialer.getDialHistory` — Returns the history of completed and available dial attempts for the current number. Returns null if not available
  Schema: .agent/system-functions/Dialer/getDialHistory.json
- `Dialer.getPayload` — Returns the payload data associated with the dialed number. Returns an empty object if not available
  Schema: .agent/system-functions/Dialer/getPayload.json
- `Dialer.getRetryIntervals` — Returns the durations of pauses between dial retry attempts. Returns null if not available
  Schema: .agent/system-functions/Dialer/getRetryIntervals.json
- `Dialer.getRKCallID` — Returns the identifier of the outgoing call. Returns null if not on a resterisk channel
  Schema: .agent/system-functions/Dialer/getRKCallID.json
- `Dialer.getSipHeaders` — Returns the SIP headers from the current request. Returns an empty object if not available
  Schema: .agent/system-functions/Dialer/getSipHeaders.json
- `Dialer.redial` — Schedules a new series of retry attempts to dial the number. Requires startDateTime or localTimeFrom at least
  Schema: .agent/system-functions/Dialer/redial.json
- `Dialer.transferCall` — Transfers the active phone call to another phone number. The transfer result can be retrieved using getTransferStatus after the transfer completes.
  Schema: .agent/system-functions/Dialer/transferCall.json
- `Dialer.getTransferStatus` — Gets the result of the last call transfer. Returns SUCCESS, FAIL, TIMEOUT, or NOT_AVAILABLE if no transfer has been made yet.
  Schema: .agent/system-functions/Dialer/getTransferStatus.json
- `Log.info` — Logs an informational message
  Schema: .agent/system-functions/Log/info.json
- `Log.debug` — Logs a debug message
  Schema: .agent/system-functions/Log/debug.json
- `Log.trace` — Logs a trace message
  Schema: .agent/system-functions/Log/trace.json
- `Log.warn` — Logs a warning message
  Schema: .agent/system-functions/Log/warn.json
- `Log.error` — Logs an error message
  Schema: .agent/system-functions/Log/error.json

## User Functions

- `moscollector.glossaryLookup` — Расшифровывает корпоративную или техническую аббревиатуру Москоллектора по справочнику сокращений. Вызывай, когда в вопросе пользователя есть непонятное сокращение или он прямо просит расшифровать аббревиатуру. Работает только по справочнику: если сокращения там нет, функция об этом сообщит, и придумывать расшифровку самостоятельно нельзя.
  Directory: functions/moscollector/glossaryLookup/
- `moscollector.navGuide` — Возвращает пошаговый сценарий входа в корпоративный сервис или перехода в его раздел: АРМ ДС, HelpDesk, DocsVision, смена пароля. Вызывай, когда пользователь спрашивает, как куда-то зайти, где что находится или как выполнить действие в интерфейсе системы. Шаги берутся из справочника сценариев: если подходящего сценария нет, функция об этом сообщит, и придумывать шаги самостоятельно нельзя.
  Directory: functions/moscollector/navGuide/
- `moscollector.probeRuntime` — Диагностика песочницы: сообщает, какие глобальные объекты доступны коду функции и каков полный идентификатор бота. Вызывай только если пользователь написал слово ДИАГНОСТИКА. Во всех остальных случаях этот инструмент использовать нельзя.
  Directory: functions/moscollector/probeRuntime/
- `moscollector.publishDocument` — Сохраняет готовый текст документа во встроенное файловое хранилище и возвращает ссылку, по которой файл можно скачать. Вызывай, когда пользователь просит прислать документ файлом, а не текстом в переписке: служебную записку, инструкцию, выписку. Текст документа должен быть уже полностью составлен — функция ничего не дописывает и не проверяет.
  Directory: functions/moscollector/publishDocument/
- `moscollector.searchRegulations` — Ищет ответ в корпоративной базе знаний: регламенты, инструкции, руководства по системам. Вызывай для вопросов о порядке работ, требованиях, сроках, периодичности, действиях в нештатных ситуациях. Достаточно одного вызова: функция сама отбирает подходящие фрагменты и отсекает нерелевантные. Если вернулось found=false, повторять поиск другими словами бесполезно — этого в базе знаний нет.
  Directory: functions/moscollector/searchRegulations/

