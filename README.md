# @ergoblockchain/sage-widget

[![npm](https://img.shields.io/npm/v/@ergoblockchain/sage-widget.svg)](https://www.npmjs.com/package/@ergoblockchain/sage-widget)
[![license](https://img.shields.io/npm/l/@ergoblockchain/sage-widget.svg)](./LICENSE)

Embeddable widgets for **Sage** — the agent-economy concierge on [ergoblockchain.org](https://www.ergoblockchain.org). Use the read-only activity feed, or embed the paid Sage chat flow with quote, manual Note verification, streaming answer, receipt JSON, and public receipt link.

> _Why this matters:_ Sage settles real paid AI queries on Ergo testnet. The feed makes the "agent-economy" thesis visibly provable wherever you embed it — not a marketing claim, a list of public on-chain receipts that update live.

## What v0.3 ships

- `<SagePaymentWidget />` React component.
- `mountSagePaymentWidget(target, opts)` vanilla DOM mount.
- Typed clients for quote, verify, chat stream, receipt bundle, and activity feed.
- Tenant metadata and host-provided payment instructions.
- Portable `SagePaymentIntent` JSON for host-owned wallet flows.
- Optional `walletLauncher(intent)` callback so your app can open a reviewed wallet flow without letting the widget sign funds.
- Payment lifecycle callbacks: quote, receipt, receipt bundle, tier, phase, status.
- Public receipt links plus machine-readable `/api/sage/receipt/<id>` links.

The canonical Sage host is **testnet live proof**. It can produce `full_receipt_bundle` receipts with Agreement JSON, Verification Receipt JSON, and Settlement Receipt JSON. Mainnet readiness remains audit-gated.

## Install

```bash
npm install @ergoblockchain/sage-widget
# or
pnpm add @ergoblockchain/sage-widget
# or
yarn add @ergoblockchain/sage-widget
```

`react` and `react-dom` are optional peer deps — only required if you import from `/react`.

## Use it

### React activity feed

```tsx
import { SageActivityFeed } from "@ergoblockchain/sage-widget/react"

export function Footer() {
  return <SageActivityFeed limit={5} refreshMs={60_000} />
}
```

The component renders into your DOM (no iframe), styles itself with inline styles to avoid host-CSS conflicts, and polls `/api/sage/activity` on the host you point it at.

### React paid chat

```tsx
import { SagePaymentWidget } from "@ergoblockchain/sage-widget/react"

export function PaidSageBox() {
  return (
    <SagePaymentWidget
      tenant={{ id: "my-site", label: "My Ergo app" }}
      paymentInstructions={{
        helperText: "Issue the quoted Accord Note from your testnet wallet, then paste the Note box id.",
        walletUrl: "https://www.ergoblockchain.org/build/agent-payments",
        walletLauncherLabel: "Open my testnet wallet",
      }}
      onQuote={(quote) => console.log("Sage quote", quote)}
      onPaymentIntent={(intent) => console.log("Wallet intent", intent)}
      onReceipt={(receipt) => console.log("Sage receipt", receipt.receiptUrl)}
      onReceiptBundle={(bundle) => console.log("Receipt completeness", bundle.completeness)}
      walletLauncher={async (intent) => {
        // Your app owns wallet policy, ErgoPay/Fleet integration and signing.
        // Return a Note box id when the wallet creates the testnet Note.
        console.log("Create a Note for", intent.amountErg, intent.receiverAddress)
        return { ok: true, noteBoxId: "" }
      }}
    />
  )
}
```

The paid widget calls `/api/sage/quote`, shows the Accord Note payment fields, accepts a `noteBoxId`, calls `/api/sage/verify-payment`, streams `/api/sage/chat`, then surfaces the receipt link from `/api/sage/receipt/<id>`.

### Vanilla / non-React activity feed

```ts
import { mountSageFeed } from "@ergoblockchain/sage-widget/vanilla"

const handle = mountSageFeed(document.getElementById("sage-feed")!, {
  limit: 5,
  refreshMs: 60_000,
})

// later, if you want to tear down:
handle.destroy()
```

Or use the canonical hosted CDN drop-in (no install needed):

```html
<div id="sage-feed"></div>
<script src="https://www.ergoblockchain.org/agents.js"
        data-target="#sage-feed"
        data-height="320"
        async></script>
```

That last form is an iframe variant served straight from ergoblockchain.org — total style isolation, zero install. Use the npm package when you want the markup inline (themable, accessibility-friendly, tree-shakeable).

### Vanilla / non-React paid chat

```ts
import { mountSagePaymentWidget } from "@ergoblockchain/sage-widget/vanilla"

const handle = mountSagePaymentWidget(document.getElementById("sage-chat")!, {
  tenant: { id: "docs-footer", label: "Docs footer" },
  onPaymentIntent: (intent) => console.log("[sage] payment intent", intent),
})

// You can also start a question programmatically:
await handle.send("/research explain Ergo Notes")

// Inspect embed state:
console.log(handle.status().receipt?.receiptUrl)
```

## Just the types

If you want to render your own UI over Sage's API and skip the bundled components:

```ts
import {
  fetchSageActivity,
  fetchSageQuote,
  streamSageChat,
  verifySagePayment,
  type SageActivityEvent,
  type SageActivityResponse,
} from "@ergoblockchain/sage-widget"

const data: SageActivityResponse = await fetchSageActivity({ limit: 10 })
const settlements = data.events.filter((e) => e.type === "settlement")
```

Useful helpers:

```ts
import { fetchSageReceipt, isFullSageReceiptBundle } from "@ergoblockchain/sage-widget"

const receipt = await fetchSageReceipt("f8752d10a2ece92fbc88065c3b92b94da621ec65943098f43c9e084deb763d81")

if (isFullSageReceiptBundle(receipt)) {
  console.log("Agreement JSON is present", receipt.accord?.agreement_json)
}
```

### Payment intent bridge

v0.3 adds a small but important contract between the widget and your wallet layer. The widget still does **not** sign transactions. Instead it emits a portable intent:

```ts
import {
  createSagePaymentIntent,
  serializeSagePaymentIntent,
} from "@ergoblockchain/sage-widget"

const intent = createSagePaymentIntent({
  question: "/deep explain Ergo Notes",
  quote,
  tenant: { id: "my-wallet", label: "My Wallet" },
})

console.log(serializeSagePaymentIntent(intent))
```

The intent includes network, receiver, amount, reserve box, task hash, expiry, verification endpoint, and receipt endpoint template. A wallet integration can turn it into an Ergo testnet Note, then hand the Note box id back to the widget for verification.

## Render-prop / bring-your-own-design

```tsx
<SageActivityFeed>
  {({ response, loading }) => (
    <MyOwnDesign events={response?.events ?? []} loading={loading} />
  )}
</SageActivityFeed>
```

## Options

| Prop            | Type                              | Default                                   | Notes                                                                                          |
| --------------- | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apiBase`       | `string`                          | `"https://www.ergoblockchain.org"`        | Override if you run your own Sage deployment behind a custom domain.                            |
| `limit`         | `number`                          | `5`                                       | Max 25.                                                                                        |
| `refreshMs`     | `number`                          | `60000`                                   | Poll interval. Set to `0` to fetch once on mount and never refresh.                            |
| `onUpdate`      | `(r: SageActivityResponse) => void` | —                                       | Fired after every successful poll.                                                              |
| `onError`       | `(err: unknown) => void`          | `console.warn`                            | Fired on fetch failure.                                                                         |
| `className`     | `string`                          | —                                         | Applied to the root container (React only).                                                    |
| `style`         | `CSSProperties`                   | —                                         | Inline style merged onto the root container (React only).                                      |
| `children`      | render-prop                       | —                                         | Pass a function for full UI control; the component will skip the default markup.               |

`SagePaymentWidget` also accepts:

| Prop                | Type                                      | Notes                                                       |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `tenant`            | `{ id?: string; label?: string; headers?: Record<string,string> }` | Stable embed metadata and optional request headers. |
| `initialMessages`   | `SageChatMessage[]`                       | Preloaded chat context.                                     |
| `title`             | `string`                                  | Widget heading.                                             |
| `placeholder`       | `string`                                  | Input placeholder.                                          |
| `paymentInstructions` | `{ helperText?: string; walletUrl?: string; noteBoxLabel?: string }` | Host-specific payment copy and guide link. |
| `onMessage`         | `(message, messages) => void`             | Fired when the widget appends a chat message.               |
| `onQuote`           | `(quote) => void`                         | Fired after Sage returns a premium quote.                   |
| `onReceipt`         | `(receipt) => void`                       | Fired after payment verifies and a receipt URL exists.      |
| `onReceiptBundle`   | `(bundle) => void`                        | Fired after the widget fetches `/api/sage/receipt/<id>`.    |
| `onTier`            | `("free" \| "premium") => void`           | Fired when the stream reports model tier.                   |
| `onPhase`           | `(phase) => void`                         | Fired on widget phase changes: idle, quoting, payment_required, verifying, streaming, error. |
| `onPaymentIntent`   | `(intent) => void`                        | Fired when a premium quote becomes a structured wallet intent. |
| `walletLauncher`    | `(intent) => Promise<{ ok; noteBoxId? }>` | Optional host-owned wallet flow. The widget never signs itself. |
| `showPaymentIntent` | `boolean`                                 | Shows or hides the default payment-intent JSON panel. Default `true`. |
| `testnetWarning`    | `string \| false`                         | Default testnet safety copy. Set `false` to hide. |
| `onStatus`          | `(status) => void`                        | Fired with a compact snapshot of phase, tier, quote, payment intent, receipt, receipt bundle, and error. |

`onStatus` and the vanilla `handle.status()` also include `paymentIntent`, `messages`, and `activeQuestion`, so hosts can mirror widget state into their own telemetry or UI.

## Payment model

v0.3 deliberately does **not** sign wallet transactions inside the widget. The widget shows the quote fields, emits a portable payment intent, accepts a Note box id, verifies it through Sage, then streams the answer and exposes the receipt. Hosts can pair it with their own wallet flow, Accord tooling, ErgoPay/Fleet integration, or a manual testnet Note issuer.

For the canonical site, a successful paid flow looks like:

```text
question -> quote -> Ergo testnet Note -> verify-payment -> receipt bundle -> Sage answer
```

The public receipt API is the source of truth. Articles, dashboards, and registry entries should link to it instead of duplicating receipt fields.

## Event shape

Each event in `response.events` is a typed object:

```ts
{
  txId: string                       // 64-char hex
  blockHeight: number
  timestamp: number                  // ms epoch
  type: "settlement" | "issuance" | "transfer"
  inflowNanoErg: number              // sum of outputs to Sage wallet
  paymentNanoErg?: number            // value of redeemed Note (settlements only)
  noteBoxId?: string                 // first Note-shape input
}
```

For settlements, use `paymentNanoErg` (the value of the consumed Note) for "amount paid" display. `inflowNanoErg` includes change boxes when buyer and seller share an address in test setups.

## Related

- **Live demo**: [ergoblockchain.org/agent-economy/sage-widget](https://www.ergoblockchain.org/agent-economy/sage-widget)
- **API directly**: [`/api/sage/activity`](https://www.ergoblockchain.org/api/sage/activity) — JSON, no auth, cached 30s
- **Receipt format**: [`/r/sage/<settlement_tx_id>`](https://www.ergoblockchain.org/r/sage/f697e4841dd9a0c689d0b83a311130b85a0cfbab123230a6c40284b44c4cafef)
- **Accord Protocol**: [github.com/accord-protocol/accord-protocol](https://github.com/accord-protocol/accord-protocol)
- **Sage in the registry**: [accord-protocol/registry/providers/sage.json](https://github.com/accord-protocol/accord-protocol/blob/main/registry/providers/sage.json)

## Release checks

Before publishing:

```bash
npm run typecheck
npm run smoke
npm pack --dry-run
```

## Roadmap

- **v0.1.x** — read-only activity feed (React + vanilla + types).
- **v0.2** — `<SagePaymentWidget />` paid chat with quote, manual Note verify, streaming answer, receipt link, tenant config.
- **v0.3** _(current source)_ — payment-intent bridge, wallet launcher callback, stronger host telemetry, clearer testnet safety copy.
- **v0.4** — generic `<AccordActivityFeed providerId="..." />` that works for any provider in the registry, not just Sage.

## License

MIT
