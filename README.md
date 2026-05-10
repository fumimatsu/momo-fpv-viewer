# Momo FPV Viewer

Momo FPV RC 用の静的 Viewer です。

この repository には Raspberry Pi 側の設定、Momo binary、roomId、signaling key、運用メモは入れません。

## Ayame Viewer

GitHub Pages:

```text
https://fumimatsu.github.io/momo-fpv-viewer/viewer.html?signaling=ayame&roomId=<room>&id=<device>&deviceStatus=off&autoReconnect=1&videoReconnect=1&clientId=auto
```

例:

```text
https://fumimatsu.github.io/momo-fpv-viewer/viewer.html?signaling=ayame&roomId=momo-fpv-02-20260505-a8f3k9&id=FPV-02&deviceStatus=off&autoReconnect=1&videoReconnect=1&clientId=auto
```

`roomId` はイベントや検証ごとに変えます。固定 roomId を公開すると、その URL を知っている人が車体を操作できます。

## iPhone

Safari で Viewer URL を開き、必要なら共有メニューから `ホーム画面に追加` します。

Mode / Status API は LAN 内の Raspberry Pi へ直接アクセスするため、外部公開 URL では使わない前提です。DriveON と RC 操作は WebRTC DataChannel で送るため、Ayame 接続が成立すれば動作します。

## Gamepad / Wheel

`gamepad.html` でブラウザに見えている Gamepad / ハンコン入力を確認し、軸とボタンの mapping を保存できます。保存先は同じブラウザの `localStorage` です。

Viewer の Debug 表示で `Input` を押すと Drive Off に戻して `gamepad.html` を開きます。Viewer は URL パラメータを優先し、指定がない項目だけ保存済み mapping を使います。

