/**
 * Public types — mirror of /api/sage/activity response shape.
 *
 * The source of truth is the API at https://www.ergoblockchain.org/api/sage/activity;
 * this file re-states the schema so consumers don't have to depend on the
 * server-side fetcher.
 */

export type SageActivityType = "settlement" | "issuance" | "transfer"

export interface SageActivityEvent {
  /** 64-char hex transaction id. */
  txId: string
  /** Block height at inclusion. */
  blockHeight: number
  /** Block timestamp (ms epoch). */
  timestamp: number
  /** Heuristic classification of the tx. */
  type: SageActivityType
  /** nanoERG flowing into the seller wallet from this tx (sum of outputs). */
  inflowNanoErg: number
  /**
   * For settlements: value of the redeemed Note (= what the buyer paid).
   * For other event types: undefined.
   *
   * Use this — not `inflowNanoErg` — when displaying "amount paid for a
   * settled query". `inflowNanoErg` includes change boxes in test setups
   * where the buyer and seller share an address.
   */
  paymentNanoErg?: number
  /** First input box that carries Note-shape registers, if any. */
  noteBoxId?: string
}

export interface SageActivityResponse {
  ok: boolean
  network: "testnet" | "mainnet"
  /** Sage seller wallet address. */
  receiver: string
  /** Total number of txs ever touching the wallet, per the explorer. */
  total: number
  events: SageActivityEvent[]
  error?: string
}

/**
 * Configuration accepted by every entry point (React component +
 * vanilla mount fn). Defaults below are sensible for the canonical
 * ergoblockchain.org deployment.
 */
export interface SageWidgetOptions {
  /**
   * Base URL of the Sage host. Override if you run your own Sage
   * deployment behind a custom domain. Default: ergoblockchain.org.
   */
  apiBase?: string
  /**
   * Number of events to display (max 25). Default: 5.
   */
  limit?: number
  /**
   * Polling interval in ms. Default: 60000 (60s). Set to 0 to disable
   * polling — the widget will fetch once on mount and never refresh.
   */
  refreshMs?: number
  /**
   * Optional callback fired every time a fresh response arrives. Useful
   * for analytics or for triggering host-side animations on new
   * settlements.
   */
  onUpdate?: (response: SageActivityResponse) => void
  /**
   * Optional callback fired on fetch errors. Default: console.warn.
   */
  onError?: (error: unknown) => void
}

export const DEFAULT_API_BASE = "https://www.ergoblockchain.org"
export const DEFAULT_LIMIT = 5
export const DEFAULT_REFRESH_MS = 60_000
