# Relay Pilot Variant

`pilot.html` と `pilot.js` は Momo Relay 経由の Pilot 用 Viewer の正本です。

通常の `viewer.html` / `viewer.js` は Pi 直結 P2P と Ayame 用であり、Relay 用へそのまま置換してはならない。Relay 版は `device` 指定、`momo-command`、`momo-telemetry`、`momo-race` の DataChannel を追加で扱う。

## 更新手順

1. Relay Pilot の変更はこのディレクトリで実装・検証する。
2. `npm test` と `node --check variants/relay/pilot.js` を実行する。
3. `momo-fpv-viewer` をコミットして push する。
4. `momo` で `tools/sync-relay-viewer.ps1` を実行する。
5. 同期結果の `tools/momo-relay/web/viewer-source.json` が指す commit を確認し、Relay を再ビルドして検証する。

`momo/tools/momo-relay/web/` は配布先であり、直接編集しない。緊急修正をした場合も、同じ変更を先にこのディレクトリへ戻してから同期する。
