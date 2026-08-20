# Integrations

Integrations are stored in `integrations/<type>/` directories. Each integration is a separate YAML file named `<key>.yml`.

## MCP Integration (`integrations/mcp/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `collection-name` | string | yes | Name of the function collection exposed by this MCP server |  |
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `custom-headers` | map | no | Custom HTTP headers sent with every request to the MCP server |  |
 `key` | string | yes | Unique integration key | my-mcp-server |
 `name` | string | yes | Human-readable integration name |  |
 `transport-type` | string | no | Transport type |  |
 `url` | string | yes | URL of the MCP server | https://mcp.example.com |

## SMTP Integration (`integrations/smtp/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `host` | string | yes | SMTP server hostname | smtp.gmail.com |
 `is-direct-access` | boolean | yes | Whether direct access mode is used |  |
 `is-ssl-enabled` | boolean | yes | Whether SSL is enabled |  |
 `is-tls-enabled` | boolean | yes | Whether TLS is enabled |  |
 `key` | string | yes | Unique integration key |  |
 `name` | string | yes | Human-readable integration name |  |
 `port` | number | no | SMTP server port | 587 |
 `sender` | string | yes | Sender email address | bot@example.com |

## LLM Integration (`integrations/llm/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `custom-headers` | jsonnode | no | Custom headers for direct access LLM model |  |
 `custom-url` | string | no | Custom URL for direct access LLM model |  |
 `is-direct-access` | boolean | yes | Whether this is a direct access (custom) LLM model |  |
 `key` | string | yes | Unique integration key | openai-gpt4 |
 `model` | string | yes | Model identifier | gpt-4 |
 `name` | string | yes | Human-readable integration name |  |
 `provider` | string | yes | LLM provider name | OpenAI |

`is-direct-access: false` (default) — the platform manages LLM credentials automatically. Do NOT create a credential or set `credential-key`.
`is-direct-access: true` — you must create a credential in `credentials/` and reference it via `credential-key`.
Unless the user explicitly asks for direct access, always use `is-direct-access: false`.

## Database (`integrations/databases/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `key` | string | yes | Unique database key |  |
 `name` | string | yes | Human-readable database name |  |
 `scope` | string | yes | Database scope: PROJECT or ACCOUNT | PROJECT |

## Inbound Channel (`integrations/inbound-channels/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `key` | string | yes | Unique channel key |  |
 `name` | string | yes | Human-readable channel name |  |
 `operator-channel-key` | string | no | Key of the linked operator channel |  |
 `settings` | map | no | Channel-specific settings |  |
 `type` | string | yes | Channel type (e.g. telegram, whatsapp) | telegram |

## RAG (`integrations/rag/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `is-current-account` | boolean | yes | Whether this integration uses the current account's KHub token |  |
 `key` | string | yes | Unique integration key |  |
 `name` | string | yes | Human-readable integration name |  |

## SIP (`integrations/sip/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `accept-incoming` | boolean | no | Whether to accept incoming calls |  |
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `host` | string | yes | SIP server hostname |  |
 `key` | string | yes | Unique integration key |  |
 `lines-available` | number | yes | Number of available SIP lines |  |
 `name` | string | yes | Human-readable integration name |  |
 `port` | number | yes | SIP server port | 5060 |

## ASR (`integrations/asr/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `key` | string | yes | Unique integration key |  |
 `name` | string | yes | Human-readable integration name |  |
 `provider-type` | string | yes | ASR provider type | google |
 `settings` | map | no | Provider-specific settings |  |

## TTS (`integrations/tts/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `key` | string | yes | Unique integration key |  |
 `name` | string | yes | Human-readable integration name |  |
 `provider-type` | string | yes | TTS provider type | google |
 `settings` | map | no | Provider-specific settings |  |

## IMAP (`integrations/imap/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `host` | string | yes | IMAP server hostname |  |
 `is-ssl-enabled` | boolean | yes | Whether SSL is enabled for the connection |  |
 `key` | string | yes | Unique integration key |  |
 `name` | string | yes | Human-readable integration name |  |
 `port` | number | yes | IMAP server port | 993 |

## Jayguard (`integrations/jayguard/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `credential-key` | string | no | Reference to credential used for authentication |  |
 `key` | string | yes | Unique integration key |  |
 `name` | string | yes | Human-readable integration name |  |

## Credentials

Credentials are stored in `credentials/<group>/<key>.yml`. They contain only metadata — actual secrets are never stored in files.

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `expired-at` | instant | no | Credential expiration date-time (ISO-8601), preserved across export/import | 2026-01-01T00:00:00Z |
 `group` | string | no | Credential group | LLM |
 `key` | string | yes | Unique credential key used for referencing | openai-cred |
 `name` | string | yes | Human-readable credential name | OpenAI API Key |
 `sub-group` | string | no | Credential sub-group | OPEN_AI |
 `type` | string | yes | Credential type (e.g. API_KEY, OAUTH2) | API_KEY |

## Rules

- Integration and credential `key` values must be globally unique. When creating a new integration or credential, always append a short random suffix (5-6 lowercase alphanumeric characters) to the logical name. For example, use `food-db-nsubyd` instead of `food-db`, or `openai-llm-k8mxp2` instead of `openai-llm`. This prevents accidental collisions when keys are replaced during project synchronization.
- The `key` is also used as the YAML filename (e.g. `integrations/llm/openai-llm-k8mxp2.yml`), so it must be a valid filename.
- When referencing an integration key in code (inside `code.js`/`code.py` of code blocks or user functions), use the exact same key value. During project import, all old keys in code are automatically replaced with new ones, so unique keys prevent unintended replacements.
