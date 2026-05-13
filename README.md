# Momo FPV Viewer Client

このディレクトリは、Momo P2P の映像をブラウザで見るための配布用クライアント一式です。

## 内容

- `viewer.html`
- `viewer.js`
- `start-viewer.ps1`
- `start-viewer.bat`
- `start-viewer.sh`

`viewer.html` を直接開くのではなく、同梱スクリプトでローカル HTTP サーバーを起動してから開きます。

## Windows

PowerShell:

```powershell
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080
```

コマンドプロンプト:

```bat
start-viewer.bat 192.168.11.2:8080
```

## macOS / Linux

```sh
chmod +x ./start-viewer.sh
./start-viewer.sh 192.168.11.2:8080
```

## 別デバイスへ接続する

例:

```sh
./start-viewer.sh 192.168.11.3:8080
./start-viewer.sh 192.168.11.4:8080
```

Windows:

```powershell
.\start-viewer.ps1 -HostAddress 192.168.11.3:8080
```

## 前方 / 後方カメラ

現在の 2 台構成では、前方カメラを `192.168.11.2`、後方カメラを `192.168.11.3` として扱います。後方カメラはバックミラー表示なので `mirror=1` を使います。

Windows:

```powershell
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080
.\start-viewer.ps1 -HostAddress 192.168.11.3:8080 -Mirror
```

macOS / Linux:

```sh
./start-viewer.sh 192.168.11.2:8080
MIRROR=1 ./start-viewer.sh 192.168.11.3:8080
```

iPhone でホーム画面に追加する場合は、以下を Safari で開いてから追加します。

```text
http://192.168.11.2:8080/html/fpv-viewer.html#flip=1
http://192.168.11.3:8080/html/fpv-viewer.html#flip=1&mirror=1
```

## 主要オプション

Windows PowerShell:

```powershell
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080 -DebugOsd
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080 -NoFlip
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080 -Mirror
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080 -DeviceStatus off
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080 -DeviceStatus debug
.\start-viewer.ps1 -HostAddress 192.168.11.2:8080 -VideoReconnect
```

macOS / Linux:

```sh
DEBUG=1 ./start-viewer.sh 192.168.11.2:8080
FLIP=0 ./start-viewer.sh 192.168.11.2:8080
MIRROR=1 ./start-viewer.sh 192.168.11.2:8080
DEVICE_STATUS=off ./start-viewer.sh 192.168.11.2:8080
DEVICE_STATUS=debug ./start-viewer.sh 192.168.11.2:8080
VIDEO_RECONNECT=1 ./start-viewer.sh 192.168.11.2:8080
```

## 初期値

- 接続先: `192.168.11.2:8080`
- ローカルサーバー: `127.0.0.1:18080`
- Debug OSD: off
- Device status: off
- Auto reconnect: on
- Video reconnect: off
- Flip: on
- Mirror: off

`Device status` は Pi 側の `momo-status.service` が `8090/status` を返す前提です。初期値は `off` なので、通常起動では Status API を呼びません。Device 情報は Debug OSD を ON にして `Refresh Device` を押した時だけ `8090/status` から取得します。Mode は Debug OSD を ON にして `Refresh Mode` を押した時だけ `8090/mode` から取得します。Pi Zero 2 W では Status API の常時取得は負荷や切り分けが難しくなるため、通常運用では使いません。

後方カメラをバックミラーとして使う場合は `mirror=1` を指定します。`flip=1` は 180 度回転、`mirror=1` は左右反転なので、取り付け向きとミラー表示を別々に切り替えられます。

カメラ画質は Pi 側の Momo 起動時に `ExposureValue=-0.5;Contrast=1.1` を固定で渡します。白飛びを抑えつつ暗部を潰しすぎない、現在の前方 / 後方カメラ共通の基準値です。

## 複数台 Monitor

映像を受信せず、複数台の状態だけをタイル表示するページがあります。

```text
http://127.0.0.1:18080/monitor.html#hosts=192.168.11.2,192.168.11.3
http://192.168.11.2:8080/html/monitor.html#hosts=192.168.11.2,192.168.11.3
```

Monitor は各 Pi の `8090/status` を 2 秒ごとに取得します。ブラウザから ICMP ping はできないため、Status API の HTTP 応答時間を `RTT` として表示します。

表示項目:

- Online / Down / Warn
- Hostname
- HTTP RTT
- Mode
- Wi-Fi 周波数 / RSSI / signal
- 電源低電圧フラグ
- CPU 温度
- Device 時刻
- Viewer / Status へのリンク

Status API が落ちている、電源が落ちている、Wi-Fi から消えている、のような状態を映像なしで俯瞰するためのページです。映像遅延や黒画面の検出まではしません。

## iPhone ホーム画面起動

iPhone で Safari の UI を減らして表示する場合は、Safari で Viewer を開いて共有メニューから `ホーム画面に追加` します。
Viewer には iOS 用の web app meta、manifest、icon、safe area 対応を入れています。

後方カメラをミラー表示するショートカットを作る場合は、ホーム画面に追加する前に `mirror=1` 付きの URL を開いてください。

## 映像モード切替

Debug OSD を有効にすると、右上に `Mode` 選択が表示されます。
`Refresh Mode` を押すと Pi 側の `8090/mode` から現在の preset と一覧を取得します。
`Apply` を押すと Pi 側の `8090/mode` に preset 名を送り、Momo を再起動します。
Audio 入り preset は capture device が見えている Pi だけに表示します。

切替可能な preset:

- `960x528 50fps`
- `960x528 50fps + Audio`
- `960x528 60fps`
- `960x528 60fps + Audio`
- `1280x720 50fps`
- `1280x720 50fps + Audio`
- `1280x720 60fps`

切替時は数秒映像が止まります。通常運用では `960x528 60fps` または `1280x720 50fps` を優先し、`1280x720 60fps` は検証用です。Audio 入り preset は遅延と CPU 負荷が増えるため、音が必要な検証時だけ使います。
現在の preset は WebRTC の品質適応時に解像度を優先するため、Pi 側で `--priority RESOLUTION` と `--fixed-resolution` を指定します。

## RC コマンド送信

Viewer は DataChannel で `S:1500,T:1500` 形式の RC コマンドを送れます。

- `Drive Off / Drive On`: DataChannel が開いている間、現在の S/T 値を 50Hz で送信
- 左下の steering slider: `1000` から `2000`
- 右下の throttle slider: `1300` から `2000`

操縦コマンド用の DataChannel は `ordered: false` / `maxRetransmits: 0` で作成します。古い操作値を再送して遅れて届けるより、最新の操作値を詰まらせずに届けることを優先します。

`Drive` が ON の時だけ、キーボード入力でスライダー値を変更します。

- 左右: steering
- 上下: throttle
- Space: neutral

送信周期や操作量は URL パラメータで調整できます。

```text
rcTxMs=20
rcSteeringThrow=400
rcThrottleThrow=300
rcThrottleMin=1300
rcBrakeValue=1300
rcBrakeMs=1000
rcBrakeThreshold=1600
osdMs=100
```

Throttle は前進側で `rcBrakeThreshold` を超えた状態から離した場合だけ、`rcBrakeValue` を `rcBrakeMs` だけ送ってから `1500` に戻します。バック側から離した場合はブレーキ入力を入れずに `1500` へ戻します。

OSD 表示は RC 送信周期とは分離し、時間経過系の表示だけを初期値 10Hz で更新します。Telemetry 本体は DataChannel の `TEL:` 受信イベントで即時更新します。

Momo 側は 1Hz で `TEL:alive` を送ります。周波数、RSSI、温度、core 電圧、低電圧フラグは Pi 側で 5 秒に 1 回だけ取得し、直近値を telemetry に載せます。Viewer はこの telemetry を受け取った時に Debug OSD の Device 行も更新します。Status API の常時取得は使いません。

Debug OSD が ON の時だけ、Viewer は DataChannel で 1Hz の `PING` を送り、Momo が `PONG` を返します。OSD の `DC RTT` はこの往復時間です。デバイス側の時刻同期は不要ですが、これは映像の片道遅延ではなく、DataChannel の往復遅延です。

## ブラウザで直接開く URL

ローカル HTTP サーバー経由:

```text
http://127.0.0.1:18080/viewer.html?host=192.168.11.2:8080
```

Momo の `8080/html` から直接開く場合は、query string ではなく hash を使います。ここを間違えると、Momo が `fpv-viewer.html?debug=...` というファイルを探して `The resource ... was not found.` になります。

Pi 側へ置くファイルは repo の `device-html/` にあります。`client/viewer.html/js` を直接 Pi へ置くのではなく、`device-html/fpv-viewer.html/js` を使います。
Momo の静的ファイル配信では JS 参照の `?v=...` も `404` になるため、`device-html/fpv-viewer.html` は query string なしで `fpv-viewer.js` を読みます。

```text
http://192.168.11.2:8080/html/fpv-viewer.html#debug=0&deviceStatus=off&autoReconnect=1&flip=1
http://192.168.11.3:8080/html/fpv-viewer.html#debug=0&deviceStatus=off&autoReconnect=1&flip=1&mirror=1
```

Debug OSD が OFF の時、Viewer は `Host` ではなく公開用の `ID` を表示します。`192.168.11.2` は `FPV-02`、`momo-fpv-02` は `FPV-02` に変換されます。Tailscale IP などから個体番号を推定できない場合は、URL に `id` を足してください。

```text
http://100.79.88.76:8080/html/fpv-viewer.html#id=FPV-02
```

ローカルサーバー起動スクリプトでは次のように指定できます。

```powershell
.\start-viewer.ps1 -HostAddress 100.79.88.76:8080 -DeviceId FPV-02
```

```sh
DEVICE_ID=FPV-02 ./start-viewer.sh 100.79.88.76:8080
```

これは間違いです:

```text
http://192.168.11.2:8080/html/fpv-viewer.html?debug=0&deviceStatus=off&autoReconnect=1&flip=1
```

初期値は `debug=0`、`videoReconnect=0`、`autoReconnect=1`、`deviceStatus=off`、`flip=1`、`mirror=0` です。`stun` は P2P では `0`、Ayame では `1` が既定値です。ローカル LAN で使う限り、通常は `host` 以外の指定は不要です。

## Ayame 試験

Pi 側の `run_momo_clean.sh` は `MOMO_SIGNALING_MODE` で `p2p` と `ayame` を切り替えます。初期値は `p2p` です。Ayame を試す時は `/momo/momo-mode.env` に Ayame 用の値を追加してから `momo.service` を再起動します。テンプレートは `tools/raspi/momo-mode-ayame.example.env` です。

```sh
MOMO_SIGNALING_MODE="ayame"
MOMO_AYAME_SIGNALING_URL="wss://133.88.123.51.nip.io/signaling"
MOMO_AYAME_ROOM_ID="momo-fpv-02"
MOMO_AYAME_CLIENT_ID="momo-fpv-02"
MOMO_AYAME_SIGNALING_KEY=""
MOMO_AYAME_DIRECTION="sendrecv"
```

`MOMO_AYAME_ROOM_ID` は必須です。実運用で signaling key を使う場合、その値は Git に入れません。P2P に戻す時は `MOMO_SIGNALING_MODE="p2p"` に戻して `momo.service` を再起動します。

FPV Viewer で映像を受ける場合、現時点では `MOMO_AYAME_DIRECTION="sendrecv"` を使います。`sendonly` は自然に見えますが、Momo 2025.1.0 の Ayame 交渉では Viewer が offer 側になった時に video が `inactive` で answer され、DataChannel だけ開いて映像が来ない状態になります。

Raspberry Pi 側が Ayame Labo へ IPv6 で接続すると、環境によって `SYN-SENT` のまま詰まることがあります。この場合、Viewer は `Last ayame accept: waiting` になり、Momo 側 metrics には `outbound-rtp` が出ません。11.2 では `/etc/gai.conf` に次を追加して IPv4 を優先しました。

```text
precedence ::ffff:0:0/96  100
```

正常時の確認ポイント:

```text
ss -tnp | grep momo
# 192.168.11.2:<port> 172.233.91.194:443 ESTAB

curl http://127.0.0.1:8081/metrics
# outbound-rtp kind=video
# framesPerSecond 50
# dataChannelsOpened 2
```

切り分け:

- `Last ayame accept: waiting`: Viewer は Ayame に入っているが、Momo が同じ room に見えていません。Pi 側の Ayame 接続、roomId、IPv4 / IPv6 経路を見ます。
- `ICE connected / DataChannel open / Video waiting`: WebRTC は成立していますが video SDP が `inactive` の可能性があります。`MOMO_AYAME_DIRECTION` が `sendrecv` か確認します。
- `WebSocket open / ICE new / DataChannel closed`: Ayame signaling は開いていますが、WebRTC 交渉前です。room の相手待ちか、Momo が Ayame に未登録です。

Momo 2025.1.0 へ入れている最小修正は `tools/raspi/patches/momo-2025.1.0-ayame-fpv.patch` に残しています。Momo 本体ソースはこの repo には含めません。

`systemctl restart momo.service` 時に Momo が SEGV / BUS で落ちる問題は、core dump と gdb で停止経路を確認しました。原因は `LibcameraCapturer` の破棄順で、camera / manager を release した後に allocator が破棄され、libcamera 内部の `Thread::postMessage()` に入って落ちていました。`Release()` 内で `StopCapture()`、request / buffer / allocator / configuration の破棄、camera release の順に変えた修正を patch に含めています。

core dump を取る設定:

```ini
[Service]
LimitCORE=infinity
```

配置先:

```text
/etc/systemd/system/momo.service.d/20-core.conf
```

確認:

```sh
systemctl daemon-reload
systemctl show momo.service -p LimitCORE
cat /proc/$(pgrep -x momo | head -n1)/limits | grep -i 'core file'
```

11.2 では修正版 binary で `systemctl restart momo.service` を 4 回実行し、`SEGV`、`BUS`、`core-dump`、`Camera in Running state trying release()` が出ないことを確認しました。

Viewer 側は `signaling=ayame`、`roomId`、必要なら `signalingKey` を指定します。Ayame mode の Momo は P2P 用の `8080/html` を配信しないため、Viewer は PC 側のローカル HTTP サーバーから開きます。

`clientId` は未指定または `auto` の場合、Viewer 起動ごとに自動生成します。固定すると Ayame 側に古いセッションが残った時に接続待ちになりやすいため、検証時に固定する理由がない限り指定しません。

```text
http://127.0.0.1:18080/viewer.html?signaling=ayame&roomId=momo-fpv-02&id=FPV-02&deviceHost=192.168.11.2
```

`host` は P2P 用です。Ayame では接続先に `ayameUrl` を使います。省略時は `wss://133.88.123.51.nip.io/signaling` です。通常運用では URL に `ayameUrl` を入れません。`Mode Refresh` などの status API は WebRTC signaling とは別経路なので、Ayame で使う場合は `deviceHost` または `statusBaseUrl` で Pi の `8090` へ向けます。

Windows の起動スクリプトから開く場合:

```powershell
.\start-viewer.ps1 -Signaling ayame -RoomId momo-fpv-02 -DeviceId FPV-02
```

外部回線で ICE が `checking` のまま止まる場合は STUN だけでは足りません。ConoHa VPS 上に OpenAyame と coturn を置く構成は `../docs/ayame-vps-turn.md` に残しています。

macOS / Linux の起動スクリプトから開く場合:

```sh
SIGNALING=ayame ROOM_ID=momo-fpv-02 DEVICE_ID=FPV-02 ./start-viewer.sh
```

iPhone で Ayame Viewer を開く場合、Momo / Pi を global に公開する必要はありません。ただし `viewer.html` と `viewer.js` は iPhone から読める場所に置く必要があります。同一 LAN なら PC または Pi で静的 HTTP サーバーを `0.0.0.0` bind で起動し、iPhone から `http://<server-ip>:18080/viewer.html?...` を開きます。外部回線から使う場合は、GitHub Pages / Cloudflare Pages / Netlify などに Viewer だけを静的配置するか、iPhone も Tailscale に入れて LAN 側の Viewer サーバーへアクセスします。`deviceHost=192.168.11.2` は LAN / Tailscale 内でしか status API に届きません。Ayame の映像自体は status API と別経路です。

GitHub Pages 用には `.github/workflows/deploy-pages.yml` で `client/` をそのまま配信します。公開 URL の形は以下です。

```text
https://fumimatsu.github.io/momo-fpv/viewer.html?signaling=ayame&roomId=<room>&id=<device>&deviceStatus=off&autoReconnect=1&clientId=auto
```

外部の人に操作させる場合は、`Mode Refresh` と `Device status` は使わない前提にします。DriveON と RC 操作は DataChannel だけで動くため、Viewer が GitHub Pages 上にあっても成立します。

固定 roomId を公開すると、その URL を知っている人が車体を操作できます。イベントや検証ごとに推測しにくい roomId を払い出し、SNS や public issue に残さないでください。signaling key を使う場合は、URL に入れた時点で共有相手へ見えます。秘匿が必要なら URL 配布だけで守る設計は弱いです。

## 必要なもの

- Chrome / Edge / Safari / Firefox のいずれか
- Python 3
- Viewer PC から Raspberry Pi の `8080` へ到達できること
- Device status を使う場合は Raspberry Pi の `8090` へ到達できること
