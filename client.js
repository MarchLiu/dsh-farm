/**
 * dsh-farm — browser half.
 *
 * A hand-written module-table bundle: executes by registering its factory with
 * window.__ModuleLoader__; the factory's exports are the client plugin.
 *
 * UI:
 *  - sidebar.footer.action → 🚜 button with a running-services badge
 *  - shell.overlay         → overview drawer grouped by workspace with
 *                            start/stop/restart, log follow (SSE), search
 *                            and export
 *
 * No imports: `require` resolves the platform seed table (react).
 */
window.__ModuleLoader__.load({ id: 'dsh-farm', factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports
  const React = require('react')

  // ── tiny shared store ───────────────────────────────────────────────────
  const store = {
    open: false,
    services: [],
    loaded: false,
    error: undefined,
    logView: undefined, // { id, name, lines: [], following, search, es }
    listeners: new Set(),
    emit() { for (const fn of [...this.listeners]) { try { fn() } catch {} } },
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) },
  }

  const useFarm = () => {
    const [, force] = React.useReducer((n) => n + 1, 0)
    React.useEffect(() => store.subscribe(force), [])
  }

  const refresh = async () => {
    try {
      const res = await fetch('/farm/services')
      const body = await res.json()
      store.services = body.services || []
      store.loaded = true
      store.error = undefined
    } catch (err) {
      store.error = String(err)
    }
    store.emit()
  }

  const act = async (svc, action) => {
    await fetch(`/farm/services/${svc.id}/${action}`, { method: 'POST' })
    setTimeout(refresh, 300)
  }

  // ── shared styles (theme variables only) ────────────────────────────────
  const CSS = `
.dshfarm-badge{position:relative;display:inline-flex;align-items:center;justify-content:center}
.dshfarm-dot{position:absolute;top:-2px;right:-4px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;
  background:var(--dsw-alias-accent-brand,#4c7dff);color:var(--dsw-alias-label-on-accent,#fff);
  font-size:10px;line-height:14px;text-align:center;font-weight:600}
.dshfarm-drawer{position:fixed;top:0;right:0;bottom:0;width:460px;max-width:92vw;z-index:10000;
  display:flex;flex-direction:column;pointer-events:auto;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  border-left:1px solid var(--dsw-alias-border-secondary,#8884);box-shadow:-8px 0 24px #0003}
.dshfarm-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-secondary,#8884)}
.dshfarm-title{font-size:14px;font-weight:600;flex:1}
.dshfarm-btn{border:1px solid var(--dsw-alias-border-secondary,#8884);background:transparent;
  color:inherit;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer}
.dshfarm-btn:hover{background:var(--dsw-alias-bg-layer-2,#8881)}
.dshfarm-body{flex:1;overflow-y:auto;padding:8px 12px 16px}
.dshfarm-ws{margin:10px 0 4px;font-size:11px;opacity:.65;word-break:break-all;text-transform:uppercase;letter-spacing:.04em}
.dshfarm-svc{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-secondary,#8882);margin-bottom:6px}
.dshfarm-svc-main{flex:1;min-width:0}
.dshfarm-svc-name{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
.dshfarm-svc-cmd{font-size:11px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,monospace}
.dshfarm-src{font-size:10px;padding:0 4px;border-radius:4px;border:1px solid var(--dsw-alias-border-secondary,#8884);opacity:.7}
.dshfarm-st{width:8px;height:8px;border-radius:4px;flex:none}
.st-running,.st-starting{background:#34c759}.st-unhealthy{background:#ff9f0a}
.st-stopped{background:#98989d}.st-exited{background:#ff9f0a}.st-failed,.st-stopping{background:#ff453a}
.dshfarm-search{width:100%;box-sizing:border-box;margin:8px 0;padding:6px 8px;border-radius:6px;font-size:12px;
  border:1px solid var(--dsw-alias-border-secondary,#8884);background:var(--dsw-alias-bg-layer-2,#8881);color:inherit}
.dshfarm-log{flex:1;overflow:auto;background:var(--dsw-alias-bg-layer-2,#8881);border-radius:8px;padding:8px;
  font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.dshfarm-log .dshfarm-stderr{color:var(--dsw-alias-label-danger,#ff453a)}
.dshfarm-log .dshfarm-meta{opacity:.55}
.dshfarm-empty{opacity:.55;font-size:12px;text-align:center;padding:24px 0}
`
  const styleInjected = { value: false }
  const ensureStyles = () => {
    if (styleInjected.value) return
    styleInjected.value = true
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-farm'
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  const STATUS_DOT = { r: (svc) => React.createElement('span', { className: `dshfarm-st st-${svc.status}`, title: svc.status }) }

  const runningCount = () => store.services.filter((s) => ['running', 'starting', 'unhealthy'].includes(s.status)).length

  // ── sidebar footer button ───────────────────────────────────────────────
  const FarmButton = (props) => {
    useFarm()
    ensureStyles()
    React.useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [])
    const n = runningCount()
    const wide = props && props.wide
    return React.createElement('button', {
      className: 'dshfarm-badge dshfarm-btn',
      style: { border: 'none', fontSize: wide ? 13 : 16, padding: wide ? '4px 8px' : 6, position: 'relative' },
      title: 'dsh-farm services',
      onClick: () => { store.open = !store.open; refresh(); store.emit() },
    },
      '🚜',
      n > 0 ? React.createElement('span', { className: 'dshfarm-dot' }, String(n)) : null,
    )
  }

  // ── log panel (second level inside the drawer) ──────────────────────────
  const LogPanel = () => {
    useFarm()
    const lv = store.logView
    const logRef = React.useRef(null)
    React.useEffect(() => {
      if (lv && lv.following && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
    if (!lv) return null
    const close = () => {
      if (lv.es) lv.es.close()
      store.logView = undefined
      store.emit()
    }
    const doSearch = async (e) => {
      if (e.key !== 'Enter') return
      const q = e.target.value
      const res = await fetch(`/farm/services/${lv.id}/logs?tail=2000&search=${encodeURIComponent(q)}`)
      const body = await res.json()
      lv.search = q
      lv.lines = body.lines || []
      lv.detached = true
      store.emit()
    }
    const toggleFollow = () => {
      if (lv.es) { lv.es.close(); lv.es = undefined; lv.following = false }
      else {
        lv.following = true
        lv.lines = []
        lv.detached = false
        const es = new EventSource(`/farm/services/${lv.id}/logs/stream`)
        es.onmessage = (ev) => {
          try {
            const entry = JSON.parse(ev.data)
            lv.lines.push(entry)
            if (lv.lines.length > 5000) lv.lines.splice(0, lv.lines.length - 5000)
            store.emit()
          } catch {}
        }
        es.onerror = () => { lv.following = false; store.emit() }
        lv.es = es
      }
      store.emit()
    }
    const doExport = async () => {
      const res = await fetch(`/farm/services/${lv.id}/logs?export=1`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `farm-${lv.name}.log`
      a.click()
      URL.revokeObjectURL(a.href)
    }
    const cls = (e) => e.stream === 'stderr' ? 'dshfarm-stderr' : e.stream === 'meta' ? 'dshfarm-meta' : undefined
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'dshfarm-head' },
        React.createElement('button', { className: 'dshfarm-btn', onClick: close }, '←'),
        React.createElement('span', { className: 'dshfarm-title' }, `logs · ${lv.name}`),
        React.createElement('button', { className: 'dshfarm-btn', onClick: toggleFollow },
          lv.es ? '⏸ stop follow' : '▶ follow'),
        React.createElement('button', { className: 'dshfarm-btn', onClick: doExport }, 'export'),
      ),
      React.createElement('div', { style: { padding: '0 12px' } },
        React.createElement('input', {
          className: 'dshfarm-search', placeholder: 'search in live ring buffer… (Enter)',
          defaultValue: lv.search || '', onKeyDown: doSearch,
        }),
      ),
      React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', padding: '0 12px 12px', minHeight: 0 } },
        React.createElement('div', { className: 'dshfarm-log', ref: logRef },
          lv.lines.length === 0
            ? React.createElement('div', { className: 'dshfarm-empty' },
                lv.detached ? 'no matching lines in the live buffer' : 'waiting for output… press ▶ follow to stream live logs')
            : lv.lines.map((e, i) => React.createElement('div', { key: i, className: cls(e) },
                `${new Date(e.at).toISOString().slice(11, 19)} ${e.text}`)),
        ),
      ),
    )
  }

  // ── overview drawer ─────────────────────────────────────────────────────
  const Overview = () => {
    useFarm()
    // Esc closes (log panel first, then the drawer); one shared key handler.
    React.useEffect(() => {
      if (!store.open) return
      const onKey = (e) => {
        if (e.key !== 'Escape') return
        if (store.logView) {
          if (store.logView.es) store.logView.es.close()
          store.logView = undefined
        } else {
          store.open = false
        }
        store.emit()
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [store.open])
    if (!store.open) return null
    const closeAll = () => {
      if (store.logView && store.logView.es) store.logView.es.close()
      store.logView = undefined
      store.open = false
      store.emit()
    }
    const byWs = new Map()
    for (const svc of store.services) {
      if (!byWs.has(svc.workspace)) byWs.set(svc.workspace, [])
      byWs.get(svc.workspace).push(svc)
    }
    const groups = [...byWs.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const close = () => { store.open = false; store.emit() }
    return React.createElement(React.Fragment, null,
      // Invisible click-catcher under the drawer: clicking anywhere outside
      // closes it, and it keeps the click from reaching the UI underneath.
      React.createElement('div', {
        style: { position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto' },
        onClick: closeAll,
      }),
      React.createElement('div', { className: 'dshfarm-drawer', style: { pointerEvents: 'auto' } },
      React.createElement('div', { className: 'dshfarm-head' },
        React.createElement('span', { className: 'dshfarm-title' }, '🚜 dsh-farm · services'),
        React.createElement('button', { className: 'dshfarm-btn', onClick: refresh }, '↻ refresh'),
        React.createElement('button', { className: 'dshfarm-btn', onClick: close }, '✕'),
      ),
      React.createElement('div', { className: 'dshfarm-body' },
        store.error ? React.createElement('div', { className: 'dshfarm-empty' }, `error: ${store.error}`) : null,
        !store.error && groups.length === 0
          ? React.createElement('div', { className: 'dshfarm-empty' },
              store.loaded ? 'no services yet — ask the agent to register one (farm_register) or add a farm.yaml' : 'loading…')
          : null,
        groups.map(([ws, svcs]) => React.createElement('div', { key: ws },
          React.createElement('div', { className: 'dshfarm-ws' }, ws),
          svcs.map((svc) => React.createElement('div', { className: 'dshfarm-svc', key: svc.id },
            STATUS_DOT.r(svc),
            React.createElement('div', { className: 'dshfarm-svc-main' },
              React.createElement('div', { className: 'dshfarm-svc-name' },
                svc.name,
                React.createElement('span', { className: 'dshfarm-src' }, svc.source),
                svc.pid ? React.createElement('span', { style: { fontSize: 10, opacity: 0.6 } }, `pid ${svc.pid}`) : null,
              ),
              React.createElement('div', { className: 'dshfarm-svc-cmd' }, svc.command),
            ),
            React.createElement('button', { className: 'dshfarm-btn', onClick: () => act(svc, 'start') }, 'start'),
            React.createElement('button', { className: 'dshfarm-btn', onClick: () => act(svc, 'stop') }, 'stop'),
            React.createElement('button', { className: 'dshfarm-btn', onClick: () => act(svc, 'restart') }, '↻'),
            React.createElement('button', {
              className: 'dshfarm-btn',
              onClick: () => {
                if (store.logView && store.logView.es) store.logView.es.close()
                store.logView = { id: svc.id, name: svc.name, lines: [], following: false, es: undefined, search: '' }
                store.emit()
              },
            }, 'logs'),
          )),
        )),
      ),
      store.logView ? React.createElement(LogPanel) : null,
      ),
    )
  }

  // ── plugin ──────────────────────────────────────────────────────────────
  module.exports = {
    inject: ['slots'],
    apply(ctx) {
      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'dsh-farm-button', order: 100, label: 'dsh-farm' },
        FarmButton,
      )), 'dsh-farm: footer button')

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'dsh-farm.overview', order: 100, label: 'dsh-farm overview' },
        Overview,
      )), 'dsh-farm: overview drawer')
    },
  }

  return module.exports
} })
