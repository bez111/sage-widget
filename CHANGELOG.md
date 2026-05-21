# Changelog

All notable changes to `@ergoblockchain/sage-widget` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes yet.

## [0.2.0] — 2026-05-16

Prepared paid Sage embed surface.

### Added
- `SagePaymentWidget` React component for chat, quote, manual Note verification, streaming answer and receipt link.
- `mountSagePaymentWidget(target, opts)` vanilla DOM mount with the same paid flow.
- Typed API clients: `fetchSageQuote`, `verifySagePayment`, `fetchSageReceipt`, `streamSageChat`.
- Payment-flow types: `SageQuote`, `SageChatMessage`, `SageVerifyPaymentResponse`, `SageReceiptBundle`, tenant config and chat stream events.
- Paid widget phase/status callbacks: `onQuote`, `onReceiptBundle`, `onPhase`, `onStatus`.
- Host-provided `paymentInstructions` for wallet guidance and custom Note box labels.
- Receipt bundle fetch after payment verification so embeds can inspect `full_receipt_bundle` vs fallback state.
- `isFullSageReceiptBundle(receipt)` helper for host UIs.
- Vanilla `handle.status()` for host-side telemetry or mirrored UI state.
- Package smoke test covering root, React and vanilla exports.

### Fixed
- Vanilla paid widget buttons now enable immediately as users type into the question and Note box fields.
- React paid widget hides the payment panel after successful verification and shows receipt/API links instead.
- Chat stream parser now consumes a final trailing SSE frame if the response ends without a blank separator.

## [0.1.0] — 2026-05-16

Initial release. Read-only Sage activity feed.

### Added
- `SageActivityFeed` React component (subpath: `@ergoblockchain/sage-widget/react`)
- `mountSageFeed(target, opts)` framework-agnostic DOM mount (subpath: `@ergoblockchain/sage-widget/vanilla`)
- Public types `SageActivityEvent`, `SageActivityResponse`, `SageWidgetOptions`
- `fetchSageActivity({ apiBase, limit })` low-level API client
- Format helpers: `nanoToErg`, `relativeTime`, `receiptUrl`, `explorerUrl`
- Render-prop support on the React component for full UI control
- Both ESM + CJS builds with type declarations and source maps
- React and react-dom marked as optional peer deps (only required for the `/react` subpath)
