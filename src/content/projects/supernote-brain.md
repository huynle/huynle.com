---
title: "Supernote ↔ Brain"
status: active
summary: "My handwritten notes on a Supernote Nomad e-ink tablet flow into Brain on their own, and a weekly brief flows back to the tablet for me to mark up."
links: []
updated: 2026-10-23
brainId: "81ukdmzk"
---

The tablet syncs to a self-hosted Supernote private cloud. A worker checks for changed notebooks on a timer and saves one Brain entry per page, with the page image attached and the notebook's folder path as tags. Pages are keyed by their stable page ID, so reordering or editing a notebook updates entries instead of duplicating them.

When the tablet's own handwriting recognition has already produced text, the worker uses it. Other pages wait as drafts until an agent reads the rendered page with a vision model and fills in the text, so the draft status in Brain doubles as the work queue.

In the other direction, an assistant agent builds a weekly brief from Brain and puts it on the device as a PDF to annotate. It's written in Python; ingest, the vision pass and the brief run as scheduled jobs on my homelab cluster, and an MCP server gives agents read, write and render access to the device files.
