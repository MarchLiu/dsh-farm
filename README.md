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
  (SSE), substring search and download/export.
- **Agent tools**: `farm_status` / `farm_start` / `farm_stop` /
  `farm_restart` / `farm_logs(service, tail, search)` /
  `farm_register(name, workspace, command, ...)`. Say "帮我把 dev server
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

## Behavior notes

- Services are spawned as children of the DSH process (`/bin/sh -c`), so they
  are reclaimed when DSH exits. Dynamic registrations persist across restarts
  in `$DSH_HOME/storages/dsh-farm/services.json` (state does not).
- Stop = SIGTERM, then SIGKILL after a 3s grace.
- `autoRestart` retries an abnormal exit up to 5 times with exponential
  backoff (1s → 16s).
- Logs: 5000-line in-memory ring per service plus an append-only file under
  `$DSH_HOME/storages/dsh-farm/logs/<id>.log`.

## HTTP API (localhost only, prefix `/farm`)

| Route | Meaning |
|---|---|
| `GET /farm/services?workspace=` | list (farm.yaml entries merged in) |
| `POST /farm/services` | register/update a dynamic service |
| `GET /farm/services/:id` | one service |
| `DELETE /farm/services/:id` | unregister (stops if running) |
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
