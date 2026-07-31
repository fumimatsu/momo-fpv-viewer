import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const rootDir = join(import.meta.dirname, '..');

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: options.once === true });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((entry) => entry.listener !== listener),
    );
  }

  dispatchEvent(event) {
    const listeners = [...(this.listeners.get(event.type) || [])];
    for (const entry of listeners) {
      entry.listener(event);
      if (entry.once) {
        this.removeEventListener(event.type, entry.listener);
      }
    }
    return true;
  }
}

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

class FakeTrack extends EventBus {
  constructor() {
    super();
    this.id = 'track-1';
    this.kind = 'video';
    this.label = 'remote';
    this.enabled = true;
    this.muted = false;
    this.readyState = 'live';
  }

  getSettings() {
    return { width: 640, height: 360, frameRate: 30 };
  }
}

class FakeMediaStream {
  constructor(tracks) {
    this.tracks = tracks;
  }

  getVideoTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder extends EventBus {
  static isTypeSupported(type) {
    return type.startsWith('video/webm');
  }

  constructor(stream, options) {
    super();
    this.stream = stream;
    this.mimeType = options.mimeType;
    this.state = 'inactive';
  }

  start() {
    this.state = 'recording';
    this.dispatchEvent({ type: 'start' });
  }

  stop() {
    this.state = 'inactive';
    this.dispatchEvent({
      type: 'dataavailable',
      data: new Blob(['video']),
      timecode: 0,
    });
    this.dispatchEvent({ type: 'stop' });
  }

  simulateAsyncFailure() {
    this.state = 'inactive';
    this.dispatchEvent({
      type: 'error',
      error: new Error('simulated recorder failure'),
    });
    queueMicrotask(() => {
      this.dispatchEvent({
        type: 'dataavailable',
        data: new Blob(['final-video']),
        timecode: 42,
      });
      this.dispatchEvent({ type: 'stop' });
    });
  }
}

function createHarness() {
  const track = new FakeTrack();
  const video = {
    srcObject: new FakeMediaStream([track]),
    videoWidth: 640,
    videoHeight: 360,
    requestVideoFrameCallback(callback) {
      this.frameCallback = callback;
      return 1;
    },
    cancelVideoFrameCallback() {
      this.frameCallback = null;
    },
  };
  const downloads = [];
  const bodyClassList = {
    contains() {
      return false;
    },
  };
  const document = Object.assign(new EventBus(), {
    hidden: false,
    visibilityState: 'visible',
    getElementById(id) {
      return id === 'remote_video' ? video : null;
    },
    querySelector() {
      return null;
    },
    createElement(tag) {
      if (tag === 'a') {
        return {
          style: {},
          click() {
            downloads.push(this.download);
          },
          remove() {},
        };
      }
      return {
        style: {},
        classList: { add() {} },
        append() {},
        appendChild() {},
      };
    },
    head: { appendChild() {} },
    body: {
      classList: bodyClassList,
      appendChild() {},
    },
  });
  let now = 1000;
  const window = Object.assign(new EventBus(), {
    MediaRecorder: FakeMediaRecorder,
    fpvViewer: {
      getCaptureSnapshot: () => ({
        build_id: 'test',
        variant: 'direct',
        drive_enabled: false,
      }),
      getDiagnostics: () => ({ reconnectCount: 0 }),
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 2,
    clearTimeout() {},
  });
  const context = {
    Blob,
    console,
    crypto: webcrypto,
    CustomEvent: TestCustomEvent,
    document,
    location: { search: '', hash: '' },
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeMediaStream,
    performance: {
      timeOrigin: 100_000,
      now: () => {
        now += 1;
        return now;
      },
    },
    URL: {
      createObjectURL: () => 'blob:test',
      revokeObjectURL() {},
    },
    URLSearchParams,
    Uint32Array,
    window,
  };
  vm.runInNewContext(
    readFileSync(join(rootDir, 'cpu-shadow-capture.js'), 'utf8'),
    context,
  );
  return {
    capture: window.fpvCpuShadowCapture,
    downloads,
    track,
    video,
    window,
  };
}

test('CPU capture retains artifacts until an explicit download click path', async () => {
  const harness = createHarness();
  const { capture, downloads, video, window } = harness;
  await capture.start();
  assert.equal(capture.running, true);

  video.frameCallback(1005, {
    presentationTime: 1005,
    expectedDisplayTime: 1006,
    mediaTime: 1.25,
    width: 640,
    height: 360,
    presentedFrames: 1,
    processingDuration: 0.001,
    captureTime: 995,
    receiveTime: 1000,
    rtpTimestamp: 123,
  });
  window.dispatchEvent(new TestCustomEvent('fpv-shadow-telemetry', {
    detail: {
      arrival_ms: 1006,
      source: 'datachannel',
      accepted: true,
      payload: { v: 2, k: 's' },
    },
  }));

  const artifacts = await capture.stop({ reason: 'manual' });
  assert.equal(capture.running, false);
  assert.equal(downloads.length, 0);
  assert.equal(capture.lastArtifacts, artifacts);
  assert.equal(artifacts.summary.stop_reason, 'manual');
  assert.equal(artifacts.summary.counts.frame, 1);
  assert.equal(artifacts.summary.counts.telemetry, 1);
  const log = await artifacts.logBlob.text();
  assert.match(log, /"kind":"run_start"/);
  assert.match(log, /"kind":"recorder_chunk"/);
  const records = log.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.at(-1).kind, 'run_stop');
  assert.equal(records.at(-1).recorder_stop_seen, true);
  assert.equal(artifacts.summary.complete, true);
  assert.equal(
    records.every(
      (record) => record.schema === 'momo-fpv-cpu-shadow-capture/v1',
    ),
    true,
  );
  assert.equal(new Set(records.map((record) => record.run_id)).size, 1);

  capture.downloadLastArtifacts();
  assert.equal(downloads.length, 3);
  assert.equal(capture.lastArtifactsDownloadRequested, true);
});

test('CPU capture auto-stop retains artifacts when the recorded track ends', async () => {
  const { capture, downloads, track } = createHarness();
  await capture.start();
  track.readyState = 'ended';
  track.dispatchEvent({ type: 'ended' });
  await capture.pendingStop;

  assert.equal(capture.running, false);
  assert.equal(capture.lastArtifacts.summary.stop_reason, 'recorded_track_ended');
  assert.equal(downloads.length, 0);
});

test('CPU capture waits for final data after an asynchronous recorder error', async () => {
  const { capture } = createHarness();
  await capture.start();
  const recorder = capture.mediaRecorder;
  recorder.simulateAsyncFailure();
  await capture.pendingStop;

  assert.equal(capture.lastArtifacts.summary.stop_reason, 'media_recorder_error');
  assert.equal(capture.lastArtifacts.videoBlob.size, 11);
  assert.equal(capture.lastArtifacts.summary.counts.recorder_chunk, 1);
});
