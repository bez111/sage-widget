/**
 * Thin client over /api/sage/activity.
 *
 * Pure fetch + shape — no rendering, no DOM. React + vanilla mounts
 * both call into here so the API contract lives in one place.
 */

import {
  DEFAULT_API_BASE,
  DEFAULT_LIMIT,
  type SageChatMessage,
  type SageChatStreamEvent,
  type SageChatStreamResult,
  type SagePaymentIntent,
  type SagePaymentNetwork,
  type SageQuote,
  type SageQuoteResponse,
  type SageReceiptBundle,
  type SageTenantConfig,
  type SageVerifyPaymentResponse,
  type SageActivityResponse,
} from "./types"

export interface FetchActivityOptions {
  apiBase?: string
  limit?: number
  signal?: AbortSignal
}

export interface SageRequestOptions {
  apiBase?: string
  tenant?: SageTenantConfig
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface FetchSageQuoteOptions extends SageRequestOptions {
  question: string
  history?: SageChatMessage[]
}

export interface VerifySagePaymentOptions extends SageRequestOptions {
  quote: SageQuote
  question: string
  noteBoxId: string
}

export interface CreateSagePaymentIntentOptions {
  quote: SageQuote
  question: string
  apiBase?: string
  tenant?: SageTenantConfig
  network?: SagePaymentNetwork
  createdAt?: string
}

export interface StreamSageChatOptions extends SageRequestOptions {
  messages: SageChatMessage[]
  paymentToken?: string
  onEvent?: (event: SageChatStreamEvent) => void
}

export async function fetchSageActivity(
  opts: FetchActivityOptions = {},
): Promise<SageActivityResponse> {
  const base = opts.apiBase ?? DEFAULT_API_BASE
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 25)
  const url = `${trimSlash(base)}/api/sage/activity?limit=${limit}`
  const res = await fetch(url, { signal: opts.signal })
  if (!res.ok) {
    throw new Error(`sage activity ${res.status}`)
  }
  return (await res.json()) as SageActivityResponse
}

export async function fetchSageQuote(
  opts: FetchSageQuoteOptions,
): Promise<SageQuoteResponse> {
  const res = await fetch(`${apiBase(opts)}/api/sage/quote`, {
    method: "POST",
    headers: jsonHeaders(opts),
    body: JSON.stringify({
      question: opts.question,
      history: opts.history ?? [],
    }),
    signal: opts.signal,
  })
  const body = await parseJson(res)
  if (!res.ok) throw new Error(readError(body, `sage quote ${res.status}`))
  return body as SageQuoteResponse
}

export async function verifySagePayment(
  opts: VerifySagePaymentOptions,
): Promise<SageVerifyPaymentResponse> {
  const res = await fetch(`${apiBase(opts)}/api/sage/verify-payment`, {
    method: "POST",
    headers: jsonHeaders(opts),
    body: JSON.stringify({
      quote: opts.quote,
      question: opts.question,
      noteBoxId: opts.noteBoxId,
    }),
    signal: opts.signal,
  })
  const body = await parseJson(res)
  if (!res.ok) throw new Error(readError(body, `sage verify-payment ${res.status}`))
  return body as SageVerifyPaymentResponse
}

export async function fetchSageReceipt(
  id: string,
  opts: SageRequestOptions = {},
): Promise<SageReceiptBundle> {
  const res = await fetch(`${apiBase(opts)}/api/sage/receipt/${encodeURIComponent(id)}`, {
    headers: requestHeaders(opts),
    signal: opts.signal,
  })
  const body = await parseJson(res)
  if (!res.ok) throw new Error(readError(body, `sage receipt ${res.status}`))
  return body as SageReceiptBundle
}

export function isFullSageReceiptBundle(value: SageReceiptBundle | null | undefined): boolean {
  return value?.ok === true && value.completeness === "full_receipt_bundle"
}

export function createSagePaymentIntent(
  opts: CreateSagePaymentIntentOptions,
): SagePaymentIntent {
  const base = trimSlash(opts.apiBase ?? DEFAULT_API_BASE)
  return {
    type: "sage.payment_intent.v1",
    network: opts.network ?? "ergo-testnet",
    createdAt: opts.createdAt ?? new Date().toISOString(),
    question: opts.question,
    ...(opts.tenant?.id || opts.tenant?.label
      ? { tenant: { id: opts.tenant.id, label: opts.tenant.label } }
      : {}),
    quote: opts.quote,
    amountErg: opts.quote.price,
    receiverAddress: opts.quote.receiverAddress,
    reserveBoxId: opts.quote.reserveBoxId,
    taskHash: opts.quote.taskHash,
    expiresAt: opts.quote.expiresAt,
    deadline: opts.quote.deadline,
    verifyEndpoint: `${base}/api/sage/verify-payment`,
    receiptEndpointTemplate: `${base}/api/sage/receipt/{receiptId}`,
  }
}

export function serializeSagePaymentIntent(intent: SagePaymentIntent): string {
  return JSON.stringify(intent, null, 2)
}

export async function streamSageChat(
  opts: StreamSageChatOptions,
): Promise<SageChatStreamResult> {
  const res = await fetch(`${apiBase(opts)}/api/sage/chat`, {
    method: "POST",
    headers: jsonHeaders(opts),
    body: JSON.stringify({
      messages: opts.messages,
      ...(opts.paymentToken ? { paymentToken: opts.paymentToken } : {}),
    }),
    signal: opts.signal,
  })

  if (res.status === 402) {
    const body = await parseJson(res)
    return {
      ok: false,
      status: res.status,
      text: "",
      paymentRequired: body as SageChatStreamResult["paymentRequired"],
    }
  }

  if (!res.ok) {
    const body = await parseJson(res)
    return {
      ok: false,
      status: res.status,
      text: "",
      error: readError(body, `sage chat ${res.status}`),
    }
  }

  if (!res.body) {
    return { ok: false, status: res.status, text: "", error: "Sage chat stream missing body" }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let tier: SageChatStreamResult["tier"]

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      const event = parseSseEvent(part)
      if (!event) continue
      if (event.type === "delta") text += event.text
      if (event.type === "tier") tier = event.tier
      opts.onEvent?.(event)
      if (event.type === "error") {
        return {
          ok: false,
          status: res.status,
          text,
          tier,
          error: event.message,
        }
      }
    }
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer)
    if (event) {
      if (event.type === "delta") text += event.text
      if (event.type === "tier") tier = event.tier
      opts.onEvent?.(event)
      if (event.type === "error") {
        return {
          ok: false,
          status: res.status,
          text,
          tier,
          error: event.message,
        }
      }
    }
  }

  return { ok: true, status: res.status, text, tier }
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
  return `${trimSlash(apiBase)}/r/sage/${txId}`
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

function apiBase(opts: SageRequestOptions): string {
  return trimSlash(opts.apiBase ?? DEFAULT_API_BASE)
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function requestHeaders(opts: SageRequestOptions): Record<string, string> {
  return {
    ...(opts.tenant?.id ? { "x-sage-tenant-id": opts.tenant.id } : {}),
    ...(opts.tenant?.headers ?? {}),
    ...(opts.headers ?? {}),
  }
}

function jsonHeaders(opts: SageRequestOptions): Record<string, string> {
  return {
    "content-type": "application/json",
    ...requestHeaders(opts),
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error
    if (typeof error === "string") return error
  }
  return fallback
}

function parseSseEvent(raw: string): SageChatStreamEvent | null {
  let eventName = "message"
  let data = ""
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim()
    if (line.startsWith("data:")) data += line.slice("data:".length).trim()
  }
  if (!data) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }
  if (eventName === "tier") {
    const tier = parsed.tier === "premium" ? "premium" : "free"
    return {
      type: "tier",
      tier,
      ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
    }
  }
  if (eventName === "delta" && typeof parsed.text === "string") {
    return { type: "delta", text: parsed.text }
  }
  if (eventName === "done") {
    return {
      type: "done",
      ...(typeof parsed.stopReason === "string" ? { stopReason: parsed.stopReason } : {}),
      ...(typeof parsed.inputTokens === "number" ? { inputTokens: parsed.inputTokens } : {}),
      ...(typeof parsed.outputTokens === "number" ? { outputTokens: parsed.outputTokens } : {}),
    }
  }
  if (eventName === "error") {
    return {
      type: "error",
      message: typeof parsed.message === "string" ? parsed.message : "Sage stream error",
    }
  }
  return null
}
