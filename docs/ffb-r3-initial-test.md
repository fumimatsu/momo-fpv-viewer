# MOZA R3 FFB Bridge: Initial Test Plan

## Status

Viewer-to-local-Bridge の初期実装、MOZA R3 の Acquire、constant force 出力確認は完了。現在は角度比例 torque の確認用実装を廃止し、基礎抵抗モデルを検証する段階である。

## Goal

Receive vehicle telemetry on the Viewer PC and add controlled force feedback (FFB) to a MOZA R3. The first milestone is a safe, standalone Windows test program. It must prove that the R3 accepts application-owned FFB before it is connected to live Momo telemetry.

This document covers the R3 reference implementation. The FFB bridge should remain vendor-neutral above the wheel driver layer so that a Logitech or Thrustmaster backend can be added later.

## Responsibility Split

```text
Vehicle MCU / Raspberry Pi
  -> telemetry v1 over Momo DataChannel
Viewer browser
  -> validates and exposes telemetry to local bridge
Windows native FFB bridge
  -> DirectInput FFB effects
MOZA R3
```

The browser is not the FFB output process. Browser Gamepad APIs read input but do not provide a reliable API to create Windows FFB effects. A native process on the same Windows PC owns the wheel device and is responsible for force output, watchdogs, and emergency stop.

## Pit House Role

Pit House is used for:

- device discovery, firmware updates, calibration, and saved wheel profiles;
- baseline mechanical feel that is independent of a game;
- limiting maximum base torque during development.

The useful baseline controls are `Mechanical Centering Strength`, `Mechanical Friction`, and `Mechanical Damping`. They have different behavior:

| Pit House setting | Meaning | Use during bridge development |
| --- | --- | --- |
| Mechanical Centering Strength | Return force increases away from the center. | Keep off during baseline resistance tuning. |
| Mechanical Friction | Constant steering resistance. | Keep off. Bridge owns baseline friction. |
| Mechanical Damping | Resistance increases with steering speed. | Keep off. Bridge owns baseline damping. |
| Maximum Output Torque Limit | Limits base torque. | Keep as the hardware safety cap. |

Pit House mechanical settings are a persistent base-layer effect. Dynamic RC-car events such as cornering load, slip, and impacts belong to the FFB bridge, not to a Pit House profile.

## Local Pit House Inspection (2026-07-21)

The development PC has Pit House installed at `C:\Program Files (x86)\MOZA Pit House`. The package includes:

- R3 HID identification: `VID_346E`, `PID_0005`, interface `MI_02`;
- MOZA USB and HID driver packages;
- `MOZADriverInterface.h/.lib/.dll`.

`MOZADriverInterface.h` exposes game-driver notification, key mapping, and virtual MOZA HID methods. It has no documented API for force, torque, spring, damping, friction, or DirectInput effects. Do not use it as the FFB bridge API.

The package also contains device services and driver internals, but their protocol is not a supported external contract. Do not reverse engineer or call them directly. Pit House updates could change them without compatibility guarantees.

At inspection time no connected R3 was visible in Windows Plug and Play records. A Pit House log or preset that mentions `R3` is not sufficient proof that the physical base is connected.

## Output API: Windows DirectInput

Use Windows DirectInput 8 for the R3 test implementation:

1. Enumerate attached devices with the force-feedback capability filter.
2. Select the expected R3 by device identity and record the actual instance GUID/name.
3. Verify `DIDC_FORCEFEEDBACK`, enumerate actuator objects and supported effects.
4. Acquire the device in the required exclusive mode.
5. Create and control DirectInput effects.

The initial effect mapping is:

| FFB behavior | DirectInput effect | Initial purpose |
| --- | --- | --- |
| Constant left/right steering torque | `GUID_ConstantForce` | Direction, sign, scaling, and stop verification. |
| Angle-dependent return force | `GUID_Spring` or `GUID_ConstantForce` | Future telemetry-driven model. |
| Speed-dependent resistance | `GUID_Damper` | Phase 1 baseline that increases with speedProxy. |
| Persistent rack resistance | `GUID_Friction` | Phase 1 baseline, strongest at low speedProxy. |
| Short impact or road vibration | `GUID_Sine` or short constant pulse | Verify transient effects before live telemetry. |

Supported effects must be discovered from the connected device. The bridge must not assume every DirectInput FFB device supports every effect.

References:

- [Microsoft DirectInput overview](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee418998%28v%3Dvs.85%29)
- [IDirectInputDevice8::CreateEffect](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee417880%28v%3Dvs.85%29)
- [MOZA Pit House user manual](https://support.mozaracing.com/en/support/solutions/articles/70000625635-moza-pit-house-user-manual)
- [MOZA wheel base FAQ](https://support.mozaracing.com/en/support/solutions/articles/70000627811-wheel-base-faqs)

## Safety Contract

- Mount the R3 securely. FFB output remains disabled until the operator explicitly enables it.
- Use a direct rear USB port on the Viewer PC. Do not use a USB hub for the base.
- The test program starts with no effect active.
- Every effect has bounded magnitude and duration.
- `StopAllEffects` is called when the program exits, loses device access, or receives an explicit stop command.
- A telemetry watchdog sends zero force when the local telemetry receive timestamp becomes stale. Telemetry stale must not be inferred from vehicle timestamps.
- A newly received telemetry message does not automatically re-enable force output after a stale or emergency-stop state. An explicit operator enable is required.

The telemetry watchdog behavior follows the telemetry v1 contract in the `momo-fpv` repository. For the final bridge, stale is `max(250 ms, 3 * telemetry period)` based on local monotonic receive time.

## Test Stages

### FFB-0: Pit House and Windows recognition

1. Connect the R3 directly to a rear USB port and power it on.
2. Confirm Pit House identifies the base and offers firmware/calibration controls.
3. Confirm the Windows device instance matches the expected R3 identity.
4. Save a `FPV-Bench` Pit House profile with mechanical centering/friction/damping disabled.

Acceptance: R3 is visible to both Pit House and Windows. No application FFB is active.

### FFB-1: DirectInput capability probe

Create a small native `ffb-lab` executable that prints:

- device name, instance GUID, VID/PID if available;
- force-feedback capability flags;
- actuator axes;
- supported DirectInput effect GUIDs;
- DirectInput and Windows error codes.

Acceptance: the R3 is enumerated and the executable can acquire it in the required FFB mode.

### FFB-2: Manual effects

Implement explicit, low-strength commands only:

1. short constant force left;
2. short constant force right;
3. low-strength centered spring;
4. short vibration/impact;
5. explicit stop-all.

Acceptance: direction is correct, all force stops on command and process exit, and no Pit House or game process competes for output.

### FFB-3: Telemetry replay

Feed recorded or synthetic telemetry v1 into the bridge without a live vehicle.

- cornering load: smooth resistance;
- slip: reduced resistance plus bounded shake;
- impact: a short pulse;
- stale / malformed / unknown telemetry: zero output.

Acceptance: each mapping can be tuned without vehicle firmware changes and stale handling is observable in logs.

### FFB-4: Viewer baseline integration

Input 設定画面で FFB を有効にして開いた Viewer は、スロットル/ブレーキ入力から平滑化した `speedProxy` を Bridge へ送る。speedProxy は実車速ではないため、GPS、ESC、光学速度、または IMU を含む推定器が導入されたら置き換える。

Bridge は `friction = base + lowSpeed * parking`、`damper = base + speed^2 * speedDamper` を合成する。停車時の重さは friction、走行時の粘りは damper で作り、baseline では方向性 torque を加えない。FFB を有効にして Viewer を開くと Bridge 接続と対応デバイスの Acquire までは自動で行うが、出力は `Drive On` の間だけである。`Drive Off`、切断、ページ離脱、Bridge 終了、250 ms の Bridge watchdog は constant torque と condition effect のすべてを停止する。手順は [../tools/ffb-bridge/README.md](../tools/ffb-bridge/README.md) を参照する。

Viewer は raw wheel torque を任意に送らない。Bridge が device Acquire、基礎抵抗の合成、effect 更新、出力 clamp、停止を所有する。テレメトリーを使う段階では、横G、ヨーレート、上下加速度の帯域別特徴量、衝撃イベントを正規化済み入力として追加する。

## Implementation Decision

Build the initial `ffb-lab` and production bridge as a native Windows application using DirectInput 8. Keep MOZA-specific work limited to discovery, diagnostic reporting, and Pit House profile guidance. Do not block the initial test on a MOZA SDK or on private Pit House interfaces.
