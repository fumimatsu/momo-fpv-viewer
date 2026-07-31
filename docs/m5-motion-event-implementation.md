# M5StickS3 走行イベントと FFB 実装計画

## 実走ログの確認結果

2026-07-26 に 11.6 から記録した走行ログを確認した。音声併用の RAW 診断は 15 Hz で、通常走行・縁石・大きな衝突のいずれでも telemetry sequence の連続受信を確認した。ブラウザ音声の断続はあったが、Observer 音声と telemetry の欠落とは一致していない。

M5 の取付方向と実走の急発進・急制動・左右旋回から、車体 FLU 座標は次で確定した。

```text
forward acceleration = imu.a[2]
lateral acceleration = imu.a[0]  // 正は左
vertical acceleration = imu.a[1] - 9.80665
yaw rate = imu.g[1]              // 正は左旋回
```

記録全体の観測極値は、前後 `-24.9 .. +11.0 m/s2`、左右 `-14.6 .. +9.0 m/s2`、重力除去後の上下 `-9.1 .. +9.9 m/s2`、ヨー `-3.00 .. +2.64 rad/s` だった。これらは走行区間だけでなく停止・持ち上げ・衝撃を含む。数値だけで物理的な衝突種別を確定してはいけない。

## 責務分担

| 層 | 実装すること | 実装しないこと |
| --- | --- | --- |
| M5StickS3 | PWM、failsafe、NeoPixel、急制動灯、compact state と時刻・連番、IMU 高頻度の衝撃候補送信 | 衝突種別の確定、FFB 用振動波形の送信 |
| Pi / Relay | DataChannel 中継、NDJSON 保存、接続監視 | 物理判定、FFB パラメータ合成 |
| Viewer | 車体座標変換、鮮度・連番検証、コーナリング荷重、impact candidate、運転者ごとの FFB 値 | 絶対速度・スリップの断定 |
| FFB Bridge | DirectInput 効果の適用、出力上限、watchdog、停止 | ネットワーク越しの生 IMU を直接振動へ変換 |

M5 は高頻度 IMU から `impact_candidate` を発火時だけ送る。常時 state を増やすより UART 負荷は小さいが、候補には縁石や振動も混ざる。最終的な段階判定と FFB への反映は Viewer が担当する。

## 通常 telemetry と raw diagnostic

通常走行では M5 が v2 compact state を送る。`m.a`は`[forward,left,up]`、`m.y`はyaw rateであり、Viewerが座標変換する必要はない。M5は高い IMU 更新周期で衝撃候補を検出し、発火時だけ v2 event `impact_candidate` を送る。

分析時は USB Serial で `TELEMETRY:RAW` を指定し、従来の v1 sensor 軸 state を 15 Hzで送る。これは音声と同じUARTを圧迫しにくく、生データとcompact導出値を比較するためのモードである。`TEL drop` と `AUDIO drop` が増える場合は10 Hzへ戻す。

## 実装済みの Viewer 機能

`telemetry.js` の `MotionFeatureExtractor` は v2 compact state、または`qual.flags` に `flu_axes` があるv1 raw stateだけを受理する。

- `cornerLoad`: 左右加速度とヨーが同じ向きで、両方がしきい値を超えた時の 0..1 荷重。80 ms attack / 160 ms release で平滑化する。
- `impactCandidate`: Viewer の RAW 再計算と、M5から発生時だけ届く event を受ける。Viewer の段階判定は `weak` が `10 m/s2` 以上、`strong` が `12 m/s2` 以上かつ jerk `250 m/s3` 以上、`severe` が `18 m/s2` 以上。通常の高速旋回を衝撃と誤認しないため、RAW の横 G 単独ではヨーがほぼ無い場合だけ候補にする。
- 再アーム: 一度受理した後は、合成加速度が `5 m/s2` 未満の状態が 500 ms 続くまで、同程度以下の候補を抑制する。強度が上がった候補だけは同じ衝突中でも更新する。
- `Motion` debug OSD: コーナリング荷重、横加速度、ヨー、直近イベントの段階を表示する。通常 OSD は中央上部に `CURB / LIGHT HIT`、`IMPACT`、`HEAVY IMPACT` を 1.8 秒表示する。

`impactCandidate` は衝突、縁石、ジャンプ、転倒、手で持ち上げた操作を区別しない。レースのペナルティ、クラッシュ判定、走行中断には使用しない。

## FFB の段階

Phase 1 の throttle 由来 friction / damper は維持する。Viewer は鮮度が有効な `cornerLoad` に比例して damper と有界な方向トルクを加える。前荷重は throttle 操作から推測せず、車体前後加速度が `-3.0 m/s2` を下回った時に立ち上げ、`-7.0 m/s2` で最大にする。

前荷重は左右に引くトルクではない。telemetry stale 時は減衰して 0 へ戻り、片側へ回り続ける原因を増やさない。

| 効果 | 現段階 | 条件 |
| --- | --- | --- |
| 旋回時の重さ | 実装 | fresh `cornerLoad` に比例する damper 増分 |
| 旋回反トルク | 実装 | freshな左右加速度と`cornerLoad`から有界な反対方向トルクを生成 |
| 自己復元トルク | 未実装 | 実速度または十分な速度信頼度が必要 |
| 路面振動 | 未実装 | 上下加速度を帯域分離し、Bridge 側で生成する |
| 前荷重 | 実装 | 実測減速Gだけから friction / damper を増加。アクセル戻しとブレーキ指令は使わない |
| 衝撃パルス | 実装 | Viewerが段階と方向を決め、Bridgeが縁石・側面・正面の短い往復トルクを通常FFBへ加算する |
| スリップ | 未実装 | ESC RPM / encoder など実測速度が必要 |

## 次の実走検証

1. 新しい `flu_axes` firmware を M5StickS3 へ書き込み、Viewer debug OSD の `Motion` が `waiting` 以外になることを確認する。
2. 左右一定旋回を各 3 回行い、`Cxx L/R` の向きと増減を確認する。
3. 低速の縁石、明確な軽衝突、強い衝突を別々に記録する。動画時刻と `impactCandidate` の時刻を照合する。
4. FFB は Weak から開始し、旋回中だけ重くなること、`strong` / `severe` で一瞬だけ抵抗が増すこと、Drive Off・停止・通信停止で即時に余分な抵抗が消えることを確認する。
