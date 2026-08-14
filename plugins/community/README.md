# CKBuilder Community AI Plugins

CKBuilder v6 discovers community **MCP** integrations from this directory. Community entries are **data-only manifests**: CKBuilder does not dynamically import or execute JavaScript from `plugins/community/`.

## Add a community plugin

1. Copy `example.plugin.json` to a new `*.json` file.
2. Give the plugin a unique lowercase `id`.
3. Point `endpoint` at the project's MCP Streamable HTTP endpoint. Remote endpoints must use HTTPS; localhost may use HTTP for development.
4. Keep `disabled: true` while developing. Remove it or set it to `false` only when the manifest is ready to appear in CKBuilder's plugin catalog.
5. Run `npm run plugins:check` and `npm run test:v6` before contributing it.

The reference schema is `plugins/plugin-manifest.schema.json`.

## Runtime trust rules

Plugins are disabled by default in the Agent Workbench. CKBuilder discovers their tools using MCP `tools/list` only after the user enables the plugin.

A remote tool can run automatically only when its MCP metadata explicitly marks it read-only (`annotations.readOnlyHint: true`) and not destructive. Unannotated or non-read-only tools stop at a one-run approval boundary. Tool names associated with signing, transaction broadcast, private keys, mnemonics, or seeds are hard-blocked even after approval.

AI-provider API keys are never passed to MCP plugins. Every executed or rejected tool call is recorded in the agent's tool audit trace.
