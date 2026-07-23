# FPV RC Vehicle-Feel FFB Design

## Purpose

This design creates a controllable vehicle-feel model for an FPV RC car. It is not a mechanical connection to the RC steering rack, so every synthetic element must be identifiable, bounded, and removable.

The telemetry-derived feature contract, parameter measurement methods, and
post-baseline delivery stages are defined in [FFB Telemetry Feature Roadmap](ffb-telemetry-feature-roadmap.md).

## Layer Model

```text
Input mapping / vehicle telemetry
  -> Viewer feature normalization
  -> local FFB Bridge mixer
  -> DirectInput effects
  -> wheel base
```

The Bridge owns timing, effect application, output clamping, and safety stop. The Viewer sends normalized inputs only.

| Layer | Input | DirectInput effect | Status |
| --- | --- | --- | --- |
| Baseline friction | speedProxy | Friction | Phase 1 |
| Baseline damping | speedProxy | Damper | Phase 1 |
| Self-aligning/rack load | vehicle speed, lateral acceleration, steering response | Constant force or Spring | Later |
| Road texture | filtered vertical acceleration | Periodic effect | Later |
| Impact | jerk/event | bounded pulse | Later |
| Slip | steering response and yaw mismatch | reduce rack load plus bounded shake | Later |

## Phase 1 Baseline

The Viewer derives a `speedProxy` from forward throttle, coast decay, and brake decay. It is explicitly not vehicle speed.

```text
friction = baseFriction + parkingFriction * (1 - speedProxy)^2
damper   = baseDamper + speedDamper * speedProxy^2
torque   = 0
```

The starting values are tuning defaults, not physical measurements:

| Parameter | Default |
| --- | --- |
| Base friction | 0.28 |
| Low-speed friction | 0.08 |
| Base damper | 0.05 |
| Speed damper | 0.15 |

Test in this order: stopped, low throttle, sustained throttle, throttle release, brake, then Drive Off. Change one parameter per run and record subjective notes. Pit House mechanical centering, damping, and friction remain off so the Bridge is the only adjustable software layer.

## Speed Source Roadmap

1. `speedProxy`: throttle/brake-derived and suitable only for initial feel tuning.
2. IMU-assisted estimate: acceleration filtered in vehicle coordinates, with drift correction. It improves transients but cannot provide stable absolute speed by itself.
3. Measured speed: GPS, ESC RPM, wheel encoder, or visual odometry. This replaces speedProxy without changing the Bridge mixer contract.

## Telemetry Rules

- Convert IMU readings into a verified vehicle coordinate frame before using them.
- Remove gravity and separate low-frequency vehicle motion from high-frequency vibration.
- Send compact, normalized features instead of raw high-rate vibration data when possible.
- Let the Bridge synthesize high-frequency road feel from a low-bandwidth envelope so browser and network jitter do not become wheel vibration.
- All telemetry-derived effects decay to zero on stale input. New data must not re-enable an emergency-stopped FFB session without an explicit Drive On cycle.

## Safety

- `Drive Off`, transport disconnect, page hide, process shutdown, and a 250 ms Bridge watchdog stop torque, damper, and friction.
- The Bridge output clamp and Pit House maximum torque limit are independent safety caps.
- Condition effects must be included in stale-input handling; a zero constant torque alone is not a safe stop when friction or damping is active.
