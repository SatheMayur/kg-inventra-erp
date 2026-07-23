# KG-Inventra Incident Report: Repository Drift and `crypto.randomUUID` Crash

Date: 2026-07-23

## Incident summary

The production app at:

```text
http://172.16.45.125/kg-inventra
```

was crashing in the Purchase Order Process / Daily Procurement flow with:

```text
crypto.randomUUID is not a function
```

The same flow worked locally at:

```text
http://localhost:3084
```

## Impact

Users accessing the production app over HTTP could not use the affected procurement screen. Local development appeared healthy, which initially made the issue look like a browser/cache problem.

## Root cause

Two GitHub repositories existed for the project:

```text
https://github.com/SatheMayur/kg-inventra-erp
https://github.com/aiops-arch/kg-inventra
```

Fixes were being pushed to `SatheMayur/kg-inventra-erp`, while the server's CI/CD pipeline was actually building and deploying from `aiops-arch/kg-inventra`.

The repositories had silently diverged. The browser crypto fallback fix existed in the personal/reference repository but was missing from the production deployment repository.

## Technical cause

The production app is served over non-secure HTTP:

```text
http://172.16.45.125/kg-inventra
```

In that context, some browsers expose `crypto` but do not provide `crypto.randomUUID`. The old production bundle contained a direct call:

```js
key: crypto.randomUUID()
```

That caused the client-side crash.

The fixed implementation guards `crypto.randomUUID` and falls back to `crypto.getRandomValues` or `Math.random` when needed.

## Diagnosis

The issue was confirmed by comparing:

- local dev bundle from `localhost:3084`
- live production bundle from `172.16.45.125`
- Git remotes used by local checkouts
- server deployment behavior

The live server was still serving an older JavaScript bundle, while the local build contained the guarded fallback.

## Resolution applied

The missing browser crypto fallback commits were applied to the production deployment repository:

```text
aiops-arch/kg-inventra
```

The self-hosted runner rebuilt the app and restarted the container.

Live verification after restart:

```text
http://172.16.45.125/api/health
HTTP 200
```

Container uptime reset, confirming the deployment restarted.

## Lessons learned

The main failure was not the JavaScript fix itself. The failure was repository drift: development and deployment were happening from different Git remotes.

Going forward, `aiops-arch/kg-inventra` must be treated as the production source-of-truth.

## Follow-up actions

Immediate:

- Switch local development to push directly to `aiops-arch/kg-inventra`.
- Mark `SatheMayur/kg-inventra-erp` as legacy/reference only, or archive it.

Short term:

- Add a drift check comparing local `main`, production repo `main`, and deployed commit.
- Document the deployment model in the repository.

Medium term:

- Rotate any exposed `.env` secrets touched during diagnosis.
- Review Traefik passthrough routing for `/_next` and `/api` before adding another Next.js app to the same host.

Platform-level:

- Surface "last deployed commit vs current repo commit" in the deployment dashboard/chat UI to prevent this class of incident from recurring.
