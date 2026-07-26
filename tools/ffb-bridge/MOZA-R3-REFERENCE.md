# MOZA R3 FFB 参照値

J-DRIFT で使われていた MOZA R3 + Windows DirectInput Local Bridge の設定を、Momo FPV Viewer の FFB 初期調整に使うためのメモである。

J-DRIFT と Momo は FFB の入力が異なる。J-DRIFT は車両物理のステアリング軸トルク、前輪荷重、スリップ、ヨーレートを使う。Momo は現時点で RC 操作値とスロットル由来の `speedProxy` しか持たない。数値をそのままコピーして同じ感触になる前提は誤りである。

## 参照元の R3 構成

| 項目 | 参照値 | Momo への扱い |
| --- | ---: | --- |
| 出力経路 | Local Bridge → Windows DirectInput | 同じ。Bridge は `moza-directinput` を使う |
| effect mode | constant | 同じ |
| master gain / max force | `1.00` / `1.00` | Bridge の `-MaxOutput 1.0` に相当 |
| smoothing | `0.20` | Momo には未導入。実ハンドル角を受信するまで追加しない |
| SAT gain | `0.50`、反転 ON | Momo の synthetic centering とは別物。移植しない |
| damper gain | `0.25` | 走行時ダンパーの到達値に使う |
| low-speed static friction | `0.405` | 停車時フリクションの目標値に使う |
| low-speed gain / SAT | `0.20` / `1.50`、反転 ON | 物理速度・ラックトルクがないため移植しない |
| drift guide / road / collision FX | 各種有効 | 車両テレメトリ未実装のため移植しない |
| R3 の極性 | SAT、低速、ドリフトガイドは個別反転 | Momo ではまず `センタリング方向を反転` を ON にする。実機テストで逆なら OFF にする |

## Momo FPV の R3 初期設定

`gamepad.html` の対象デバイス別プロファイルに、次を保存する。FFB 強度は `中` を選ぶ。`強` を選ぶと下記の値へさらに 1.35 倍を掛けるため、参照値との比較ができなくなる。

| Input 画面の項目 | 設定値 | 算出根拠 |
| --- | ---: | --- |
| Drive On 中に FFB を有効化 | ON | 明示的に有効化する |
| FFB 強度 | `中` | 係数 `1.00` |
| 基礎フリクション | `0.30` | 停車時だけの値ではなく、走行中にも残す粘り |
| 低速フリクション | `0.10` | 停車時は `0.30 + 0.10 = 0.40`。参照値 `0.405` に合わせる |
| 基礎ダンパー | `0.07` | 低速から残す回転抵抗 |
| 速度ダンパー | `0.18` | 最大 speedProxy 時は `0.07 + 0.18 = 0.25`。参照値に合わせる |
| 走行時センタリング | `0.20` | 既定値を維持。SAT 0.50 を代入してはならない |
| センタリング方向を反転 | ON | R3 の符号付き constant magnitude 出力での初期値 |
| Bridge URL | `ws://127.0.0.1:24725` | Bridge と Pilot Viewer が同じ PC の時だけ使える |

この値は「R3 の最初の確認値」であり、完成値ではない。R3 の実機で、センターへ戻る力が常に片側へ出る場合は、数値ではなく符号・実ハンドル角入力・DirectInput 出力方式の問題を先に調べる。フリクションやダンパーを増やして隠してはいけない。

## 現時点で導入しない値

次の値は、RC 操作信号だけで偽装しても意味がない。MADSYSTEM または車体テレメトリから必要な物理量を取れるようになってから実装する。

- SAT、前輪荷重、グリップ、スリップ、rack torque
- カウンター角ガイド、ヨーレート、ボディスリップ
- 縁石、グラベル、衝突の振動
- ブレーキ時の前輪振動

必要になる入力と FFB の責務を混ぜない。Pilot Viewer は操作・表示、Bridge は DirectInput 出力、車両物理由来 FFB の合成は将来のテレメトリ層で行う。
