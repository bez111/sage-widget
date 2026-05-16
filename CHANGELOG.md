# Changelog

All notable changes to `@ergoblockchain/sage-widget` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
