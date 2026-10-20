---
title: "Hello, new site"
date: 2026-10-20
summary: "huynle.com has been rebuilt from scratch: a small static site for what I'm doing now, what I'm building, and occasional writing."
tags: [meta, site]
---

This site has been rebuilt from scratch. The old one was a Hugo theme served straight out of my notes folder; it
worked, but publishing anything had become enough friction that I stopped doing it.

The new version is deliberately small:

- **Now** is a short snapshot of what I'm focused on.
- **Projects** lists the hardware and software I'm building, with a status for each.
- **Writing** is where longer notes end up.

## How it works

It's a static [Astro](https://astro.build) site. Posts are Markdown files in the site's repository, and merging a
pull request publishes them. The Now and Projects sections come from my own notes system, but only from entries I
explicitly mark as public, and only after I review the generated pull request.

```sh
npm run build   # static HTML in dist/
```

> Fewer moving parts, a review step before anything goes public, and one revert to roll back.

More soon.
