/**
 * Public API surface for @ergoblockchain/sage-widget.
 *
 * Importing from the root re-exports the types + the framework-agnostic
 * clients + utility formatters. For framework components import from
 * the subpaths:
 *
 *   import { SageActivityFeed } from "@ergoblockchain/sage-widget/react"
 *   import { SagePaymentWidget } from "@ergoblockchain/sage-widget/react"
 *   import { mountSageFeed }    from "@ergoblockchain/sage-widget/vanilla"
 *   import { mountSagePaymentWidget } from "@ergoblockchain/sage-widget/vanilla"
 */

export * from "./types"
export {
  fetchSageActivity,
  fetchSageQuote,
  verifySagePayment,
  fetchSageReceipt,
  streamSageChat,
  nanoToErg,
  relativeTime,
  receiptUrl,
  explorerUrl,
} from "./api"
