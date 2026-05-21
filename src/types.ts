/**
 * Public types for the Sage activity feed and paid chat flow.
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

export type SageChatRole = "user" | "assistant"

export interface SageChatMessage {
  role: SageChatRole
  content: string
}

export interface SageTenantConfig {
  /** Stable tenant id for analytics, logs, or future multi-tenant routing. */
  id?: string
  /** Human-facing label shown in the default widgets. */
  label?: string
  /** Extra headers attached to Sage API requests. */
  headers?: Record<string, string>
}

export type SagePaymentNetwork = "ergo-testnet" | "ergo-mainnet"

export interface SageQuote {
  quoteId: string
  taskHash: string
  price: string
  issuedAt?: string
  expiresAt: string
  receiverAddress: string
  reserveBoxId: string
  deadline: `+${number} blocks`
}

export type SagePremiumReason =
  | "explicit_command"
  | "code_request"
  | "long_answer"
  | "deep_research"
  | "multi_turn_followup"

export interface SageQuoteResponse {
  premium: boolean
  reason?: SagePremiumReason
  rationale?: string
  quote?: SageQuote
}

export interface SagePaymentIntent {
  type: "sage.payment_intent.v1"
  network: SagePaymentNetwork
  createdAt: string
  question: string
  tenant?: Pick<SageTenantConfig, "id" | "label">
  quote: SageQuote
  amountErg: string
  receiverAddress: string
  reserveBoxId: string
  taskHash: string
  expiresAt: string
  deadline: `+${number} blocks`
  verifyEndpoint: string
  receiptEndpointTemplate: string
}

export interface SageWalletLaunchResult {
  ok: boolean
  /** Note box id produced by a host wallet flow. If present, the widget can prefill verification. */
  noteBoxId?: string
  /** Optional transaction id for host telemetry. Sage verifies by Note box id, not by tx id. */
  txId?: string
  error?: string
}

export type SageWalletLauncher = (
  intent: SagePaymentIntent,
) => Promise<SageWalletLaunchResult | void> | SageWalletLaunchResult | void

export interface SageVerifyPaymentResponse {
  ok: true
  paymentToken: string
  receiptId: string
  receiptUrl: string
  receiptApiUrl: string
  settlementTxId?: string | null
  accordSettlementId?: string
  receiptStorage?: {
    ok: boolean
    skipped?: boolean
    reason?: string
    path?: string
    aliases?: string[]
    error?: string
  }
}

export interface SagePremiumPaymentRequired {
  error: "premium_payment_required"
  reason?: SagePremiumReason
  rationale?: string
}

export type SageChatTier = "free" | "premium"

export type SageChatStreamEvent =
  | { type: "tier"; tier: SageChatTier; model?: string }
  | { type: "delta"; text: string }
  | { type: "done"; stopReason?: string; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string }

export interface SageChatStreamResult {
  ok: boolean
  status: number
  text: string
  tier?: SageChatTier
  paymentRequired?: SagePremiumPaymentRequired
  error?: string
}

export interface SageReceiptBundle {
  ok: true
  type: "sage.receipt_bundle.v1"
  version: "v1"
  id: string
  status: "settled_on_chain" | "verified_pending_redemption"
  completeness: "full_receipt_bundle" | "full" | "chain_proof_only"
  public_receipt_url: string
  api_receipt_url: string
  explorer_url: string | null
  accord?: {
    agreement_hash?: string | null
    verification_receipt_hash?: string | null
    settlement_receipt_hash?: string | null
    agreement_json?: unknown
    verification_receipt_json?: unknown
    settlement_receipt_json?: unknown
  }
}

export interface SagePaymentWidgetOptions {
  /**
   * Base URL of the Sage host. Default: ergoblockchain.org.
   */
  apiBase?: string
  /**
   * Optional tenant metadata. Current public Sage ignores tenant routing,
   * but the widget keeps this shape stable for multi-tenant deployments.
   */
  tenant?: SageTenantConfig
  /** Initial chat messages, useful for preloaded context. */
  initialMessages?: SageChatMessage[]
  /** Placeholder text for the default input. */
  placeholder?: string
  /** Widget heading. React also accepts this through component props. */
  title?: string
  /** Optional host-specific payment copy and links. */
  paymentInstructions?: SagePaymentInstructions
  /**
   * Optional wallet launcher supplied by the host app. The package does not
   * sign transactions itself; this callback receives a structured intent that
   * your wallet layer can transform into a testnet Note.
   */
  walletLauncher?: SageWalletLauncher
  /**
   * Show the portable payment intent JSON in the default UI. Default: true.
   * Hosts with a fully custom wallet flow can set this to false.
   */
  showPaymentIntent?: boolean
  /**
   * Testnet safety copy for the default widget. Set to false to hide.
   */
  testnetWarning?: string | false
  /** Called whenever a message is appended by the widget. */
  onMessage?: (message: SageChatMessage, messages: SageChatMessage[]) => void
  /** Called after Sage returns a premium quote. */
  onQuote?: (quote: SageQuoteResponse) => void
  /** Called when a structured payment intent is produced for the active quote. */
  onPaymentIntent?: (intent: SagePaymentIntent) => void
  /** Called after a payment verifies and Sage returns a receipt link. */
  onReceipt?: (receipt: SageVerifyPaymentResponse) => void
  /** Called after the widget fetches the full machine-readable receipt bundle. */
  onReceiptBundle?: (receipt: SageReceiptBundle) => void
  /** Called when the chat stream reports free vs premium tier. */
  onTier?: (tier: SageChatTier) => void
  /** Called when the widget phase changes. */
  onPhase?: (phase: SagePaymentPhase) => void
  /** Called with a compact state snapshot after important widget events. */
  onStatus?: (status: SagePaymentWidgetStatus) => void
  /** Optional callback fired on fetch or stream errors. */
  onError?: (error: unknown) => void
}

export type SagePaymentPhase =
  | "idle"
  | "quoting"
  | "payment_required"
  | "verifying"
  | "streaming"
  | "error"

export interface SagePaymentInstructions {
  /** Short copy displayed above the Note box input. */
  helperText?: string
  /** Optional link to host payment/wallet instructions. */
  walletUrl?: string
  /** Custom label for the wallet launcher button. */
  walletLauncherLabel?: string
  /** Optional custom label for the Note box input. */
  noteBoxLabel?: string
}

export interface SagePaymentWidgetStatus {
  phase: SagePaymentPhase
  tier: SageChatTier | null
  quote: SageQuoteResponse["quote"] | null
  paymentIntent: SagePaymentIntent | null
  receipt: SageVerifyPaymentResponse | null
  receiptBundle: SageReceiptBundle | null
  error: string | null
  /** Latest chat transcript known to the widget. */
  messages: SageChatMessage[]
  /** Question currently tied to the active quote/payment cycle. */
  activeQuestion: string | null
}

export const DEFAULT_API_BASE = "https://www.ergoblockchain.org"
export const DEFAULT_LIMIT = 5
export const DEFAULT_REFRESH_MS = 60_000
