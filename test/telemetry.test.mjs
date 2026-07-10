import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  MAX_WIRE_BYTES,
  TelemetryMockGenerator,
  TelemetryTracker,
  encodeTelemetry,
  parseTelemetryMessage,
} = require('../telemetry.js');

function statePayload(overrides = {}) {
  return {
    v: 1,
    k: 's',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 10,
    t_us: 1000000,
    imu: { a: [0.12, -2.4, 9.61], g: [0.02, 0.01, -0.44] },
    att: { q: [1, 0, 0, 0], rpy: [0, 0, 0] },
    qual: { period_us: 50000, cal: 3, flags: [] },
    ...overrides,
  };
}

test('v1 state parses while legacy, unknown version, and malformed input stay separate', () => {
  const valid = parseTelemetryMessage(encodeTelemetry(statePayload()));
  assert.equal(valid.status, 'valid');
  assert.equal(valid.payload.imu.a[1], -2.4);

  assert.equal(parseTelemetryMessage('TEL:alive temp=45C').status, 'legacy');
  assert.equal(parseTelemetryMessage('TEL:{bad json').status, 'invalid');
  assert.equal(
    parseTelemetryMessage(encodeTelemetry(statePayload({ v: 2 }))).status,
    'unknown_version',
  );
});

test('invalid vectors and unnormalized attitude are rejected', () => {
  const badAcceleration = statePayload({
    imu: { a: [0, 0, 1001], g: [0, 0, 0] },
  });
  assert.equal(parseTelemetryMessage(encodeTelemetry(badAcceleration)).reason, 'acceleration');

  const badQuaternion = statePayload({
    att: { q: [0.5, 0, 0, 0], rpy: [0, 0, 0] },
  });
  assert.equal(parseTelemetryMessage(encodeTelemetry(badQuaternion)).reason, 'quaternion');
});

test('tracker detects gaps, duplicates, reordering, and stale state', () => {
  const tracker = new TelemetryTracker({ now: () => 0 });
  assert.equal(tracker.ingest(encodeTelemetry(statePayload()), 1000).sequenceStatus, 'initial');
  assert.equal(tracker.ingest(encodeTelemetry(statePayload({ seq: 13, t_us: 1050000 })), 1050).missing, 2);
  assert.equal(tracker.ingest(encodeTelemetry(statePayload({ seq: 13, t_us: 1050000 })), 1060).status, 'duplicate');
  assert.equal(tracker.ingest(encodeTelemetry(statePayload({ seq: 12, t_us: 1040000 })), 1070).status, 'out_of_order');
  assert.equal(tracker.ingest(encodeTelemetry(statePayload({ seq: 14, t_us: 1040000 })), 1080).status, 'time_fault');

  let snapshot = tracker.getSnapshot(1300);
  assert.equal(snapshot.primary.stale, false);
  assert.equal(snapshot.counters.missing, 2);
  assert.equal(snapshot.counters.timeFault, 1);
  snapshot = tracker.getSnapshot(1301);
  assert.equal(snapshot.primary.stale, true);
});

test('events advance sequence without refreshing state freshness', () => {
  const tracker = new TelemetryTracker({ now: () => 0 });
  tracker.ingest(encodeTelemetry(statePayload()), 1000);
  const event = {
    v: 1,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 11,
    t_us: 1050000,
    evt: { name: 'impact', data: { mag_mps2: 24.8, axis: [1, 0, 0] } },
  };
  assert.equal(tracker.ingest(encodeTelemetry(event), 1200).accepted, true);
  const snapshot = tracker.getSnapshot(1251);
  assert.equal(snapshot.primary.stale, true);
  assert.equal(snapshot.counters.event, 1);
});

test('mock generator emits valid compact state and impact messages', () => {
  const mock = new TelemetryMockGenerator({ periodMs: 50 });
  for (const message of [mock.nextState(1000), mock.nextState(1050), mock.nextImpact(1060)]) {
    assert.ok(Buffer.byteLength(message, 'utf8') <= MAX_WIRE_BYTES);
    assert.equal(parseTelemetryMessage(message).status, 'valid');
  }

  const longRunningMock = new TelemetryMockGenerator({ periodMs: 50, seq: 0xffffffff });
  longRunningMock.startedAt = 0;
  const longRunningState = longRunningMock.nextState(30 * 24 * 60 * 60 * 1000);
  assert.ok(Buffer.byteLength(longRunningState, 'utf8') <= MAX_WIRE_BYTES);
  assert.equal(parseTelemetryMessage(longRunningState).status, 'valid');
});
