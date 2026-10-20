# huynle.com

Source for [huynle.com](https://huynle.com): a static [Astro](https://astro.build) site with a short **Now**
snapshot, **Projects**, and **Writing**.

- Posts are written in this repo (`src/content/posts/`) and published by merging a PR to `main`.
- `src/content/projects/` and `src/content/now.md` are generated from Brain by a reviewed sync PR.
- Merging to `main` builds an immutable container image (`ghcr.io/huynle/huynle.com`) that Flux rolls out.
