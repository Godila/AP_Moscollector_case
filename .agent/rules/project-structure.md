# Project Structure

This document describes the directory layout of an Agent Platform project.

```
<project-root>/
├── manifest.yml                    # Project manifest (schema version, project key)
├── settings.yml                    # Project settings (language, engine version)
├── CLAUDE.md                       # AI assistant instructions (this project)
├── .agent/
│   ├── system-functions/           # JSON Schemas for system functions
│   ├── mcp-functions/              # JSON Schemas for MCP functions
│   └── rules/                      # Detailed format documentation
│       ├── project-structure.md    # This file
│       ├── node-types.md           # Node types and their fields
│       ├── user-functions.md       # User function format
│       ├── integrations.md         # Integration and credential formats
│       └── function-list.md        # List of all available functions
├── nodes/
│   ├── agents/                     # LLM agent nodes
│   │   └── <node-id>.yml
│   ├── functions/                  # Function call nodes
│   │   └── <node-id>.yml
│   ├── code/                       # Custom JavaScript/Python code nodes
│   │   └── <node-id>/
│   │       ├── schema.yml          # Node definition
│   │       └── code.js|code.py     # Implementation
│   ├── conditions/                 # Conditional branching nodes
│   │   └── <node-id>.yml
│   └── triggers/                   # Trigger nodes (entry points)
│       ├── message/                # Triggered by user message
│       ├── schedule/               # Triggered by cron/interval
│       ├── webhook/                # Triggered by HTTP webhook
│       └── imap/                   # Triggered by incoming email
├── functions/
│   └── <collection-name>/
│       └── <function-name>/
│           ├── schema.yml          # Function definition and parameters
│           └── code.js|code.py     # Function implementation
├── integrations/
│   ├── mcp/                        # MCP server integrations
│   ├── smtp/                       # SMTP email integrations
│   ├── llm/                        # LLM model integrations
│   ├── databases/                  # Database connections
│   ├── inbound-channels/           # Messaging channel integrations
│   ├── rag/                        # RAG (Retrieval-Augmented Generation) integrations
│   ├── sip/                        # SIP telephony integrations
│   ├── asr/                        # Automatic Speech Recognition
│   ├── tts/                        # Text-to-Speech
│   ├── imap/                       # IMAP email integrations
│   └── jayguard/                   # Jayguard security integrations
└── credentials/
    └── <group>/                    # Credential group (e.g. llm, smtp, other)
        └── <key>.yml               # Credential metadata (no secrets)
```

## Key Concepts

- **Nodes** define the agent's execution flow. Each node connects to the next via `next-step`.
- **Agent nodes** are LLM-powered and can use tools (function/code nodes) to perform actions.
- **Trigger nodes** are entry points — they start a scenario when an event occurs.
- **Functions** contain reusable business logic written in JavaScript.
- **Integrations** connect the project to external services (LLMs, email, databases, etc.).
- **Credentials** are stored in `credentials/<group>/<key>.yml` — actual secrets are managed outside the file structure.

## Rules

- Do NOT modify `manifest.yml` unless you know what you are doing.