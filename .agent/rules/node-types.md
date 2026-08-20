# Node Types

Nodes are the building blocks of the agent scenario. Each node is a YAML file in `nodes/<type>/` directory.
All YAML files use **kebab-case** field naming (e.g. `llm-model-key`, `next-step`).

## Common Node Fields

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `id` | string | yes | Unique node identifier | agent-1 |
 `name` | string | yes | Human-readable node name | Main Agent |
 `next-error-step` | string | no | ID of the node to execute when this node fails (error fallback) |  |
 `next-step` | string | no | ID of the next node to execute after this one |  |
 `parameters` | params | yes | Node-type-specific parameters (varies by node type) |  |
 `position` | position | no | Node position on the visual canvas |  |

## Agent Node (`nodes/agents/`)

An LLM-powered agent node that can use tools and hand off to other agents.

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.chat-history-limit` | number | yes | Maximum number of chat history messages to include | 50 |
 `parameters.enable-context` | boolean | yes | Whether to include conversation context in LLM calls |  |
 `parameters.handoff-agents` | handoffagents | no | Configuration for agent handoff (transfer to other agents) |  |
 `parameters.llm-model-key` | string | no | Key of the LLM model to use | openai-gpt4 |
 `parameters.llm-model-settings` | agentllmsettings | no | LLM generation settings (temperature, maxTokens, etc.) |  |
 `parameters.sequential-tool-calls-limit` | number | yes | Maximum number of sequential tool calls before forcing a response | 10 |
 `parameters.stay-in-agent` | boolean | yes | Whether to keep conversation within this agent after tool execution |  |
 `parameters.system-promts` | agentsystempromts | no | System prompts configuration for the agent |  |
 `parameters.telephony-config` | telephonyconfig | no | Telephony-specific configuration (barge-in, fillers) |  |
 `parameters.tools` | list | no | List of tool node IDs available to this agent |  |
 `parameters.total-response-timeout` | timeoutconfig | no | Total response timeout configuration |  |
 `parameters.unique-tools-count-limit` | number | yes | Maximum number of unique tools that can be called by the agent | 10 |

### System Prompts

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.system-promts.goal` | string | no | Agent goal (what the agent should achieve) |  |
 `parameters.system-promts.instructions` | string | no | Detailed instructions for the agent behavior |  |
 `parameters.system-promts.query-override` | string | no | Override the user query before sending to LLM |  |
 `parameters.system-promts.role` | string | no | Agent role description (who the agent is) | You are a helpful assistant |

### LLM Model Settings

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.llm-model-settings.frequency-penalty` | float | yes | Frequency penalty to reduce repetition | 0.0 |
 `parameters.llm-model-settings.max-tokens` | number | no | Maximum number of tokens in LLM response | 2048 |
 `parameters.llm-model-settings.presence-penalty` | float | yes | Presence penalty to encourage topic diversity | 0.0 |
 `parameters.llm-model-settings.structured-output-enabled` | boolean | yes | Enable structured output mode (JSON Schema response). Incompatible with stayInAgent and verboseMode. |  |
 `parameters.llm-model-settings.structured-output-schema` | objectnode | no | JSON Schema for structured output. Required when structuredOutputEnabled is true. |  |
 `parameters.llm-model-settings.temperature` | float | yes | Sampling temperature (0.0 = deterministic, 1.0 = creative) | 0.7 |
 `parameters.llm-model-settings.top-p` | float | yes | Top-p (nucleus) sampling parameter | 1.0 |
 `parameters.llm-model-settings.verbose-mode` | boolean | yes | Whether to include verbose LLM output in logs |  |

### Handoff Agents

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.handoff-agents.allowed-agent-node-ids` | list | yes | List of specific agent node IDs that handoff is allowed to |  |
 `parameters.handoff-agents.allowed-any` | boolean | yes | Whether handoff to any agent is allowed |  |

### Telephony Config

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.telephony-config.barge-in-config` | bargeinconfig | no | Barge-in configuration (allow user to interrupt agent speech) |  |
 `parameters.telephony-config.enabled` | boolean | yes | Whether telephony features are enabled for this agent |  |
 `parameters.telephony-config.fillers-phrase-config` | fillersphraseconfig | no | Filler phrases configuration (spoken while waiting for LLM) |  |
 `parameters.telephony-config.llm-response-timeout-ms` | number | no | Timeout in ms to wait for LLM response before using filler |  |
 `parameters.telephony-config.silence-reprompt-config` | silencerepromptconfig | no | Silence reprompt configuration (reaction on caller silence after an LLM reply) |  |

## Function Node (`nodes/functions/`)

Executes a user-defined or system function.

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.collection` | string | yes | Name of the collection this function belongs to |  |
 `parameters.context-config` | functioncontextconfig | no | Configuration for storing function result in conversation context |  |
 `parameters.custom-headers` | map | no | Per-block custom HTTP headers (currently for MCP tools); values may be templates |  |
 `parameters.function` | string | yes | Function name |  |
 `parameters.hitl-tool-config` | hitltoolconfig | no | Human-in-the-loop tool confirmation configuration |  |
 `parameters.is-tool` | boolean | yes | Whether this function is exposed as a tool for LLM agent |  |
 `parameters.parameters` | map | no | Map of parameter name to parameter value with type info |  |
 `parameters.type` | string | yes | Function source type: USER, SYSTEM oк MCP | USER |

Each entry in `parameters.parameters` map is a parameter name mapped to an object with `type`, `value`, and `filled-ai` fields.
The `type` field inside each parameter entry specifies the parameter data type (STRING, NUMBER, INTEGER, BOOLEAN, CREDENTIAL, LLM_MODEL, INTEGRATION_DB, INTEGRATION_SMTP, INTEGRATION_RAG, ARRAY, OBJECT).

For primitive types (STRING, NUMBER, INTEGER, BOOLEAN, CREDENTIAL, LLM_MODEL, INTEGRATION_DB, INTEGRATION_SMTP, INTEGRATION_RAG), `value` is a string or null.
For ARRAY type: `value` must be null, use `items` list instead. Each item has `type` and `value`.
For OBJECT type: `value` must be null, use `properties` map instead. Each property has `type` and `value`.

ARRAY parameter example:
```yaml
recipients:
  type: ARRAY
  value: null
  items:
    - type: STRING
      value: "user@example.com"
  filled-ai: false
```

### Function Context Config

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.context-config.enabled` | boolean | yes | Whether context storage is enabled for this function |  |
 `parameters.context-config.handoff-agents` | handoffagents | no | Handoff agents configuration after function execution |  |
 `parameters.context-config.key` | string | no | Context key under which the result is stored |  |
 `parameters.context-config.put-if-error` | boolean | yes | Whether to store result in context even if function errors |  |
 `parameters.context-config.value-prefix` | string | yes | Prefix added to the stored value |  |

## Code Node (`nodes/code/`)

Executes custom JavaScript or Python code. Each code node is stored in its own subdirectory `nodes/code/<node-id>/`:
- `schema.yml` — node metadata (id, name, position, next-step)
- `code.js` or `code.py` — implementation file matching `parameters.language` (optional)

## Condition Node (`nodes/conditions/`)

Evaluates a JavaScript condition and branches the flow.

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.condition` | string | no | JavaScript condition expression that returns boolean |  |
 `parameters.false-step` | string | no | Node ID to go to when condition is false |  |

## Trigger: Schedule (`nodes/triggers/schedule/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.cron` | string | no | Cron expression for scheduled execution | 0 0 * * * |
 `parameters.end-after-date` | string | no | Date after which the trigger stops firing | 2025-12-31T23:59:59Z |
 `parameters.interval-seconds` | number | no | Interval in seconds between trigger executions |  |
 `parameters.max-repeat-count` | number | no | Maximum number of times the trigger will fire |  |
 `parameters.start-date-time` | string | no | Date and time when the trigger starts | 2025-01-01T00:00:00Z |

## Trigger: Webhook (`nodes/triggers/webhook/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.mock-payload` | webhooktriggerpayloaddto | no | Mock payload used to pre-fill the test-trigger form on the UI |  |
 `parameters.url` | string | no | Webhook URL path for this trigger |  |

## Trigger: Message (`nodes/triggers/message/`)

Triggers when a user sends a message. No additional parameters.

## Trigger: IMAP (`nodes/triggers/imap/`)

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `parameters.filter-rule` | map | no | Email filter rules for IMAP trigger |  |
 `parameters.mock-payload` | imaptriggerpayloaddto | no | Mock payload used to pre-fill the test-trigger form on the UI |  |

## Node Layout Rules

Each node occupies approximately 260px wide and 170px tall on the visual canvas.

**Horizontal flow (left to right):** Nodes connected via `next-step` are placed left to right. Minimum horizontal distance between nodes: 400px.

**Triggers:** Each trigger starts its own horizontal chain. Multiple triggers are stacked vertically (each trigger below the previous one, offset by at least 300px on the y-axis).

**Agent tools:** Tool nodes (function/code nodes referenced in agent's `tools` list) are placed on the same horizontal row below the agent node (y offset at least 250px). Tools are spread horizontally, centered under the agent.

Example layout for a project with one trigger, one agent, and two tools:
```
trigger (x:0, y:0) → agent (x:400, y:0)
                       tool1 (x:250, y:250)  tool2 (x:530, y:250)
```

## Rules

- Node IDs must be unique across the entire project.
- `next-step` fields reference other node IDs to define the execution flow.
- Agent node `tools` list references node IDs of function/code nodes that are available as tools.
