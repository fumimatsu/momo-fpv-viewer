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
    'raceBannerTitle',
    'raceBannerMain',
    'raceBannerSub',
    'racePhaseState',
    'raceFlagState',
    'raceNameState',
    'raceTotalLapsState',
    'racePositionState',
    'raceLapState',
    'raceWsState',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="debug-only race-only"/);
});

test('Race HUD displays raceInfo title and total laps', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.match(html, /id="raceNameState"/);
  assert.match(html, /id="raceTotalLapsState"/);
  assert.match(js, /function getRaceInfo\(state = raceState\)/);
  assert.match(js, /function formatRaceName\(state = raceState\)/);
  assert.match(js, /function formatRaceTotalLaps\(state = raceState\)/);
  assert.match(js, /\$\{self\.lap\}\/\$\{Math\.floor\(totalLaps\)\}/);
  assert.match(js, /setText\(raceBannerTitle, raceName === 'n\/a' \? '' : raceName\)/);
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

test('Race banner auto-hides during normal green running', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.match(js, /const RACE_BANNER_TRANSIENT_MS = getNumberParam\('raceBannerMs', 4000\)/);
  assert.match(js, /function isRaceBannerPersistent\(/);
  assert.match(js, /state\.phase === 'finished'/);
  assert.match(js, /state\.flag === 'yellow'/);
  assert.match(js, /raceBanner\.classList\.toggle\('race-banner-hidden'/);
  assert.match(html, /race-banner\.race-banner-hidden/);
});

test('Race countdown and start sound cues are available', () => {
  const js = readProjectFile('viewer.js');
  assert.match(js, /const RACE_SOUND_ENABLED = getBooleanParam\('raceSound', RACE_MODE\)/);
  assert.match(js, /const RACE_SOUND_VOLUME = Math\.max\(0, Math\.min\(1/);
  assert.match(js, /if \(Number\.isFinite\(state\.startAtMs\)\) \{/);
  assert.match(js, /if \(remaining > 0\) \{\s*return String\(remaining\);\s*\}\s*return '';/);
  assert.match(js, /function playRaceCountdownSound\(\)/);
  assert.match(js, /function playRaceStartSound\(\)/);
  assert.match(js, /playRaceSoundForState\(payload\)/);
  assert.match(js, /function scheduleRaceCountdownTick\(/);
  assert.match(js, /scheduleRaceCountdownTick\(payload\)/);
  assert.match(js, /window\.addEventListener\('pointerdown', unlockRaceSound\)/);
  assert.match(js, /soundUnlocked: raceSoundUnlocked/);
});

test('Audio and microphone controls can be fully hidden', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.match(js, /getBooleanParam\(\s*'audioControls'/);
  assert.match(js, /getBooleanParam\('mediaControls'/);
  assert.match(js, /media-controls-hidden/);
  assert.match(html, /body\.media-controls-hidden \.top-primary/);
  assert.match(html, /class="media-control"/);
  assert.match(html, /id="btnMic"/);
});

test('RC control positions can be swapped from URL and UI', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.match(html, /body\.controls-swapped \.panel/);
  assert.match(html, /id="btnSwapControls"/);
  assert.match(js, /function isControlsSwappedByDefault\(\)/);
  assert.match(js, /params\.get\('swapControls'\)/);
  assert.match(js, /function setControlsSwapped\(enabled\)/);
  assert.match(js, /btnSwapControls\.addEventListener\('click', toggleControlsSwapped\)/);
  assert.match(js, /setControlsSwapped\(isControlsSwappedByDefault\(\)\)/);
});
