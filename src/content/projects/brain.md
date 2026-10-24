---
title: "Brain"
status: active
summary: "Brain is my long-term memory and work queue, shared with the AI agents I work with. It holds notes, plans, decisions and tasks, and it runs the work."
links:
  - label: "Source"
    url: "https://github.com/huynle/brain"
updated: 2026-10-23
brainId: "aiw9q8j0"
---

Agents save what they learn as typed entries (decisions, plans, quirks, reports) that link to each other, so a later session can pick up where the last one stopped. Entries are searchable by full text and by meaning, and they can carry attachments such as screenshots and PDFs.

The same service tracks tasks with dependencies, groups them into features, and hands them to runners that execute each task with a coding agent in its own git worktree. Automations, schedules, calendar triggers and reminders start work without me having to ask.

It's a Go service on SQLite, with a REST API, an MCP interface for agents, a typed SDK, a terminal UI and a small web app. Right now I'm moving all storage into the database and adding separate, isolated spaces so I can invite a few other people to use it.
