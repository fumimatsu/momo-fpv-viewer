# FPV RC FFB Telemetry Feature Roadmap

## Status

Design decision, not implemented.

This document defines the telemetry-derived FFB stages after the current Phase 1
baseline resistance. It applies the useful parts of the rFactor RealFeel model:
separate physical input, signal conditioning, vehicle-specific tuning, output
mixing, and logging. It does not copy RealFeel's rack-force formula because an
FPV RC car does not currently measure steering-rack force.

References:

- [RealFeel FFB Plugin parameter and diagnostic description](https://www.overtake.gg/downloads/real-feel-ffb-plugin-0-938-by-techade.68428/)
- [rFactor Internals Plugin force-feedback interface](https://www.rfactor.net/downloads/rFactorInternalsPlugin.pdf)
- [Current vehicle-feel baseline](ffb-vehicle-feel-design.md)

## Decisions

1. Do not reintroduce a fixed, steering-angle-only centering spring.
2. Keep the current Phase 1 `friction` and `damper` model as the only live
   output until telemetry replay has been reviewed.
3. Add directional torque only as a telemetry-derived `alignTorque`: it is zero
   while stopped, when telemetry is stale, and when the car is not carrying
   cornering load.
4. Keep sensor validity and coordinate-frame work on the vehicle. Keep driver
   feel tuning in the Viewer. Keep DirectInput timing, limits, effect ownership,
   and emergency stop in the native Bridge.
5. Establish recorded-data replay before enabling any new live torque effect.

## Current Baseline

Phase 1 is already implemented and remains unchanged.

```text
friction = baseFriction + parkingFriction * (1 - speedProxy)^2
damper   = baseDamper + speedDamper * speedProxy^2
torque   = 0
```

`speedProxy` is an input-derived estimate, not measured vehicle speed. The
current tuning defaults are recorded in [ffb-vehicle-feel-design.md](ffb-vehicle-feel-design.md).

## Signal Ownership

```text
Vehicle sensor node / Raspberry Pi
  IMU calibration, vehicle coordinate frame, gravity compensation,
  impact detection, timestamps, quality flags
       -> telemetry
Viewer
  validation, feature extraction, vehicle profile, replay, normalized commands
       -> localhost Bridge
Native FFB Bridge
  local update timing, effect mixing, device capability checks, clamp, watchdog
       -> DirectInput wheel
```

The vehicle must not send raw high-frequency vibration specifically for direct
wheel playback. It may send raw IMU state during investigation, but the final
transport should contain low-bandwidth envelopes and deduplicated events. The
Bridge synthesizes the final vibration locally so network jitter cannot become
wheel jitter.

## Candidate Inputs

| Signal | Present state | FFB use | Notes |
| --- | --- | --- | --- |
| `imu.a[3]` | telemetry v1 | lateral/vertical acceleration | Its physical unit and axis convention must be recorded, then transformed into a verified vehicle frame and gravity compensated. |
| `imu.g[3]` | telemetry v1 | yaw rate, impact corroboration | Its physical unit and axis/sign convention must be recorded before conversion to the internal yaw-rate unit. |
| `att.q`, `att.rpy` | telemetry v1 | gravity compensation | Never use raw accelerometer values as vehicle acceleration without this step. |
| steering command | Viewer | initial steering angle proxy | Replace with actual servo angle when available. |
| throttle / brake | Viewer | Phase 1 speed proxy | Do not treat as measured speed. |
| ESC RPM / wheel encoder | future | primary speed | Preferred source for slip work. |
| GPS | future | low-rate absolute speed | Useful for drift correction, not road texture. |

## Internal Feature Contract

This is an internal Viewer-to-Bridge contract, not yet a telemetry wire format.
The values retain physical units until the Viewer normalizes them with the
vehicle profile.

| Feature | Unit | Source | Initial status |
| --- | --- | --- | --- |
| `speedEstimate` | m/s or 0..1 proxy | speed source | Phase 1 proxy only |
| `speedConfidence` | 0..1 | estimator quality | later |
| `steerAngle` | -1..1 | command, later servo | available as command |
| `lateralAccel` | m/s2 | normalized, gravity-compensated IMU | log first |
| `yawRate` | rad/s | normalized vehicle-frame gyro | log first |
| `roadEnvelope` | 0..1 | filtered vertical acceleration | later |
| `impact` | event | jerk plus acceleration threshold | later |
| `slipConfidence` | 0..1 | speed, steering, yaw mismatch | only after measured speed |

## Directional Align Torque

The first directional effect is not a permanent spring. It represents only the
part of self-aligning force that can be inferred with confidence while cornering.

```text
cornerLoad = clamp(abs(lateralAccel) / lateralAccelReference, 0, 1)
speedGate  = smoothstep(speedStart, speedFull, speedEstimate)
alignRaw   = -steerAngle * cornerLoad * speedGate * alignGain
alignTorque = asymmetricLowPass(alignRaw, alignAttackMs, alignReleaseMs)
```

Required gates:

- `Drive On` is true.
- telemetry is valid and not stale;
- steering input is outside its measured deadzone;
- speed confidence is sufficient when using a measured-speed estimator;
- no emergency stop or device-lost state exists.

At rest, `speedGate` is zero. On a straight, `cornerLoad` is near zero. The
force therefore does not become a generic centering spring. If a future slip
estimator reports low grip, it reduces `alignTorque`; it must not reverse it in
the first release.

## Parameter Families

Do not put all future values in the gamepad mapping profile. Separate them by
ownership.

| Profile | Examples | Owner |
| --- | --- | --- |
| Wheel safety profile | maximum output, DirectInput sign, supported effects | Wheel / Bridge |
| Input profile | VID/PID, axes, buttons, deadzones | Driver hardware |
| Vehicle feel profile | lateral acceleration reference, align gain, filters, road/impact limits | RC chassis/source |
| Driver preset | weak, medium, strong multiplier | Driver |

The current weak/medium/strong preset remains a multiplier. It is not a
replacement for per-vehicle physical references.

## Value Determination Plan

All values below are starting hypotheses or measurement methods. They are not
physical truth and must be saved with the corresponding vehicle profile and log.

| Parameter | Safe initial value | Determine from | Acceptance rule |
| --- | --- | --- | --- |
| `speedStart` | `0.15` in current proxy scale | first sustained roll | no directional torque while stationary |
| `speedFull` | `0.45` in current proxy scale | normal corner entry | force rises gradually, never steps |
| `steeringDeadzone` | existing mapped deadzone | stationary wheel noise and servo neutral error | no torque chatter at neutral |
| `lateralAccelReference` | unset | 90th percentile of stable cornering `abs(aLat)` | normal fast corner does not clip |
| `alignGain` | `0.10` output cap for first live run | replay then operator feedback | no surprise pull; no continuous clipping |
| `alignAttackMs` | `80 ms` | corner-entry replay | no visible step or delayed feel |
| `alignReleaseMs` | `160 ms` | corner-exit replay | decays smoothly without oscillation |
| `roadGain` | disabled | filtered vertical acceleration log | enable only after directional torque is stable |
| `impactThreshold` | disabled | jerk / impact recordings | one physical impact produces at most one pulse |
| `slipGain` | disabled | measured speed plus yaw validation | do not enable with speedProxy alone |

For every run, record: vehicle profile ID, wheel profile, Pit House maximum
torque, driver preset, telemetry source, and whether the data is live or replay.

## Required Diagnostics

RealFeel's useful pattern is to record raw input, conditioned input, and final
output separately. Add a CSV or structured log before enabling new live torque.

| Group | Fields |
| --- | --- |
| Identity | local monotonic time, source, boot, sequence, profile IDs |
| Telemetry health | local receive age, period, stale, sequence gap, quality flags |
| Raw motion | vehicle-frame `aLat`, `aVert`, `yawRate`, steering command/actual, speed estimate/confidence |
| Derived features | `cornerLoad`, `speedGate`, `alignRaw`, filtered align, road envelope, impact event ID |
| Output | requested torque/friction/damper, applied effect values, output clamp, device capabilities |
| Safety | Drive state, emergency stop, device lost, watchdog reason |

Logs are needed for replay and tuning, not for collecting personal driver data.

## Delivery Stages

| Stage | Deliverable | Live FFB change | Exit criteria |
| --- | --- | --- | --- |
| FFB-5 | telemetry recording and coordinate-frame verification | none | IMU units, axis signs, gravity compensation, timestamps, and stale behavior are documented from real runs |
| FFB-6 | Viewer feature extractor and replay diagnostics | none | recorded telemetry produces repeatable `cornerLoad` and `alignRaw` traces |
| FFB-7 | low-cap align torque | telemetry-derived constant force only | stopped wheel stays non-centering; corner entry/exit is smooth; stale input stops all effects |
| FFB-8 | road envelope and bounded impact | optional short local effects | no network-jitter vibration; pulse duration, cooldown, and maximum output are verified |
| FFB-9 | measured speed and slip confidence | grip reduction / bounded shake | ESC/encoder/GPS evidence supports the estimator; no slip behavior is based on speedProxy alone |

FFB-5 and FFB-6 are the next work. They do not change the feeling during a
live drive and can be validated without the RC car by replaying a captured
telemetry sequence.

## Explicit Non-Goals

- No fixed steering-angle centering force.
- No direct mapping of raw accelerometer samples to wheel torque.
- No permanent integration of IMU longitudinal acceleration as absolute speed.
- No slip inference before a measured speed source exists.
- No effect that survives Drive Off, stale telemetry, emergency stop, page exit,
  or Bridge device loss.
