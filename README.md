# huynle.com

Source for [huynle.com](https://huynle.com): a static [Astro](https://astro.build) site with a short **Now**
snapshot, **Projects**, and **Writing**.

- Posts are written in this repo (`src/content/posts/`) and published by merging a PR to `main`.
- `src/content/projects/` and `src/content/now.md` are generated from Brain by a reviewed sync PR.
- Merging to `main` builds an immutable container image (`ghcr.io/huynle/huynle.com`) that Flux rolls out.

## Develop

Node 22.22+ and npm 11.

```sh
npm ci
npm run dev           # http://localhost:4321 (drafts visible)
npm run check         # astro check (types + content schemas)
npm test              # vitest
npm run build         # static site in dist/ (drafts excluded)
npm run verify:dist   # fail on draft slugs, private IPs, *.ts.net, emails, token-like strings in dist/
npm run check:links   # offline internal link check over dist/
```

Container (nginx-unprivileged on :8080, `/healthz`, custom 404, `/index.xml` → `/rss.xml`):

```sh
docker build -t huynle-site . && docker run --rm -p 8080:8080 huynle-site
```

## Content

| Collection | Location | Source |
|---|---|---|
| `posts` | `src/content/posts/*.md(x)` | written here; `draft: true` keeps a post out of production |
| `projects` | `src/content/projects/*.md` | generated from Brain (`public,site-project`); `brainId` is never rendered |
| `now` | `src/content/now.md` | generated from Brain (`public,site-now`) |

The two `sample-*` projects and the Now text are placeholders until the first Brain export.

## Workflows

- `ci.yml` (PRs and non-main pushes, self-hosted `amos` runner): check, test, build, `verify:dist`, link check, and a
  `docker build` with a container smoke test.
- `release.yml` (push to `main`, manual): `huynle/.github` `container-release.yml@v1` publishes
  `ghcr.io/huynle/huynle.com` with immutable `git-<UTC>-<sha>` and `sha-<sha>` tags.
