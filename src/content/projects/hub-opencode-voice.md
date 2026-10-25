---
title: "Hub (OpenCode Voice)"
status: active
summary: "Hub is one place my coding-agent harnesses connect to, starting with OpenCode. From my phone I can follow sessions, approve permissions and talk to the agents by voice."
links:
  - label: "Source"
    url: "https://github.com/huynle/hub"
updated: 2026-10-24
brainId: "pzhry3n9"
---

Each OpenCode process loads a small plugin that connects out to the hub, so sessions from any of my machines show up together. The phone web app shows a live timeline of each session, including subagents, sends push notifications when work finishes or needs a decision, and lets me answer permission prompts.

Voice mode turns speech into prompts and reads short replies back. A fast model handles the conversation and hands bigger jobs to a stronger model running as background subagents.

It's TypeScript on Bun with a SolidJS web app, released as an npm package, standalone binaries and a container image. It started as an OpenCode voice plugin and was renamed Hub once it grew past voice. Next up is a native Android companion so voice keeps working with the screen off, for example while driving; it's designed and planned as a series of small milestones.

## Moved 2026-10-24
Hub's canonical Brain project is now `hub`. Current architecture: walkthrough s9et6nt9 'Architecture: hub' (project hub). The agent control plane design is private (repo huynle/hub-plans).
