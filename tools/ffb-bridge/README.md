# Momo FPV DirectInput FFB Bridge

Viewer HTML から localhost WebSocket を通して、Windows DirectInput の FFB effect を制御する Windows 専用プロセス。ブラウザ、Momo、Raspberry Pi はホイールへ直接出力しない。

```text
Viewer HTML -> ws://127.0.0.1:24725 -> DirectInput -> MOZA Pit House / R3
```

## 初期ステアリング試験

最初の実装は、Viewer の現在のステアリング指令を -1 から +1 に正規化し、角度の絶対値に比例する反対向き constant force を出す。テレメトリー、車速、衝突、路面振動はまだ使わない。

- Viewer は `ffbTest=1` で試験パネルを表示する。
- Bridge へ接続し、列挙したホイールを明示して Acquire する。
- `Enable FFB` を明示操作した場合だけ出力する。
- `Pulse −` / `Pulse +` は、連続ステアリング出力を有効にしていない時だけ使える単発確認用。既定 `0.35` を `350 ms` 出した後、必ず `stopAll` にする。
- 250 ms 間 Viewer から更新が来なければ Bridge がゼロ出力にする。
- Viewer の Stop、切断、ページ離脱、Bridge 終了はすべて `stopAll` を送る。
- Bridge の既定最大出力は `0.40`。Viewer 側の上限は既定 `0.30`。

R3 を固定し、MOZA Pit House の最大トルクも低く設定してから試験する。車体への Drive ON と混同しない。初回は映像接続も RC DataChannel 接続も不要で、Viewer の Steering slider だけで確認できる。

## 起動

Momo の P2P Viewer を `http://192.168.11.4:8080` のような LAN origin で開く場合、Bridge はその origin を明示許可する。`*` や LAN 全体の許可は実装しない。

```powershell
cd C:\src\momo-fpv-viewer\tools\ffb-bridge
.\start-ffb-bridge.ps1 -ViewerOrigin http://192.168.11.4:8080
```

Viewer が `http://127.0.0.1`、`http://localhost`、または `file://` 起動なら `-ViewerOrigin` は不要。

## Viewer 起動例

```text
http://192.168.11.4:8080/html/fpv-viewer.html#debug=1&ffbTest=1&autoStart=0&autoReconnect=0
```

Relay Variant では、Relay Viewer をこの Viewer 正本から同期してから使う。公開された GitHub Pages Viewer を FFB Bridge に許可しない。

## Bridge オプション

- `--backend moza-directinput`: MOZA R3 向けの符号付き constant magnitude 出力。既定。
- `--max-output 0.02..1.0`: Bridge 側の絶対上限。R3 の初期確認は既定 `0.40` を使い、必要なら `0.20` まで下げる。
- `--allow-origin <exact-origin>`: 非 localhost Viewer を 1 つだけ許可する。複数指定できる。

Bridge は `127.0.0.1` にのみ bind し、外部 PC からの接続を受けない。
