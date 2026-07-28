# Pilot 操作プリセット

## 目的

Relay Pilot は、スマホのタッチ操作、ハンコン操作、接続しない UI 確認を同じ `pilot.html` で扱う。入力方式は異なっても、実車を操作する時の RC 経路は共通である。

```text
スマホのタッチ操作 / ハンコン
  -> Relay Pilot
  -> momo-command DataChannel
  -> Relay
  -> 車体側 Momo
  -> RC
```

`momo-drive` は Relay の走行ログ開始・停止を通知する別 DataChannel であり、RC コマンドの経路ではない。実車を動かすプリセットでは、`momo-command` が `open` になってから Drive On を操作する。

この文書中の `<PILOT_URL>` は、接続先 Relay が配信している Pilot ページの URL を指す。接続先を URL に直接書く場合は、既に使えている Pilot URL を基点にして query を追加する。ローカルの Viewer 正本を確認する場合だけ、例えば `http://127.0.0.1:18080/variants/relay/pilot.html` を使う。

## プリセット

| 用途 | URL の query | 操作開始条件 | 出力 |
| --- | --- | --- | --- |
| スマホ | `signaling=relay&autoStart=1&controlUi=manual&gamepad=0&ffbEnabled=0` | DataChannel が `open`、Drive On | タッチ UI の RC コマンド |
| ハンコン | `signaling=relay&autoStart=1&controlUi=drive&gamepad=1` | DataChannel が `open`、Drive On | ハンコンの RC コマンド。FFB は保存済みの入力 profile が有効な場合だけ出力 |
| ローカル UI テスト | `signaling=relay&autoStart=0&autoReconnect=0&controlUi=manual&gamepad=0&ffbEnabled=0&driveUiTest=1` | なし。Drive On は表示確認だけ | RC、`DRIVE:`、FFB を出力しない |

### スマホ

```text
<PILOT_URL>?signaling=relay&autoStart=1&controlUi=manual&gamepad=0&ffbEnabled=0
```

- `controlUi=manual` はスライダーと Drive ボタンを表示する。
- `gamepad=0` はスマホのブラウザが持つ Gamepad API を使わない。
- `ffbEnabled=0` は、この URL で開く限り PC に保存されたハンコン profile があっても FFB を出力しない。
- 接続完了前の Drive On は無効である。これはハンコンの有無ではなく、車体への RC 経路が未接続であることを示す。
- Drive On 後、スライダーの pointer 操作が `momo-command` へ送られ、指を離すと対象軸をニュートラルへ戻す。

### ハンコン

```text
<PILOT_URL>?signaling=relay&autoStart=1&controlUi=drive&gamepad=1
```

- `controlUi=drive` はハンコン向けの Drive HUD を常時表示する。
- 軸、ペダル、Drive ボタン、デッドゾーンは `gamepad.html` で保存した VID/PID ごとの profile を使う。
- FFB は URL では有効化しない。利用する PC で profile の `ffbEnabled` を有効にし、Bridge と安全設定を確認してから使う。
- DataChannel が閉じた時、Drive On と FFB 出力は有効にならない。

### ローカル UI テスト

```text
<PILOT_URL>?signaling=relay&autoStart=0&autoReconnect=0&controlUi=manual&gamepad=0&ffbEnabled=0&driveUiTest=1
```

- `autoStart=0` のため、Relay への接続を開始しない。CONNECT は `TEST MODE` と表示されて無効になり、コードからの接続開始も拒否する。
- `driveUiTest=1` は `autoStart=0` と併用した時だけ有効である。
- Drive On / Off の表示、タッチ UI、Race HUD の配置を確認できる。必要なら `raceBattleDemo=1` を追加する。
- RC コマンド、Relay の `DRIVE:` 状態、FFB はいずれも送信しない。実車接続テストの URL と混在させない。

## 運用順序

### スマホとハンコン

1. 該当する実運用プリセットで Pilot を開く。
2. `Link` と DataChannel が接続済みになるまで待つ。
3. 車体が安全に固定され、スロットルが中立であることを確認する。
4. Drive On を操作する。
5. 操作終了時は Drive Off を操作してから切断する。

Relay は Pilot のコマンドが途絶えると中立を上流へ送る。これは操作終了を代替するものではないため、通常の終了は必ず Drive Off を使う。

### URL を使わない運用への移行案

URL の直接編集は、`autoStart=0` のまま実車接続を試す、またはスマホで FFB を有効にするような操作ミスを招く。運用を定着させるなら、次の順で進める。

1. まずは上記三本の URL をブックマークとして配布する。接続先だけは環境ごとに置き換える。
2. 次に `pilot-launcher.html` を追加し、スマホ、ハンコン、UI テストの三つを選ぶだけで Pilot を開けるようにする。Relay host は Launcher の設定として保持し、Drive On や RC 操作は Launcher に持たせない。
3. レース運用で URL 配布をなくす必要が出た時だけ、Race Control が Pilot 起動リンクを発行する。Pilot の入力モードはそのリンクの短期 token またはレース設定から決め、通常の URL パラメータは診断用途に限定する。

現段階では 1 を正規運用とし、2 は操作回数と設定ミスが問題になった時に実装する。DataChannel を使わない実車操作経路は追加しない。
