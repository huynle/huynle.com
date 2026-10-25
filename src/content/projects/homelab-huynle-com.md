---
title: "Homelab + huynle.com"
status: active
summary: "My homelab runs a k3s cluster managed by Flux, so every app ships the same way. This site is one of those apps, and its project cards are written in Brain."
links:
  - label: "Site source"
    url: "https://github.com/huynle/huynle.com"
updated: 2026-10-23
brainId: "p3ye2pq3"
---

A single Proxmox server hosts the virtual machines. Since October 2026 most services run on a single-node k3s cluster, and Flux keeps the cluster in sync with a Git repository, with secrets encrypted in the repo. That move replaced a set of hand-deployed Docker Compose apps.

The paved road for an app: a shared GitHub Actions workflow builds an immutable image, Flux picks up the new version, and the release is checked end to end. Backups are layered: VM snapshots, app-level database and file exports, and ZFS snapshots on a NAS, with a restore drill.

The site itself is a static Astro build. Every night a job reads the Brain entries I've marked public, checks them for anything private, and opens a pull request with the changes, which I review and merge like any other change.
