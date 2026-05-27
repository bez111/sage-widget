import {
  DEFAULT_API_BASE,
  DEFAULT_LIMIT,
  DEFAULT_REFRESH_MS,
  type SagePaymentInstructions,
  type SageTenantConfig,
} from "./types"

export type SageWidgetEmbedMode = "activity-feed" | "payment-widget"

export interface SageWidgetEmbedConfig {
  mode: SageWidgetEmbedMode
  apiBase: string
  targetId: string
  tenant?: SageTenantConfig
  limit: number
  refreshMs: number
  title: string
  placeholder: string
  paymentInstructions: SagePaymentInstructions
  showPaymentIntent: boolean
  testnetWarning: string | false
}

export type CreateSageWidgetEmbedConfigOptions = Partial<
  Omit<SageWidgetEmbedConfig, "paymentInstructions" | "tenant">
> & {
  tenant?: SageTenantConfig
  paymentInstructions?: Partial<SagePaymentInstructions>
}

export interface SageWidgetCapabilityManifest {
  type: "ergo.sage_widget.capabilities.v0"
  version: "v0"
  package: "@ergoblockchain/sage-widget"
  packageVersion: string
  status: "testnet_live_proof"
  mainnetReady: false
  productionCustody: false
  capabilities: Array<{
    id: string
    label: string
    status: "live" | "host_required" | "audit_gated"
    description: string
  }>
  guardrails: string[]
}

export const SAGE_WIDGET_CAPABILITIES: SageWidgetCapabilityManifest = {
  type: "ergo.sage_widget.capabilities.v0",
  version: "v0",
  package: "@ergoblockchain/sage-widget",
  packageVersion: "0.4.0",
  status: "testnet_live_proof",
  mainnetReady: false,
  productionCustody: false,
  capabilities: [
    {
      id: "activity-feed",
      label: "Sage activity feed",
      status: "live",
      description: "Read-only feed of public Sage wallet activity and settlements.",
    },
    {
      id: "paid-chat",
      label: "Paid Sage chat",
      status: "live",
      description: "Chat UI that requests quotes, verifies Note payments, streams answers, and exposes receipts.",
    },
    {
      id: "payment-intent",
      label: "Portable payment intent",
      status: "live",
      description: "Structured JSON bridge from Sage quotes to host-owned wallet flows.",
    },
    {
      id: "host-wallet-launcher",
      label: "Host wallet launcher",
      status: "host_required",
      description: "Optional callback for a reviewed host wallet. The package does not sign funds.",
    },
    {
      id: "receipt-bundle-callback",
      label: "Receipt bundle callback",
      status: "live",
      description: "Callback after the widget fetches the machine-readable Sage receipt bundle.",
    },
    {
      id: "mainnet-gate",
      label: "Mainnet gate",
      status: "audit_gated",
      description: "Canonical public Sage remains testnet-first until audit-bound mainnet artifacts exist.",
    },
  ],
  guardrails: [
    "The widget never stores seed phrases or private keys.",
    "The widget never signs or broadcasts wallet transactions by itself.",
    "The canonical Sage host is testnet live proof, not audited mainnet payment infrastructure.",
    "Hosts should keep wallet policy, signing, limits, and custody boundaries outside the widget.",
  ],
}

export function createSageWidgetEmbedConfig(
  options: CreateSageWidgetEmbedConfigOptions = {},
): SageWidgetEmbedConfig {
  const mode = options.mode ?? "payment-widget"
  return {
    mode,
    apiBase: trimSlash(options.apiBase ?? DEFAULT_API_BASE),
    targetId: normalizeTargetId(
      options.targetId ?? (mode === "activity-feed" ? "sage-feed" : "sage-chat"),
    ),
    ...(options.tenant ? { tenant: options.tenant } : {}),
    limit: clampLimit(options.limit ?? DEFAULT_LIMIT),
    refreshMs: Math.max(0, options.refreshMs ?? DEFAULT_REFRESH_MS),
    title: options.title ?? (mode === "activity-feed" ? "Live Sage activity" : "Ask Sage"),
    placeholder: options.placeholder ?? "Ask Sage about Ergo or agent payments...",
    paymentInstructions: {
      helperText:
        options.paymentInstructions?.helperText ??
        "Issue the quoted Ergo testnet Note from your reviewed wallet flow, then paste the Note box id.",
      walletUrl:
        options.paymentInstructions?.walletUrl ??
        "https://www.ergoblockchain.org/build/agent-payments",
      walletLauncherLabel: options.paymentInstructions?.walletLauncherLabel ?? "Open wallet flow",
      noteBoxLabel: options.paymentInstructions?.noteBoxLabel ?? "Note box id",
    },
    showPaymentIntent: options.showPaymentIntent ?? true,
    testnetWarning:
      options.testnetWarning ??
      "Testnet proof flow. The widget does not sign funds; keep wallet authority in the host app.",
  }
}

export function createReactEmbedSnippet(
  options: CreateSageWidgetEmbedConfigOptions = {},
): string {
  const config = createSageWidgetEmbedConfig(options)

  if (config.mode === "activity-feed") {
    return [
      'import { SageActivityFeed } from "@ergoblockchain/sage-widget/react"',
      "",
      "export function SageEmbed() {",
      "  return (",
      "    <SageActivityFeed",
      `      apiBase=${jsonProp(config.apiBase)}`,
      `      limit={${config.limit}}`,
      `      refreshMs={${config.refreshMs}}`,
      "    />",
      "  )",
      "}",
    ].join("\n")
  }

  return [
    'import { SagePaymentWidget } from "@ergoblockchain/sage-widget/react"',
    "",
    "export function SageEmbed() {",
    "  return (",
    "    <SagePaymentWidget",
    `      apiBase=${jsonProp(config.apiBase)}`,
    ...(config.tenant ? [`      tenant={${pretty(config.tenant, 6)}}`] : []),
    `      title=${jsonProp(config.title)}`,
    `      placeholder=${jsonProp(config.placeholder)}`,
    `      paymentInstructions={${pretty(config.paymentInstructions, 6)}}`,
    `      showPaymentIntent={${String(config.showPaymentIntent)}}`,
    `      testnetWarning=${config.testnetWarning === false ? "{false}" : jsonProp(config.testnetWarning)}`,
    "      onPaymentIntent={(intent) => console.log('[sage] payment intent', intent)}",
    "      onReceipt={(receipt) => console.log('[sage] receipt', receipt.receiptUrl)}",
    "      onReceiptBundle={(bundle) => console.log('[sage] receipt bundle', bundle.completeness)}",
    "    />",
    "  )",
    "}",
  ].join("\n")
}

export function createVanillaEmbedSnippet(
  options: CreateSageWidgetEmbedConfigOptions = {},
): string {
  const config = createSageWidgetEmbedConfig(options)
  const mount = config.mode === "activity-feed" ? "mountSageFeed" : "mountSagePaymentWidget"
  const importName =
    config.mode === "activity-feed"
      ? "mountSageFeed"
      : "mountSagePaymentWidget"
  const payload =
    config.mode === "activity-feed"
      ? {
          apiBase: config.apiBase,
          limit: config.limit,
          refreshMs: config.refreshMs,
        }
      : {
          apiBase: config.apiBase,
          ...(config.tenant ? { tenant: config.tenant } : {}),
          title: config.title,
          placeholder: config.placeholder,
          paymentInstructions: config.paymentInstructions,
          showPaymentIntent: config.showPaymentIntent,
          testnetWarning: config.testnetWarning,
        }

  return [
    `import { ${importName} } from "@ergoblockchain/sage-widget/vanilla"`,
    "",
    `const target = document.getElementById(${JSON.stringify(config.targetId)})`,
    "if (!target) throw new Error('Missing Sage embed target')",
    "",
    `const sage = ${mount}(target, ${pretty(payload, 0)})`,
    "",
    "// Later, if needed:",
    "// sage.destroy()",
  ].join("\n")
}

export function createHostedFeedSnippet(
  options: CreateSageWidgetEmbedConfigOptions = {},
): string {
  const config = createSageWidgetEmbedConfig({ ...options, mode: "activity-feed" })
  return [
    `<div id="${escapeHtml(config.targetId)}"></div>`,
    `<script src="${escapeHtml(config.apiBase)}/agents.js"`,
    `        data-target="#${escapeHtml(config.targetId)}"`,
    `        data-height="320"`,
    "        async></script>",
  ].join("\n")
}

function clampLimit(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), 25)
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function normalizeTargetId(value: string): string {
  const normalized = value.replace(/^#/, "").trim()
  return normalized || "sage-chat"
}

function jsonProp(value: string): string {
  return `{${JSON.stringify(value)}}`
}

function pretty(value: unknown, indent: number): string {
  const spaces = " ".repeat(indent)
  return JSON.stringify(value, null, 2).replace(/\n/g, `\n${spaces}`)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

