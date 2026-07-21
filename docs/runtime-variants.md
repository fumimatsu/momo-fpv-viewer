# Viewer Runtime Variant の管理

## 正本

Viewer のソースリポジトリは `fumimatsu/momo-fpv-viewer` とする。

| Variant | 正本 | 接続経路 | 配布先 |
| --- | --- | --- | --- |
| Direct | `viewer.html` / `viewer.js` | Pi 直結 P2P、Ayame | ローカル HTTP、GitHub Pages |
| Relay Pilot | `variants/relay/pilot.html` / `variants/relay/pilot.js` / `variants/relay/ffb-bridge.js` | Local Relay | `momo/tools/momo-relay/web/` |

`momo-fpv` の `client/` と `device-html/` は Pi 直結配布の運用コピーである。Relay Pilot の正本ではない。

## なぜ Variant を分けるか

Direct Viewer は Pi の `serial` DataChannel と Ayame signaling を扱う。Relay Pilot は Relay との signaling に加え、`momo-command`、`momo-telemetry`、`momo-race` を扱う。HTML / JavaScript を単純に共有すると、片方の接続方式を壊す。

共通の UI や Gamepad profile、Race HUD の変更は両 Variant へ意図して反映する。片方だけを編集して「最新」と扱うことを禁止する。

## FFB の扱い

FFB はブラウザ機能ではない。Viewer PC 上のネイティブ bridge が DirectInput / MOZA Pit House と連携して出力する。ブラウザ側は localhost Bridge の WebSocket client だけを持ち、FFB bridge 自体を `momo` や Pi へ混在させない。`ffb-bridge.js` は Direct と Relay で同一内容を維持する。

初期試験計画は [ffb-r3-initial-test.md](ffb-r3-initial-test.md) を参照する。

## Relay への反映

Relay 用 Variant を `momo` へ反映する時は、`momo` 側で次を実行する。

```powershell
.\tools\sync-relay-viewer.ps1
```

同期元が未コミットならスクリプトは失敗する。`-AllowDirtySource` は調査用途だけであり、配布・コミット前に使わない。

同期先の `viewer-source.json` は、Relay がどの Viewer commit から生成されたかを記録する。Relay 変更のレビューではこの commit と実ファイルの差分を確認する。
