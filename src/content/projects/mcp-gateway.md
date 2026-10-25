---
title: "MCP Gateway"
status: active
summary: "One gateway in front of all the MCP tools my AI agents use. Agents sign in once, and the gateway decides per call what is allowed, what needs my approval, and what gets recorded."
links:
  - label: "Source"
    url: "https://github.com/huynle/mcp-gateway"
updated: 2026-10-23
brainId: "2vlk5wne"
---

Instead of giving every agent credentials for every service, agents connect to the gateway over OAuth. The gateway holds the connections to services such as GitHub, Slack, Google Workspace, Atlassian and Microsoft 365, and exposes them as tools. It can also front MCP servers running on my own machines through an outbound tunnel, so local tools sit next to hosted ones.

Every call goes through a policy check. A tool can be allowed, hidden, denied, or set to ask first, in which case I approve it in a web portal or in Slack before it runs. Each call lands in an audit log and an operations ledger, so repeated or uncertain calls can be reconciled instead of silently run twice.

It's a single Go service on PostgreSQL, packaged with Helm. It's my everyday entry point for MCP tools, and I'm preparing it for other users.
