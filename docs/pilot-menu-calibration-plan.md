# Pilot Menu and Calibration Plan

## Status

Phase 1 is implemented on the Relay Pilot source. Automated tests and browser
layout checks pass; MOZA and T300 hardware calibration runs remain required.

## Goal

Move normal driving settings out of the debug-only controls and make them
available without leaving the FPV screen. Keep the existing Input page as an
advanced diagnostics and manual-adjustment surface.

## Source of truth

- Pilot UI: `variants/relay/pilot.html` and `variants/relay/pilot.js`
- Car selection: `variants/relay/garage.html`
- Detailed input setup: `gamepad.html` and `gamepad.js`
- Saved mapping: the existing `fpvGamepadMapping` device-scoped local storage
  entry. The wizard must not introduce another runtime mapping contract.

## Phase 1 scope

### FPV menu overlay

- Open from the on-screen MENU button, keyboard `M`, or a configured wheel
  button.
- Close from the close button, keyboard `M`, or `Escape`.
- Force Drive Off before opening the menu. A settings overlay must never leave
  RC output armed in the background.
- Place the following controls in the overlay:
  - car selection
  - fullscreen
  - camera flip and mirror
  - received video audio and audio filter
  - M5 audio
  - microphone and microphone level
  - guided wheel calibration
  - advanced Input page
  - debug display and existing mode diagnostics

### Car selection

Open the existing Garage page from the Pilot. Garage remains responsible for
fetching `/api/v1/pilot-devices`, showing availability, and constructing the
next Pilot URL.

### Guided calibration

Record these inputs in order:

1. steering full left
2. steering full right
3. steering center
4. throttle released
5. throttle fully pressed
6. brake released
7. brake fully pressed
8. left paddle
9. right paddle
10. Drive toggle button
11. FFB preset button
12. MENU button

Axis steps use the current gamepad state when the user selects Record. Button
steps detect the next rising button press automatically. Throttle and brake can
be either axes or analog buttons. The wizard stores the physical idle and
pressed boundaries instead of assuming `1` and `-1`.

The Pilot currently reads gamepad configuration once at startup. Phase 1 saves
the completed mapping and reloads the current Pilot URL. This is deliberate:
live mutation would require replacing the existing constant configuration and
would increase risk in the 50 Hz RC path.

## Later phases

- Add per-step animated input diagrams after validating the wizard on MOZA and
  T300 hardware.
- Add explicit profile selection when multiple same-browser controllers are
  connected.
- Show a before/after raw-input validation screen before applying a profile.
- Consider live profile switching only after the RC output path has regression
  tests for configuration replacement during an active session.

## Acceptance criteria

- Normal settings are available without enabling Debug.
- MENU works by screen button and keyboard; a saved wheel MENU button works
  after reload.
- Opening settings always disables Drive.
- Car Select reaches the existing Garage.
- Calibration saves all requested axes, boundaries, paddles, Drive, FFB, and
  MENU controls in the existing device-scoped mapping.
- The advanced Input page remains reachable.
- Existing Viewer tests and JavaScript syntax checks pass.

## Distribution

The Relay source must be committed and clean before running Momo's
`tools/sync-relay-viewer.ps1`. The distribution metadata must then point to the
new Viewer commit and include only hash-matching assets.
