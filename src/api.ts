/**
 * Thin client over /api/sage/activity.
 *
 * Pure fetch + shape — no rendering, no DOM. React + vanilla mounts
 * both call into here so the API contract lives in one place.
 */

import {
  DEFAULT_API_BASE,
  DEFAULT_LIMIT,
  type SageActivityResponse,
} from "./types"

export interface FetchActivityOptions {
  apiBase?: string
  limit?: number
  signal?: AbortSignal
}

export async function fetchSageActivity(
  opts: FetchActivityOptions = {},
): Promise<SageActivityResponse> {
  const base = opts.apiBase ?? DEFAULT_API_BASE
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 25)
  const url = `${base}/api/sage/activity?limit=${limit}`
  const res = await fetch(url, { signal: opts.signal })
  if (!res.ok) {
    throw new Error(`sage activity ${res.status}`)
  }
  return (await res.json()) as SageActivityResponse
}

/** nanoERG → "0.001" (trims trailing zeros, max 9 decimals). */
export function nanoToErg(nano: number | undefined): string {
  if (!nano || nano <= 0) return "0"
  const erg = nano / 1e9
  return erg.toFixed(9).replace(/\.?0+$/, "")
}

/** Cheap relative-time formatter, ASCII-only, no Intl deps. */
export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

/** Receipt URL for a settled tx, given the host base. */
export function receiptUrl(txId: string, apiBase: string = DEFAULT_API_BASE): string {
  return `${apiBase}/r/sage/${txId}`
}

/** Explorer URL for a tx on the given network. */
export function explorerUrl(
  txId: string,
  network: "testnet" | "mainnet" = "testnet",
): string {
  return network === "testnet"
    ? `https://testnet.ergoplatform.com/transactions/${txId}`
    : `https://explorer.ergoplatform.com/transactions/${txId}`
}
