# CPU car shadow capture

`cpu-shadow-capture.js` records the inputs needed by the CPU-car offline replay
without adding command-generation or vehicle-send authority.

Direct Viewer and Relay Pilot use the same capture module and event contract.

## Enable

Add `cpuCapture=1` to the Viewer hash:

```text
viewer.html#cpuCapture=1
```

For a Momo-served device page, keep all options in the hash:

```text
fpv-viewer.html#cpuCapture=1&flip=1&debug=1
```

The capture panel is absent unless the flag is enabled. Connect the Viewer,
wait for a live video track, and click `Start CPU Capture`. Stop first, then
use the explicit `Download Capture` action. The second user gesture is
intentional: automatic stops cannot reliably trigger browser downloads.
It requests three downloads:

```text
cpu-shadow-<run-id>.webm
cpu-shadow-<run-id>.jsonl
cpu-shadow-<run-id>-summary.json
```

The capture API is also available as:

```js
await window.fpvCpuShadowCapture.start();
const artifacts = await window.fpvCpuShadowCapture.stop({ reason: 'manual' });
window.fpvCpuShadowCapture.downloadLastArtifacts();
```

The browser can ask whether to allow multiple downloads. Verify that all
three files exist before starting another run.

## Recorded data

The WebM contains only the remote video track. It intentionally excludes audio.

The JSONL uses the same run ID and records:

- `run_start` / `run_stop`;
- every presented frame callback;
- accepted and rejected telemetry messages with remote arrival time;
- every attempted RC command, separating local DataChannel send acceptance
  from unknown remote application;
- Drive mode transitions and Relay Drive-channel send attempts/results;
- one-second reconnect diagnostics and raw cumulative WebRTC receiver stats;
- MediaRecorder start/chunk timing, including `BlobEvent.timecode`;
- track ID/settings, Viewer build/initial Drive state, DataChannel properties,
  transport generation, and non-secret source identity (signaling mode,
  Relay device, room ID, race car ID).

Signaling keys/tokens are not recorded. Before comparing or replaying runs,
confirm the `viewer.source_identity` fields identify the intended vehicle and
room; an endpoint alone is insufficient when Relay serves multiple devices.

Every JSONL record uses the fixed
`momo-fpv-cpu-shadow-capture/v1` schema, one run ID, and one leading
`run_start`; a completed artifact ends with `run_stop`. Offline replay rejects
schema/run changes, missing or non-final stop records, and a stop that did not
observe MediaRecorder's final `stop` event. It consumes only accepted
`datachannel` telemetry from the current `imu0` source.

For command and Relay Drive events, `local_send_accepted=true` means only that
the browser's `RTCDataChannel.send()` returned without throwing. The unordered
command channel has no remote acknowledgement in the current protocol, so the
capture records `remote_applied=null`; these events must not be interpreted as
vehicle-applied commands.

Frame records keep these clocks and identifiers separate:

```text
performance_ms / epoch_ms
presentation_time_ms / expected_display_time_ms
media_time_s / presented_frames
capture_time_ms / receive_time_ms / rtp_timestamp, when exposed
processing_duration_s
```

`requestVideoFrameCallback` is a best-effort presentation callback. The
browser can omit optional WebRTC fields or miss callbacks under main-thread
load. See the
[HTMLVideoElement frame callback specification](https://wicg.github.io/video-rvfc/).

The periodic diagnostics preserve raw cumulative fields defined by the W3C
WebRTC statistics contract for decoded/dropped frames, jitter-buffer delay,
processing delay, and ICE RTT:
[Identifiers for WebRTC Statistics](https://www.w3.org/TR/webrtc-stats/).
They intentionally do not store the Viewer's `estimatedDelayMs`: its current
formula is not a validated CPU-car stopping-distance input. Raw stats also do
not prove camera-to-display or camera-to-command latency.

The WebM encoder and the presentation callback are independent paths. Their
frames are not guaranteed to be one-to-one. Offline replay uses the first
presented-frame callback as a best-effort run-relative anchor and reports that
limitation; it does not claim exact per-frame telemetry synchronization.

## Pixel orientation

The WebM records the raw remote video track. Viewer CSS `flip-video`,
`mirror-video`, and object-fit presentation are not applied to its pixels.
`run_start` records the CSS flip/mirror state so offline replay can apply the
same camera orientation deliberately.

Flip and Mirror controls are locked while capture is active so one orientation
applies to the whole file.

## Automatic stop and resource boundary

Capture stops and retains the artifacts in memory when the transport begins
closing/reconnecting, the recorded track ends or becomes muted, the Viewer
replaces the track, the tab becomes hidden, MediaRecorder fails, or the
15-minute limit is reached.
No automatic stop attempts a download. Return to the visible capture panel
and click `Download Capture`.

The 15-minute bound limits browser memory growth; video chunks and JSONL
records remain in RAM until stop. Transport close first marks capture as
stopped before the old channel/track is released, so a reconnect cannot append
new-generation command or telemetry events to the old WebM run.
`run_stop.recorder_stop_seen` and summary `complete` remain false if final
recorder completion times out; the panel marks it `INCOMPLETE`, and offline
replay refuses that capture. The three files remain downloadable for forensic
inspection.

## Safety boundary

The capture module:

- never calls `sendCommand`;
- never references the command DataChannel;
- has no CPU proposal or controller;
- sets `transmit_capability` to `false` in run and summary records;
- does not change Drive state.

It observes RC command events emitted by Viewer only so that manual input can
later be compared with offline proposals. Those hook records are local
observations, not remote acknowledgements.

The first live CPU stage must remain shadow-only. Real output requires a
separate single-authority command arbiter, freshness checks, immediate manual
takeover, reconnect-to-Off behavior, and LF-terminated neutral verification.

## Distribution

`momo-fpv-viewer` is the source of truth. Do not hand-edit
`momo-fpv/client` or `momo-fpv/device-html`.

After this source is reviewed and committed, update the Direct Viewer asset
manifest in `momo-fpv` and the Relay manifest in `momo`, run each
synchronization script, then separately review and publish each distribution
copy. Dirty source is intentionally rejected by the synchronization scripts.
