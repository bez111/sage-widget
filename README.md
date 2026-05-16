# @ergoblockchain/sage-widget

[![npm](https://img.shields.io/npm/v/@ergoblockchain/sage-widget.svg)](https://www.npmjs.com/package/@ergoblockchain/sage-widget)
[![license](https://img.shields.io/npm/l/@ergoblockchain/sage-widget.svg)](./LICENSE)

Embeddable live-activity feed for **Sage** — the agent-economy concierge on [ergoblockchain.org](https://www.ergoblockchain.org). Drop a typed React component into your app, or call a vanilla DOM mount function from any framework. Every settled paid query Sage takes appears in the feed within a minute, with a clickable link to the on-chain receipt.

> _Why this matters:_ Sage settles real paid AI queries on Ergo testnet. The feed makes the "agent-economy" thesis visibly provable wherever you embed it — not a marketing claim, a list of public on-chain receipts that update live.

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

### React

```tsx
import { SageActivityFeed } from "@ergoblockchain/sage-widget/react"

export function Footer() {
  return <SageActivityFeed limit={5} refreshMs={60_000} />
}
```

The component renders into your DOM (no iframe), styles itself with inline styles to avoid host-CSS conflicts, and polls `/api/sage/activity` on the host you point it at.

### Vanilla / non-React

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

## Just the types

If you want to render your own UI over Sage's API and skip the bundled components:

```ts
import {
  fetchSageActivity,
  type SageActivityEvent,
  type SageActivityResponse,
} from "@ergoblockchain/sage-widget"

const data: SageActivityResponse = await fetchSageActivity({ limit: 10 })
const settlements = data.events.filter((e) => e.type === "settlement")
```

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

- **Live demo**: [ergoblockchain.org/agent-economy#sage-activity](https://www.ergoblockchain.org/agent-economy#sage-activity)
- **API directly**: [`/api/sage/activity`](https://www.ergoblockchain.org/api/sage/activity) — JSON, no auth, cached 30s
- **Receipt format**: [`/r/sage/<settlement_tx_id>`](https://www.ergoblockchain.org/r/sage/f697e4841dd9a0c689d0b83a311130b85a0cfbab123230a6c40284b44c4cafef)
- **Accord Protocol**: [github.com/accord-protocol/accord-protocol](https://github.com/accord-protocol/accord-protocol)
- **Sage in the registry**: [accord-protocol/registry/providers/sage.json](https://github.com/accord-protocol/accord-protocol/blob/main/registry/providers/sage.json)

## Roadmap

- **v0.1.x** _(current)_ — read-only activity feed (React + vanilla + types).
- **v0.2** — `<SagePaymentWidget />` full chat with 402 + payment + Sonnet answer.
- **v0.3** — generic `<AccordActivityFeed providerId="..." />` that works for any provider in the registry, not just Sage.

## License

MIT
