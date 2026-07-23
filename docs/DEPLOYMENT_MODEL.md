# KG-Inventra Deployment Model

Last updated: 2026-07-23

## Source of truth

The live KG-Inventra deployment is built from:

```text
https://github.com/aiops-arch/kg-inventra
```

This repository must be treated as the production source-of-truth.

## Legacy/reference repository

The following repository has also been used during development:

```text
https://github.com/SatheMayur/kg-inventra-erp
```

This repository is not the production deployment target. It should either be archived or clearly marked as legacy/reference only. Production fixes must not be pushed only to this repository.

## Deployment flow

1. Developer commits to `aiops-arch/kg-inventra` `main`.
2. The self-hosted runner triggers `deploy.yml`.
3. The runner builds the Docker image.
4. The KG-Inventra container is restarted.
5. Traefik routes `http://172.16.45.125/kg-inventra` to the internal `kg-inventra` service on port `3084`.

## Local development rule

Local development remotes should point to:

```text
origin  https://github.com/aiops-arch/kg-inventra.git
```

If a personal/reference repository is retained, it must not be used as the default push target for live fixes.

## Verification checklist

After every production fix:

```powershell
Invoke-WebRequest http://172.16.45.125/api/health -UseBasicParsing
```

Confirm:

- HTTP status is `200`.
- Container uptime recently reset after deploy.
- The live page loads at `http://172.16.45.125/kg-inventra`.
- The live JavaScript bundle does not contain the fixed bug pattern.

For the `crypto.randomUUID` incident, the old broken pattern was:

```js
key: crypto.randomUUID()
```

The fixed build must use a guarded fallback for non-secure HTTP contexts.

## Drift prevention

Add a lightweight drift check that compares:

- local `main` commit
- `aiops-arch/kg-inventra` `main` commit
- last deployed commit/container image label

Any mismatch should be surfaced before development continues.
