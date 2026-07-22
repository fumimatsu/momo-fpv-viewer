# Momo FPV DirectInput FFB Bridge

Viewer HTML から localhost WebSocket を通して、Windows DirectInput の FFB effect を制御する Windows 専用プロセス。ブラウザ、Momo、Raspberry Pi はホイールへ直接出力しない。

```text
Viewer HTML -> ws://127.0.0.1:24725 -> DirectInput -> MOZA Pit House / R3
```

## デバイス互換性

起動スクリプトの既定 backend は `moza-directinput` である。これは MOZA R3 の符号付き
constant magnitude 出力を明示し、デバイス名や VID/PID の自動判別失敗で一般 DirectInput 方式へ
落ちることを防ぐ。`auto` は他デバイスの検証時だけ明示指定する。

| Device | Profile | DirectInput force sign |
| --- | --- | --- |
| MOZA R3 | `moza-r3` | Signed constant magnitude |
| Thrustmaster T300 | `thrustmaster-t300` | Direction vector |
| Logitech G29 | `logitech-g29` | Direction vector |
| Logitech G923 (PC mode) | `logitech-g923` | Direction vector |
| その他のデバイス | `generic-directinput` | Direction vector |

- `Constant Force` は必須である。これを公開しないデバイスは自動取得しない。
- `Friction` と `Damper` は任意である。非対応 effect だけを個別に無効化し、
  Constant Force に対応していれば将来の方向性 effect を追加できる。
- 組み込みプロファイルの一致には、想定する Vendor ID に加えて製品名の一致を要求する。
  実機の VID/PID は `listDevices` から記録し、確認後に Product ID 固定プロファイルへ昇格する。
- ドライバ診断時は、`-Backend directinput` と `-Backend moza-directinput` で
  符号方式を明示指定できる。

Viewer が Bridge へ接続した後、ブラウザコンソールで
`window.fpvViewer.getDiagnostics().ffb.bridge.devices` を実行すると、認識したデバイス情報を確認できる。

## Phase 1: 基礎操舵感

現行実装は、ステアリング角へ反対向き constant force を掛けない。これは確認用の疑似センタリングであり、車両の操舵反力ではないためである。

- Input 設定画面で `Drive On 中に FFB を有効化` を選んで Viewer を開く。
- Viewer は Bridge へ接続し、列挙した FFB 対応ホイールを自動 Acquire する。
- 出力は Viewer の `Drive On` 中だけで、`Drive Off` では即座に `stopAll` を送る。
- Viewer はスロットルとブレーキから平滑化した `speedProxy` を送る。これは実車速ではない。
- Bridge は低速ほど `Friction`、speedProxy が高いほど `Damper` を加算する。baseline では方向性 torque を出さない。
- 250 ms 間 Viewer から更新が来なければ Bridge が constant torque と condition effect の両方を停止する。
- Viewer の Stop、切断、ページ離脱、Bridge 終了はすべて `stopAll` を送る。
- Input 設定画面では、基礎/低速 friction と基礎/速度 damper をハンコンのプロファイルごとに調整できる。

R3 を固定し、MOZA Pit House の最大トルクは運用上の安全上限に設定する。FFB は Input 設定で有効にしただけでは出ず、Momo DataChannel 接続後の Viewer `Drive On` 中にだけ出る。初回は停止状態、低速、スロットル入力時の順で抵抗変化を確認する。

## 起動

Momo の P2P Viewer を `http://192.168.11.4:8080` のような LAN origin で開く場合、Bridge はその origin を明示許可する。`*` や LAN 全体の許可は実装しない。

```powershell
cd C:\src\momo-fpv-viewer\tools\ffb-bridge
.\start-ffb-bridge.ps1 -ViewerOrigin http://192.168.11.4:8080
```

Viewer が `http://127.0.0.1`、`http://localhost`、または `file://` 起動なら `-ViewerOrigin` は不要。

## Viewer 起動

Input 設定画面から `Viewer を開く` を使う。FFB 有効時は、選択したプロファイルの `ffbEnabled`、friction/damper 設定、`ffbUrl` が Viewer URL に反映される。

Relay Variant では、Relay Viewer をこの Viewer 正本から同期してから使う。公開された GitHub Pages Viewer を FFB Bridge に許可しない。

## Bridge オプション

- `--backend moza-directinput`: MOZA R3 向けの符号付き constant magnitude 出力。既定。
- `--max-output 0.02..1.0`: Bridge 側の絶対上限。既定は `1.00`。強すぎる環境だけ、起動時に明示して下げる。

Pit House の機械的センタリング、ダンパー、フリクションは Phase 1 ではオフにする。Bridge は Windows AutoCenter を無効化し、基礎抵抗を唯一のソフトウェア制御層にする。横G、スリップ、IMU路面感、衝撃は Bridge の次段階の effect layer に追加する。
- `--allow-origin <exact-origin>`: 非 localhost Viewer を 1 つだけ許可する。複数指定できる。

Bridge は `127.0.0.1` にのみ bind し、外部 PC からの接続を受けない。

## 配置先での許可オリジン設定

公開済みの Bridge を起動引数なしで運用する場合は、実行ファイルと同じフォルダーに
`allowed-origins.txt` を置く。1 行につき 1 つの正確な Viewer origin を記載する。

```text
http://192.168.11.104:8090
```

空行と `#` から始まる行は無視する。`*` や LAN 全体を許可する設定は使わない。
