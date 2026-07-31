import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  MAX_WIRE_BYTES,
  deriveVehicleMotion,
  MotionFeatureExtractor,
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

function compactStatePayload(overrides = {}) {
  return {
    v: 2,
    k: 's',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 10,
    t_us: 1000000,
    m: { a: [2.4, -3.6, 0.2], y: -0.44 },
    q: { p: 50000, f: ['flu_axes'] },
    ...overrides,
  };
}

  function impactCandidatePayload({ magnitudeMps2, jerkMps3 }) {
  return {
    v: 2,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 11,
    t_us: 1050000,
    e: {
      n: 'impact_candidate',
      m: magnitudeMps2,
      a: [1, 0, 0],
      j: jerkMps3,
    },
  };
  }

test('v1 state parses while legacy, unknown version, and malformed input stay separate', () => {
  const valid = parseTelemetryMessage(encodeTelemetry(statePayload()));
  assert.equal(valid.status, 'valid');
  assert.equal(valid.payload.imu.a[1], -2.4);

  assert.equal(parseTelemetryMessage('TEL:alive temp=45C').status, 'legacy');
  assert.equal(parseTelemetryMessage('TEL:{bad json').status, 'invalid');
  assert.equal(
    parseTelemetryMessage(encodeTelemetry(statePayload({ v: 3 }))).status,
    'unknown_version',
  );
});

test('v2 compact state provides the confirmed FLU motion values', () => {
  const parsed = parseTelemetryMessage(encodeTelemetry(compactStatePayload()));
  assert.equal(parsed.status, 'valid');
  assert.deepEqual(deriveVehicleMotion(parsed.payload), {
    forwardMps2: 2.4,
    lateralMps2: -3.6,
    verticalMps2: 0.2,
    yawRateRadPerSec: -0.44,
  });

  const withoutFluAxes = compactStatePayload({ q: { p: 50000, f: [] } });
  assert.equal(deriveVehicleMotion(withoutFluAxes), null);
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

test('impact tiers require jerk for strong and heavy impacts', () => {
  const cases = [
    { magnitudeMps2: 10.0, jerkMps3: 80.0, expected: 'weak' },
    { magnitudeMps2: 11.9, jerkMps3: 250.0, expected: 'weak' },
    { magnitudeMps2: 12.0, jerkMps3: 80.0, expected: 'weak' },
    { magnitudeMps2: 12.0, jerkMps3: 250.0, expected: 'strong' },
    { magnitudeMps2: 17.9, jerkMps3: 249.0, expected: 'weak' },
    { magnitudeMps2: 17.9, jerkMps3: 250.0, expected: 'strong' },
    { magnitudeMps2: 18.0, jerkMps3: 249.0, expected: 'weak' },
    { magnitudeMps2: 18.0, jerkMps3: 250.0, expected: 'severe' },
  ];

  for (const item of cases) {
    const motion = new MotionFeatureExtractor();
    motion.ingest(compactStatePayload(), 1000);
    const snapshot = motion.ingest(impactCandidatePayload(item), 1050);
    assert.equal(snapshot.lastImpactEvent.impactClass, item.expected);
  }
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

test('v2 compact state and impact candidate event parse within the UART limit', () => {
  const state = compactStatePayload();
  const event = {
    v: 2,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 11,
    t_us: 1050000,
    e: { n: 'impact_candidate', m: 12.4, a: [1, 0, 0], j: 180 },
  };
  for (const payload of [state, event]) {
    const message = encodeTelemetry(payload);
    assert.ok(Buffer.byteLength(message, 'utf8') <= MAX_WIRE_BYTES);
    assert.equal(parseTelemetryMessage(message).status, 'valid');
  }
});

test('motion features use the confirmed FLU axis mapping and reject an unmapped source', () => {
  const extractor = new MotionFeatureExtractor();
  assert.equal(extractor.ingest(statePayload(), 1000), null);

  const first = statePayload({
    seq: 1,
    t_us: 1000000,
    imu: { a: [4.0, 9.80665, 1.2], g: [0, 0.9, 0] },
    qual: { period_us: 50000, cal: 0, flags: ['flu_axes'] },
  });
  const snapshot = extractor.ingest(first, 1000);
  assert.equal(snapshot.motion.forwardMps2, 1.2);
  assert.equal(snapshot.motion.lateralMps2, 4.0);
  assert.ok(Math.abs(snapshot.motion.verticalMps2) < 0.001);
  assert.equal(snapshot.motion.yawRateRadPerSec, 0.9);
  assert.ok(snapshot.cornerLoad > 0);
});

test('motion features allow weak terrain events to repeat before quiet rearm', () => {
  const extractor = new MotionFeatureExtractor({ impactRearmHoldMs: 500 });
  const base = statePayload({
    seq: 1,
    t_us: 1000000,
    imu: { a: [0, 9.80665, 0], g: [0, 0, 0] },
    qual: { period_us: 50000, cal: 0, flags: ['flu_axes'] },
  });
  extractor.ingest(base, 1000);
  const impact = extractor.ingest(statePayload({
    seq: 2,
    t_us: 1050000,
    imu: { a: [0, 9.80665, -12], g: [0, 0, 0] },
    qual: { period_us: 50000, cal: 0, flags: ['flu_axes'] },
  }), 1050);
  assert.equal(impact.impact, true);
  assert.equal(impact.impactRecent, true);
  assert.equal(impact.lastImpactEvent.impactClass, 'weak');

  const repeated = extractor.ingest(statePayload({
    seq: 3,
    t_us: 1100000,
    imu: { a: [0, 9.80665, 12], g: [0, 0, 0] },
    qual: { period_us: 50000, cal: 0, flags: ['flu_axes'] },
  }), 1100);
  assert.equal(repeated.impact, true);
  assert.equal(repeated.impactRecent, true);
});

test('compact state bypasses sensor-axis conversion and M5 events are classified', () => {
  const extractor = new MotionFeatureExtractor();
  const state = compactStatePayload();
  const initial = extractor.ingest(state, 1000);
  assert.equal(initial.motion.forwardMps2, 2.4);
  assert.equal(initial.motion.lateralMps2, -3.6);
  assert.equal(initial.motion.verticalMps2, 0.2);
  assert.equal(initial.motion.yawRateRadPerSec, -0.44);

  const event = {
    v: 2,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 11,
    t_us: 1050000,
    e: { n: 'impact_candidate', m: 12.4, a: [1, 0, 0], j: 180 },
  };
  const impact = extractor.ingest(event, 1050);
  assert.equal(impact.impact, true);
  assert.equal(impact.impactRecent, true);
  assert.equal(impact.lastImpactEvent.impactClass, 'weak');
  assert.equal(impact.lastImpactEvent.source, 'm5_v2');
});

test('M5 impact events use severity thresholds and suppress collision aftershocks', () => {
  const extractor = new MotionFeatureExtractor({ impactRearmHoldMs: 500 });
  extractor.ingest(compactStatePayload({
    seq: 1,
    t_us: 1000000,
    m: { a: [0, 0, 0], y: 0 },
  }), 1000);

  const strong = extractor.ingest({
    v: 2,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 2,
    t_us: 1050000,
    e: { n: 'impact_candidate', m: 12.4, a: [1, 0, 0], j: 300 },
  }, 1050);
  assert.equal(strong.lastImpactEvent.impactClass, 'strong');

  const repeated = extractor.ingest({
    v: 2,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 3,
    t_us: 1100000,
    e: { n: 'impact_candidate', m: 13.8, a: [1, 0, 0], j: 400 },
  }, 1100);
  assert.equal(repeated.lastImpactEvent.magnitudeMps2, 12.4);

  const severe = extractor.ingest({
    v: 2,
    k: 'e',
    src: 'imu0',
    boot: '7f3a21c4',
    seq: 4,
    t_us: 1150000,
    e: { n: 'impact_candidate', m: 19.4, a: [1, 0, 0], j: 1734 },
  }, 1150);
  assert.equal(severe.lastImpactEvent.impactClass, 'severe');

  extractor.ingest(compactStatePayload({
    seq: 5,
    t_us: 1200000,
    m: { a: [0, 0, 0], y: 0 },
  }), 1200);
  const rearmed = extractor.ingest(compactStatePayload({
    seq: 6,
    t_us: 1750000,
    m: { a: [0, 0, 0], y: 0 },
  }), 1750);
  assert.equal(rearmed.impactArmed, true);
});
