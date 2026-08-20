# User Functions

User functions are stored in `functions/<collection-name>/<function-name>/` directories.
Each function directory contains:
- `schema.yml` — function metadata and parameter definitions
- `code.js` or `code.py` — implementation file matching `language` (optional)

## schema.yml Fields

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `description` | string | yes | Function description for LLM tool calling |  |
 `id` | string | yes | Unique function identifier |  |
 `language` | string | yes | Function language |  |
 `name` | string | yes | Function name | sendEmail |
 `parameters` | list | no | List of function input parameters |  |
 `response-description` | string | no | Description of what the function returns |  |

## Parameter Definition

| YAML Field | Type | Required | Description | Example |
------------|------|----------|-------------|---------|
 `description` | string | yes | Parameter description for LLM |  |
 `items` | parameterdef | no | Item definition for ARRAY type parameters |  |
 `name` | string | yes | Parameter name | email |
 `properties` | list | no | Nested properties for OBJECT type parameters |  |
 `required` | boolean | yes | Whether the parameter is required |  |
 `type` | string | yes | Parameter type: STRING, NUMBER, INTEGER, BOOLEAN, OBJECT, ARRAY, CREDENTIAL, LLM_MODEL, INTEGRATION_DB, INTEGRATION_SMTP, INTEGRATION_RAG | STRING |

### Parameter Types

| Type | Description |
|------|-------------|
| `STRING` | Text value |
| `NUMBER` | Floating-point number |
| `INTEGER` | Integer number |
| `BOOLEAN` | True/false |
| `OBJECT` | Nested object (use `properties` to define fields) |
| `ARRAY` | Array (use `items` to define element type) |
| `CREDENTIAL` | Reference to a credential key |
| `LLM_MODEL` | Reference to an LLM integration |
| `INTEGRATION_DB` | Reference to a database integration |
| `INTEGRATION_SMTP` | Reference to an SMTP integration |
| `INTEGRATION_RAG` | Reference to a RAG integration |

## Rules

- Function IDs must be camelCase and must NOT contain dashes. Example: `saveFoodEntry`, not `save-food-entry`.
- Function code language is defined by the parent collection `language`.
- Function parameters are available as top-level variables in the implementation file. For example, if a function has a parameter `userId`, use `userId` directly — not `params.userId` or `arguments.userId`.
