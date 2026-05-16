/**
 * mountSageFeed — framework-agnostic DOM mount for the Sage activity
 * feed. Imports cleanly into any non-React app (Svelte, Vue, plain HTML
 * with bundler, etc.). For React apps prefer the typed component at
 * `@ergoblockchain/sage-widget/react`.
 *
 * Usage:
 *
 *   import { mountSageFeed } from "@ergoblockchain/sage-widget/vanilla"
 *   const handle = mountSageFeed(document.getElementById("sage")!, {
 *     limit: 5,
 *     refreshMs: 60000,
 *   })
 *   // later: handle.destroy()
 *
 * No iframe, no shadow DOM — the markup is rendered into the target
 * element with inline styles. If you need style isolation, embed the
 * canonical iframe variant from `https://www.ergoblockchain.org/agents.js`.
 */

import {
  explorerUrl,
  fetchSageActivity,
  nanoToErg,
  receiptUrl,
  relativeTime,
} from "../api"
import {
  DEFAULT_LIMIT,
  DEFAULT_REFRESH_MS,
  type SageActivityEvent,
  type SageActivityResponse,
  type SageWidgetOptions,
} from "../types"

export interface MountSageFeedHandle {
  /** Trigger a fetch outside the polling interval (e.g. on user action). */
  refresh: () => Promise<void>
  /** Stop polling and remove all DOM the widget rendered. */
  destroy: () => void
  /** Most recent successful response, or null if none yet. */
  current: () => SageActivityResponse | null
}

export function mountSageFeed(
  target: Element,
  opts: SageWidgetOptions = {},
): MountSageFeedHandle {
  const apiBase = opts.apiBase
  const limit = opts.limit ?? DEFAULT_LIMIT
  const refreshMs = opts.refreshMs ?? DEFAULT_REFRESH_MS

  let cancelled = false
  let abort = new AbortController()
  let response: SageActivityResponse | null = null
  let pollId: ReturnType<typeof setInterval> | undefined
  let tickId: ReturnType<typeof setInterval> | undefined

  const root = document.createElement("div")
  root.setAttribute("data-sage-widget", "true")
  applyStyles(root, rootStyle)
  target.appendChild(root)

  function render() {
    root.innerHTML = ""
    const header = document.createElement("div")
    applyStyles(header, headerStyle)
    const dot = document.createElement("span")
    applyStyles(dot, dotStyle)
    const label = document.createElement("span")
    applyStyles(label, labelStyle)
    label.textContent = `Live · Ergo ${response?.network ?? "testnet"}`
    const link = document.createElement("a")
    link.href = "https://www.ergoblockchain.org/agent-economy#sage-activity"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.textContent = "Sage on chain"
    applyStyles(link, linkStyle)
    header.append(dot, label, link)
    root.appendChild(header)

    const list = document.createElement("div")
    const events = response?.events ?? []
    if (!response) {
      list.textContent = "Loading…"
      applyStyles(list, emptyStyle)
    } else if (events.length === 0) {
      list.textContent = "No activity yet — be the first to ask Sage a paid query."
      applyStyles(list, emptyStyle)
    } else {
      events.forEach((evt) => list.appendChild(renderRow(evt, response!.network, apiBase)))
    }
    root.appendChild(list)
  }

  function renderRow(
    evt: SageActivityEvent,
    network: "testnet" | "mainnet",
    base: string | undefined,
  ): HTMLAnchorElement {
    const isSettle = evt.type === "settlement"
    const a = document.createElement("a")
    a.href = isSettle ? receiptUrl(evt.txId, base) : explorerUrl(evt.txId, network)
    a.target = "_blank"
    a.rel = "noopener noreferrer"
    applyStyles(a, rowStyle)

    const chip = document.createElement("span")
    chip.textContent = isSettle
      ? "Settled"
      : evt.type === "issuance"
        ? "Issued"
        : "Transfer"
    applyStyles(chip, isSettle ? chipSettleStyle : chipIssueStyle)

    const meta = document.createElement("span")
    applyStyles(meta, metaStyle)
    const tx = document.createElement("span")
    tx.textContent = evt.txId
    applyStyles(tx, txStyle)
    const when = document.createElement("span")
    when.textContent = `block ${evt.blockHeight.toLocaleString()} · ${relativeTime(evt.timestamp)}`
    applyStyles(when, whenStyle)
    meta.append(tx, when)

    const amt = document.createElement("span")
    const value = isSettle ? evt.paymentNanoErg ?? evt.inflowNanoErg : evt.inflowNanoErg
    applyStyles(amt, amountStyle)
    const ergSpan = document.createElement("span")
    ergSpan.textContent = ` ERG`
    applyStyles(ergSpan, amountUnitStyle)
    amt.append(nanoToErg(value), ergSpan)

    a.append(chip, meta, amt)
    return a
  }

  async function load() {
    if (cancelled) return
    abort.abort()
    abort = new AbortController()
    try {
      const data = await fetchSageActivity({
        apiBase,
        limit,
        signal: abort.signal,
      })
      if (cancelled) return
      response = data
      render()
      opts.onUpdate?.(data)
    } catch (err) {
      if (cancelled || (err as { name?: string }).name === "AbortError") return
      ;(opts.onError ?? console.warn)(err)
    }
  }

  render()
  load()
  if (refreshMs > 0) pollId = setInterval(load, refreshMs)
  tickId = setInterval(render, 15_000)

  return {
    refresh: load,
    destroy() {
      cancelled = true
      abort.abort()
      if (pollId) clearInterval(pollId)
      if (tickId) clearInterval(tickId)
      root.remove()
    },
    current: () => response,
  }
}

function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles)
}

// ── Default inline styles, mirror of the React component ──

const rootStyle: Partial<CSSStyleDeclaration> = {
  background: "#000",
  color: "#e5e7eb",
  fontFamily:
    "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,.08)",
  boxSizing: "border-box",
  width: "100%",
  fontSize: "14px",
  lineHeight: "1.4",
}

const headerStyle: Partial<CSSStyleDeclaration> = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "10px",
}

const dotStyle: Partial<CSSStyleDeclaration> = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: "#fb923c",
  flexShrink: "0",
}

const labelStyle: Partial<CSSStyleDeclaration> = {
  fontSize: "10px",
  letterSpacing: "0.25em",
  textTransform: "uppercase",
  color: "#fb923c",
}

const linkStyle: Partial<CSSStyleDeclaration> = {
  marginLeft: "auto",
  fontSize: "13px",
  color: "#fed7aa",
  textDecoration: "none",
}

const rowStyle: Partial<CSSStyleDeclaration> = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "8px 0",
  borderTop: "1px solid rgba(255,255,255,.06)",
  textDecoration: "none",
  color: "inherit",
}

const chipSettleStyle: Partial<CSSStyleDeclaration> = {
  fontSize: "9px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: "4px",
  flexShrink: "0",
  border: "1px solid rgba(251,146,60,.4)",
  color: "#fdba74",
  background: "rgba(251,146,60,.1)",
}

const chipIssueStyle: Partial<CSSStyleDeclaration> = {
  fontSize: "9px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: "4px",
  flexShrink: "0",
  border: "1px solid rgba(245,158,11,.3)",
  color: "rgba(252,211,77,.8)",
  background: "rgba(245,158,11,.05)",
}

const metaStyle: Partial<CSSStyleDeclaration> = {
  flex: "1",
  minWidth: "0",
  display: "flex",
  flexDirection: "column",
}

const txStyle: Partial<CSSStyleDeclaration> = {
  color: "#d1d5db",
  fontSize: "11px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const whenStyle: Partial<CSSStyleDeclaration> = {
  color: "#6b7280",
  fontSize: "10px",
  marginTop: "1px",
}

const amountStyle: Partial<CSSStyleDeclaration> = {
  color: "#fed7aa",
  fontSize: "12px",
  flexShrink: "0",
  textAlign: "right",
}

const amountUnitStyle: Partial<CSSStyleDeclaration> = {
  color: "#6b7280",
  fontSize: "9px",
  textTransform: "uppercase",
  marginLeft: "2px",
}

const emptyStyle: Partial<CSSStyleDeclaration> = {
  padding: "18px 0",
  textAlign: "center",
  color: "#6b7280",
  fontSize: "11px",
}
