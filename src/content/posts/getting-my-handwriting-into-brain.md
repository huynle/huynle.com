---
title: "Getting my handwriting into Brain"
date: 2026-10-23
summary: "Notes from a Supernote Nomad sync to a server I run, land in Brain one page at a time, get read by embedded text or a vision model, and come back as a weekly brief. What works, and what doesn't yet."
tags: [supernote, brain, homelab, ai-agents]
draft: true
---

I think better on paper, and I write most of my rough notes on a Supernote Nomad, an e-ink tablet with a stylus.
The rest of my notes, plans and decisions live in Brain, the notes and task system my coding agents also read and
write. For a long time those were two separate worlds. A page I wrote on the Nomad was invisible to everything
else unless I retyped it.

This is how I'm connecting them.

## Sync to a server I run

The Nomad can sync to Supernote's own cloud or to a private server. I run the open-source
[supernote](https://github.com/allenporter/supernote) server on my homelab, with a few patches for protocol
details my device needed. The tablet syncs to it on its own, the same way it would to the official service, and I
didn't have to change how I use the device.

Everything after that point works from the server's copy of my files, never from the tablet directly.

## One page, one entry

A worker runs on a timer. It walks the file listing and compares each file's checksum and size with what it saw
last time. Unchanged files are skipped before anything is downloaded, which matters once the scope is "every
notebook" and not one inbox folder.

Anything in my Private folder is never downloaded at all. I tested the device's password protection first and it
isn't something I'd rely on to keep a page out of the pipeline, so the rule is a folder, matched strictly, and the
worker fails loudly if something about it looks wrong.

Each changed page becomes one Brain entry. The page's identity is the ID the device gives it, which stays the same
when I edit the page or reorder the notebook. Its version is a hash over the page's ink layers, so editing page 3
doesn't make pages 4 through 40 look new. The rendered PNG is attached to the entry.

Folders become tags, so a page in `recipes/thai` is tagged with both `recipes` and `recipes/thai`. Keywords, page
templates and stars become secondary tags. The folder is the main one because it costs nothing to add, it's
known before a file is downloaded, and I can change it later by moving the file.

I briefly designed a command vocabulary: write `!todo` in a corner and the system would act on it. I dropped it.
Every page gets read in full anyway, so a marker that says "read this" buys nothing. Markers index, they don't
command. (Stickers were out from the start. On the device they're indistinguishable from ink.)

## Embedded text first, vision for the rest

Reading a page happens in two tiers.

**Embedded text.** If real-time recognition is turned on for a notebook, the Nomad stores the recognized text in
the file itself. The worker extracts it with an existing parser library. It's free, deterministic, and good. It
also covers only 9 of my 35 notebooks.

**Vision.** Every other page goes into Brain as a draft with its image attached. An agent with a vision-capable
model reads the image, writes the transcription into the entry, checkboxes included, and marks it active. I use models I already have a subscription for, not a paid OCR API.

The queue is Brain itself. A page that still needs reading is an entry with status `draft`. Once it's read, it's
`active`. There's no separate queue to keep in sync, and I can see the backlog in the same UI where everything else
lives.

The agent works through drafts on a schedule, in small batches. I considered triggering it on every new entry
instead, but Brain's event delivery is in-memory and drops events when a subscriber falls behind. A burst of a few
hundred pages from a backlog would lose work without an error. A scheduled sweep is slower and can't lose anything.

## The weekly brief

Getting notes in is half of it. The other half is a weekly brief: a short PDF, built from what's in Brain, that
covers the week that just ended and the one ahead. It's laid out for the Nomad's A6 screen, with large type, pure
black on white (greys dither badly on e-ink), a bounded page count, and blank ruled space to write in.

It's a PDF and not a native Supernote notebook because the notebook format is proprietary and changes between
firmware versions. PDFs are stable, and when I write on one, the device stores my ink in a separate annotation
file next to it and leaves the PDF untouched. That's what makes a return path possible: the next sync picks up the
annotation file, and my handwritten replies to the brief can go back into Brain the same way pages do.

## Where it stands

Being honest about the state of things:

- Sync, the timed worker, the private-folder exclusion, page identity, and embedded-text extraction are running.
- Pages, digests and to-dos land in Brain as entries with images attached.
- The brief generator works, and it has produced a real brief from Brain content. I'm still checking the layout on
  the device itself.
- The scheduled vision sweep isn't running unattended yet, so the backlog of a few hundred older pages is still
  mostly drafts.
- Reading annotations back from the brief is designed but not done.

The part I'm happiest with is that nothing here depends on me changing how I write. I write on the tablet the way
I did before. The pages show up in the same place as everything else I know, and an agent looking for context can
find a note I wrote by hand last week.
