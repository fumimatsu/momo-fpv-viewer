import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path) {
  return readFileSync(join(rootDir, path), 'utf8');
}

test('viewer JavaScript files parse', () => {
  for (const file of ['viewer.js', 'gamepad.js', 'monitor.js']) {
    execFileSync(process.execPath, ['--check', join(rootDir, file)], {
      stdio: 'pipe',
    });
  }
});

test('Race HUD markup is present in viewer.html', () => {
  const html = readProjectFile('viewer.html');
  for (const id of [
    'raceBanner',
    'raceBannerMain',
    'raceBannerSub',
    'racePhaseState',
    'raceFlagState',
    'racePositionState',
    'raceLapState',
    'raceWsState',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="debug-only race-only"/);
});

test('viewer.html cache buster matches VIEWER_BUILD_ID', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  const buildMatch = js.match(/const VIEWER_BUILD_ID = '([^']+)'/);
  assert.ok(buildMatch, 'VIEWER_BUILD_ID is missing');
  assert.match(html, new RegExp(`viewer\\.js\\?v=${buildMatch[1]}`));
});

test('Race Control WebSocket is independent from FPV autoStart', () => {
  const js = readProjectFile('viewer.js');
  const raceConnectIndex = js.indexOf('connectRaceControl();');
  const autoStartIndex = js.indexOf('if (AUTO_START)');
  assert.notEqual(raceConnectIndex, -1, 'connectRaceControl is not started');
  assert.notEqual(autoStartIndex, -1, 'AUTO_START block is missing');
  assert.ok(
    raceConnectIndex < autoStartIndex,
    'Race Control should connect even when FPV autoStart=0',
  );
});

test('raceToken URL parameter is forwarded as viewerToken', () => {
  const js = readProjectFile('viewer.js');
  assert.match(js, /const RACE_TOKEN = getStringParam\(\['raceToken', 'viewerToken'\]/);
  assert.match(js, /url\.searchParams\.set\('viewerToken', RACE_TOKEN\)/);
  assert.doesNotMatch(
    js,
    /!url\.searchParams\.has\('raceToken'\)/,
    'raceToken must not block viewerToken forwarding',
  );
});

test('Race diagnostics are exposed for manual debugging', () => {
  const js = readProjectFile('viewer.js');
  assert.match(js, /connectRaceControl,/);
  assert.match(js, /closeRaceControl,/);
  assert.match(js, /race: \{/);
  assert.match(js, /lastMessageAgeMs/);
});
