#!/usr/bin/env node
import assert from "node:assert/strict"

const root = await import("../dist/index.js")
const react = await import("../dist/react.js")
const vanilla = await import("../dist/vanilla.js")

assert.equal(typeof root.fetchSageActivity, "function")
assert.equal(typeof root.fetchSageQuote, "function")
assert.equal(typeof root.verifySagePayment, "function")
assert.equal(typeof root.fetchSageReceipt, "function")
assert.equal(typeof root.streamSageChat, "function")
assert.equal(typeof root.isFullSageReceiptBundle, "function")
assert.equal(typeof root.createSageWidgetEmbedConfig, "function")
assert.equal(typeof root.createReactEmbedSnippet, "function")
assert.equal(typeof root.createVanillaEmbedSnippet, "function")
assert.equal(root.SAGE_WIDGET_CAPABILITIES.mainnetReady, false)
assert.equal(root.nanoToErg(1_000_000), "0.001")
assert.equal(root.relativeTime(Date.now() - 61_000).endsWith("m ago"), true)
assert.equal(typeof react.SageActivityFeed, "function")
assert.equal(typeof react.SagePaymentWidget, "function")
assert.equal(typeof vanilla.mountSageFeed, "function")
assert.equal(typeof vanilla.mountSagePaymentWidget, "function")

console.log("sage-widget smoke clean")
