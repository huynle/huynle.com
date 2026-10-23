---
title: "A paved road for my homelab"
date: 2026-10-23
summary: "How a merge to main becomes a running container at home: immutable image tags, Flux image automation writing pins into git, and rollback by revert. This site is the worked example."
tags: [homelab, gitops, kubernetes, site]
draft: true
---

For a long time, deploying something at home meant logging into a box, editing a compose file, and pulling an image
tagged `latest`. It worked until it didn't, and when it didn't, I had no record of what had been running before.

Most of my apps now run on a small k3s cluster, and Flux keeps the cluster in sync with a private infra repository.
On top of that I wanted a paved road: one boring, default way for an app to get from a merged pull request to
production, without me having to remember any steps.

## The road

1. I merge to `main` in the app's repository.
2. The app's own tests run. If they pass, a shared reusable workflow builds the image and pushes it to GitHub's
   container registry with two tags: `git-<UTC timestamp>-<short sha>` and `sha-<full sha>`. It also attaches build
   provenance and an SBOM.
3. In the infra repo, a Flux `ImagePolicy` watches the registry for new `git-*` tags. The timestamp makes them sort,
   so "newest" is well defined.
4. Flux image automation commits the new pin (repository, tag and digest) to the infra repo's `main`.
5. Flux reconciles that commit, and k3s rolls out the new version.

No Git tag or GitHub release is involved. Version tags are still useful for changelogs and downloadable binaries,
but they aren't part of deploying.

## Why immutable tags

`latest` names a moment, not an artifact. Two pulls of `latest` can give you two different images, and the cluster
can't tell you which one it's running.

The `git-` tag ties an image to a commit and sorts by build time. The digest is what actually gets deployed: the
workload renders `repository:tag@digest`, so if a tag were ever pushed again, the cluster would keep running the
exact bytes that were pinned. Nothing in production runs `latest`.

## What the automation is allowed to touch

Giving a bot write access to the repository that defines production needs limits. There are three.

**It's opt-in.** An app is only eligible for automatic promotion if its `ImagePolicy` has the label
`gitops.huynle.com/automation: enabled`. Without the label, the image is still built and published the same way,
but promoting it is a pull request I review. The stateful services, like Brain and the Supernote sync, start out
manual: a database migration doesn't roll back just because the image pin did.

**It only edits marked fields.** Flux uses the `Setters` strategy, which rewrites only fields that carry a marker
comment. Each app gets exactly three markers, one per field:

```yaml
image:
  repository: ghcr.io/huynle/example # {"$imagepolicy": "flux-system:example:name"}
  tag: git-20261014120000-abcdef0 # {"$imagepolicy": "flux-system:example:tag"}
  digest: sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # {"$imagepolicy": "flux-system:example:digest"}
```

A validation script in the infra repo rejects markers that are malformed, incomplete (a tag without a digest), or
on any other field. The automation is also scoped to the directory that holds the app definitions. So it can change
which image an app runs, and nothing else: not secrets, not access rules, not routes, not storage.

**The credentials are narrow.** An app's CI only has its own repository's token, which can push that app's package
and nothing more. It has no access to the infra repo. Flux's deploy key can write to the infra repo and nothing else.

## Rollback is git revert

Every automatic promotion is a commit in the infra repo that names the app, the tag and the digest. That history is
the deployment log, and reverting one of those commits puts the previous digest back.

There is one catch. If the automation is still running, it will notice that the newest tag isn't pinned anymore
and promote it again. So the documented rollback is: suspend the app's image policy, revert the pin commit, check
that the old version is healthy, and resume once the bad image is fixed or excluded.

Most failures before that point take care of themselves:

- A failed test or build means there is no new image.
- A tag that doesn't match the policy is never selected.
- If the automation fails, the old pin stays.
- If an infra revision doesn't render, Flux doesn't apply it.
- If a new pod never passes its readiness check, the rollout stalls and the old pods keep serving.

Stateful apps that redeploy by recreating their pod are the exception, which is another reason they start manual.

## Worked example: this site

Until a few days ago, huynle.com was a Hugo site running `hugo server` in production against a read-only mount of
a folder on my NAS. That folder was most of my personal notes, and what stayed private came down to draft flags and
ignore rules, with no review step in between. It needed a 3 GiB memory limit and some Go runtime tuning before
the build stopped getting killed, it depended on the NAS being up, and I hadn't published anything since December
2024.
It was also the last app in the cluster that wasn't on the paved road.

The replacement is an [Astro](https://astro.build) site, built into static files and served by unprivileged nginx.
Its source is a [public repository](https://github.com/huynle/huynle.com). Its release workflow calls the shared
build workflow on every merge to `main`, and its image policy carries the automation label.

The cutover went in four steps:

1. Onboard the new image with automation enabled, and route it to a staging hostname that only I can sign in to.
2. Merge a change to the site and watch it go through on its own: tests, image, a Flux commit in the infra repo,
   rollout. I didn't touch the infra repo for that part.
3. In one infra pull request, point huynle.com and www at the new release and remove the Hugo deployment and its
   NAS volume.
4. Check from outside: the home page and RSS feed load, the health endpoint answers, www redirects to the bare
   domain, and old URLs return 404 rather than anything from the old folder.

The site's memory budget went from 3 GiB to about 64 MiB, and it no longer cares whether the NAS is up. Rolling
back the whole cutover is a revert of that one pull request.

The Now and Projects sections use the same idea at a smaller scale. A nightly job exports entries I've marked
public in Brain, my notes and task system, into this repository as a pull request. Nothing reaches the site
without a merge, and the build never talks to Brain.

This post went the same way: a Markdown file, a pull request, a merge, and a few minutes later a Flux commit with a
new tag in it.

## What it costs

Onboarding an app is more work up front than writing a compose file. Each one needs an image repository, a
policy, the three markers, and a chart that can render the pin. I've kept that cost down with a shared chart for
simple web apps, but it's still several files in a pull request.

Automatic promotion is also only as good as the app's tests and readiness check. If a broken build passes both, it
ships. The answer there is better checks, and a revert when they miss something.

What I get for it: every deploy is a commit I can read, nothing in production has a mutable tag, and when something
breaks I know exactly what changed and how to undo it.
