# dsh-farm 🚜

DSH service farm plugin: register, start, stop, restart and watch long-running
project services — the agent can do it through tools, you can do it through the
web UI.

## Install

```sh
dsh plugin --profile <name> add /path/to/dsh-farm
```

Restart the DSH web surface afterwards.

## What you get

- **UI**: a 🚜 button at the sidebar foot with a running-services badge;
  clicking it opens the overview drawer — services grouped by workspace with
  status dots, start/stop/restart buttons, and a log view with live follow
  (SSE), substring search and download/export. With
  [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
  installed the same panel becomes a **Farm** tab in that sidebar instead —
  see [Where the UI lives](#where-the-ui-lives).
- **Delete**: 🗑 on a row removes that one service. `☑ select` switches the
  drawer into multi-select — tick rows (or *select all*), then *delete (n)*
  opens a confirmation dialog listing the targets; nothing is deleted until
  you confirm it. `farm.yaml` services are greyed out in both paths: the file
  owns them, so you remove them by editing it.
- **Agent tools**: `farm_status` / `farm_start` / `farm_stop` /
  `farm_restart` / `farm_logs(service, tail, search)` /
  `farm_register(name, workspace, command, ...)` /
  `farm_unregister(service | services)`. Say "帮我把 dev server
  注册到 farm 并启动" in a session and the agent does the rest.
- **farm.yaml** (optional, per workspace, commit-friendly):

  ```yaml
  services:
    dev-server:
      command: pnpm dev
      # cwd: sub/dir        # optional, resolved against the workspace
      autoRestart: true
      env:
        PORT: 5173
  ```

  Declared services appear in the UI and `farm_status` automatically
  (`source: yaml`); the file is always the source of truth.

## Where the UI lives

dsh-farm renders its panel in whichever home is available, decided at runtime:

| DSH-better-sidebar | Where the panel appears |
|---|---|
| installed | a **🚜 Farm** tab in better-sidebar (single-instance, with a running-count badge); dsh-farm's own footer button and drawer stand down |
| not installed | dsh-farm's own 🚜 footer button + right-hand drawer |

Nothing to configure, and better-sidebar is not a dependency — dsh-farm looks
the service up by name at runtime and keeps working when it is absent. It also
follows better-sidebar being enabled or disabled while DSH is running, in both
directions.

> Implementation note for anyone extending this: `betterSidebar` is
> deliberately **not** in the client half's `inject`. In DSH's cordis a
> declared-but-missing service parks the whole plugin, which would take the
> fallback UI down with it — the plugin would vanish entirely rather than fall
> back. The runtime's optional-lookup hook is `ctx.get('betterSidebar')`
> (undefined when absent), and `ctx.on('internal/service', …)` catches
> better-sidebar arriving or leaving later. That event can fire more than once
> for the same arrival, so registration is idempotent.

## Behavior notes

- Services are spawned as children of the DSH process (`/bin/sh -c`), so they
  are reclaimed when DSH exits. Dynamic registrations persist across restarts
  in `$DSH_HOME/storages/dsh-farm/services.json` (state does not).
- Stop = SIGTERM, then SIGKILL after a 3s grace.
- `autoRestart` retries an abnormal exit up to 5 times with exponential
  backoff (1s → 16s).
- Logs: 5000-line in-memory ring per service plus an append-only file under
  `$DSH_HOME/storages/dsh-farm/logs/<id>.log`.
- Deleting a service stops it first, then drops its registry row, its live log
  stream and its log file. Ids are derived from `workspace + name`, so this
  keeps a later re-registration of the same name from inheriting stale logs.
  Project files are never touched.

## HTTP API (localhost only, prefix `/farm`)

| Route | Meaning |
|---|---|
| `GET /farm/services?workspace=` | list (farm.yaml entries merged in) |
| `POST /farm/services` | register/update a dynamic service |
| `GET /farm/services/:id` | one service |
| `DELETE /farm/services/:id` | unregister one (stops it first; 400 for `farm.yaml` services) |
| `POST /farm/services/batch-delete` | unregister many — `{ ids: [] }` → `{ ok, deleted, failed }` |
| `POST /farm/services/:id/start\|stop\|restart` | lifecycle |
| `GET /farm/services/:id/logs?tail=&search=&export=1` | logs, `export=1` downloads |
| `GET /farm/services/:id/logs/stream` | SSE live follow |

## Config (override in the profile patch)

```yaml
- id: farm
  config:
    dataDir: /abs/path   # default $DSH_HOME/storages/dsh-farm
    ringLines: 5000
    stopGraceMs: 3000
```
