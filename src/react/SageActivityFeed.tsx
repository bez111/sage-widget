/**
 * <SageActivityFeed /> — drop-in React component rendering Sage's live
 * on-chain activity (settlements + issuances + transfers) directly,
 * NOT through an iframe. Use this when you want host-CSS-themable,
 * tree-shakeable, accessibility-friendly markup.
 *
 * If you instead want a CSS-isolated drop-in that doesn't care about
 * the host page's style, use the static iframe embed at
 *   https://www.ergoblockchain.org/agents.js
 * which mounts an isolated iframe.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
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

export interface SageActivityFeedProps extends SageWidgetOptions {
  /** Class name applied to the root container. */
  className?: string
  /** Inline style applied to the root container. */
  style?: CSSProperties
  /**
   * Render-prop override. If supplied, the component calls this with
   * the current response and renders only what it returns. Use this
   * to bring your own design system instead of the default styling.
   */
  children?: (state: {
    loading: boolean
    response: SageActivityResponse | null
    error: unknown
  }) => React.ReactNode
}

const ONE_MIN = 60_000

export function SageActivityFeed(props: SageActivityFeedProps): JSX.Element {
  const {
    apiBase,
    limit = DEFAULT_LIMIT,
    refreshMs = DEFAULT_REFRESH_MS,
    onUpdate,
    onError,
    className,
    style,
    children,
  } = props

  const [response, setResponse] = useState<SageActivityResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const onUpdateRef = useRef(onUpdate)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    let cancelled = false
    const abort = new AbortController()

    async function load() {
      try {
        const data = await fetchSageActivity({
          apiBase,
          limit,
          signal: abort.signal,
        })
        if (cancelled) return
        setResponse(data)
        setError(null)
        setLoading(false)
        onUpdateRef.current?.(data)
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === "AbortError") return
        setError(err)
        setLoading(false)
        ;(onErrorRef.current ?? console.warn)(err)
      }
    }

    load()
    const pollId =
      refreshMs > 0 ? setInterval(load, refreshMs) : undefined
    const tickId = setInterval(() => setNow(Date.now()), ONE_MIN / 4)
    return () => {
      cancelled = true
      abort.abort()
      if (pollId) clearInterval(pollId)
      clearInterval(tickId)
    }
  }, [apiBase, limit, refreshMs])

  if (children) {
    return <>{children({ loading, response, error })}</>
  }

  return (
    <div className={className} style={{ ...rootStyle, ...style }}>
      <Header network={response?.network ?? "testnet"} />
      <List
        loading={loading}
        events={response?.events ?? []}
        network={response?.network ?? "testnet"}
        apiBase={apiBase}
        now={now}
      />
      {error ? (
        <div style={errorStyle}>
          Could not reach the activity feed.
        </div>
      ) : null}
    </div>
  )
}

function Header({ network }: { network: "testnet" | "mainnet" }) {
  return (
    <div style={headerStyle}>
      <span style={dotStyle} />
      <span style={labelStyle}>Live · Ergo {network}</span>
      <a
        href="https://www.ergoblockchain.org/agent-economy#sage-activity"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        Sage on chain
      </a>
    </div>
  )
}

function List({
  loading,
  events,
  network,
  apiBase,
  now,
}: {
  loading: boolean
  events: SageActivityEvent[]
  network: "testnet" | "mainnet"
  apiBase?: string
  now: number
}) {
  if (loading) return <div style={emptyStyle}>Loading…</div>
  if (events.length === 0)
    return (
      <div style={emptyStyle}>
        No activity yet — be the first to ask Sage a paid query.
      </div>
    )
  return (
    <div>
      {events.map((evt) => (
        <Row key={evt.txId} evt={evt} network={network} apiBase={apiBase} now={now} />
      ))}
    </div>
  )
}

function Row({
  evt,
  network,
  apiBase,
  now,
}: {
  evt: SageActivityEvent
  network: "testnet" | "mainnet"
  apiBase?: string
  now: number
}) {
  const isSettle = evt.type === "settlement"
  const href = isSettle ? receiptUrl(evt.txId, apiBase) : explorerUrl(evt.txId, network)
  const amount = isSettle ? evt.paymentNanoErg ?? evt.inflowNanoErg : evt.inflowNanoErg
  const chipStyle = isSettle ? chipSettleStyle : chipIssueStyle
  const chipText = isSettle ? "Settled" : evt.type === "issuance" ? "Issued" : "Transfer"
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={rowStyle}
    >
      <span style={chipStyle}>{chipText}</span>
      <span style={metaStyle}>
        <span style={txStyle}>{evt.txId}</span>
        <span style={whenStyle}>
          block {evt.blockHeight.toLocaleString()} · {relativeTime(evt.timestamp, now)}
        </span>
      </span>
      <span style={amountStyle}>
        {nanoToErg(amount)} <span style={amountUnitStyle}>ERG</span>
      </span>
    </a>
  )
}

// ── Default inline styles (no CSS-in-JS dep, no class collisions on host) ──

const rootStyle: CSSProperties = {
  background: "#000",
  color: "#e5e7eb",
  fontFamily:
    "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.08)",
  boxSizing: "border-box",
  width: "100%",
  fontSize: 14,
  lineHeight: 1.4,
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
}

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#fb923c",
  flexShrink: 0,
}

const labelStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.25em",
  textTransform: "uppercase",
  color: "#fb923c",
}

const linkStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: 13,
  color: "#fed7aa",
  textDecoration: "none",
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
  borderTop: "1px solid rgba(255,255,255,.06)",
  textDecoration: "none",
  color: "inherit",
}

const chipBase: CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: 4,
  flexShrink: 0,
  border: "1px solid",
}

const chipSettleStyle: CSSProperties = {
  ...chipBase,
  borderColor: "rgba(251,146,60,.4)",
  color: "#fdba74",
  background: "rgba(251,146,60,.1)",
}

const chipIssueStyle: CSSProperties = {
  ...chipBase,
  borderColor: "rgba(245,158,11,.3)",
  color: "rgba(252,211,77,.8)",
  background: "rgba(245,158,11,.05)",
}

const metaStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
}

const txStyle: CSSProperties = {
  color: "#d1d5db",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const whenStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 10,
  marginTop: 1,
}

const amountStyle: CSSProperties = {
  color: "#fed7aa",
  fontSize: 12,
  flexShrink: 0,
  textAlign: "right",
}

const amountUnitStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 9,
  textTransform: "uppercase",
  marginLeft: 2,
}

const emptyStyle: CSSProperties = {
  padding: "18px 0",
  textAlign: "center",
  color: "#6b7280",
  fontSize: 11,
}

const errorStyle: CSSProperties = {
  ...emptyStyle,
  color: "#f87171",
}
