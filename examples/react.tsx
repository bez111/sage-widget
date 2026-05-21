/**
 * Drop-in React usage example.
 *
 *   npm install @ergoblockchain/sage-widget
 *
 * Then somewhere in your app:
 */

import { SageActivityFeed, SagePaymentWidget } from "@ergoblockchain/sage-widget/react"

export function SiteFooter() {
  return (
    <footer style={{ padding: 24 }}>
      <h3>Live agent payments on Ergo</h3>
      <SageActivityFeed limit={5} refreshMs={60_000} />
    </footer>
  )
}

export function PaidSageCard() {
  return (
    <section style={{ padding: 24 }}>
      <h3>Paid Sage embed</h3>
      <SagePaymentWidget
        tenant={{ id: "example-react", label: "Example app" }}
        paymentInstructions={{ walletLauncherLabel: "Open example wallet" }}
        onPaymentIntent={(intent) => console.log("[sage] payment intent", intent)}
        walletLauncher={async (intent) => {
          console.log("Host wallet should issue a testnet Note for", intent.amountErg)
          return { ok: true }
        }}
      />
    </section>
  )
}

// ── Render-prop / bring-your-own-design alternative ───────────────────

import { useState } from "react"
import { type SageActivityResponse } from "@ergoblockchain/sage-widget"

export function CustomFeed() {
  const [response, setResponse] = useState<SageActivityResponse | null>(null)
  return (
    <SageActivityFeed onUpdate={setResponse}>
      {() => (
        <ul>
          {response?.events.map((e) => (
            <li key={e.txId}>
              {e.type === "settlement"
                ? `Settled ${(e.paymentNanoErg ?? 0) / 1e9} ERG`
                : `Tx ${e.txId.slice(0, 8)}`}
            </li>
          ))}
        </ul>
      )}
    </SageActivityFeed>
  )
}
