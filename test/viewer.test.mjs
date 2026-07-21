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
  for (const file of ['viewer.js', 'telemetry.js', 'gamepad-profile.js', 'ffb-bridge.js', 'gamepad.js', 'monitor.js']) {
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
  assert.match(js, /state\.flag \|\| '',\s*formatRaceName\(state\),\s*formatRaceTotalLaps\(state\)/);
  assert.doesNotMatch(js, /const parts = \[\];\s*const raceName = formatRaceName\(state\)/);
});

test('viewer.html cache buster matches VIEWER_BUILD_ID', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  const buildMatch = js.match(/const VIEWER_BUILD_ID = '([^']+)'/);
  assert.ok(buildMatch, 'VIEWER_BUILD_ID is missing');
  assert.match(html, new RegExp(`viewer\\.js\\?v=${buildMatch[1]}`));
  assert.match(html, new RegExp(`telemetry\\.js\\?v=${buildMatch[1]}`));
  assert.match(html, new RegExp(`gamepad-profile\\.js\\?v=${buildMatch[1]}`));
});

test('Telemetry parser is loaded before the Viewer and exposed in diagnostics', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.ok(html.indexOf('telemetry.js') < html.indexOf('viewer.js'));
  assert.match(js, /injectTelemetry:/);
  assert.match(js, /emitMockTelemetryImpact/);
  assert.match(js, /telemetry: telemetryTracker/);
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

test('Race Control WebSocket can be manually connected from the Viewer', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.match(html, /id="btnRaceConnect"/);
  assert.match(js, /const RACE_AUTO_CONNECT = getBooleanParam\('raceConnect'/);
  assert.match(js, /function toggleRaceControlConnection\(\)/);
  assert.match(js, /btnRaceConnect\?\.addEventListener\('click', toggleRaceControlConnection\)/);
  assert.match(js, /if \(RACE_AUTO_CONNECT\) \{\s*connectRaceControl\(\);/);
  assert.match(js, /recordEvent\('race manual connect'\)/);
  assert.match(js, /raceState = null;/);
  assert.match(js, /clearRaceCountdownTimer\(\)/);
  assert.match(js, /autoConnect: RACE_AUTO_CONNECT/);
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

test('Throttle back range expands by gear', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  assert.match(js, /const RC_THROTTLE_GEAR_MIN_VALUES = \[1400, 1350, 1200, 1100, 1000\]/);
  assert.match(js, /const RC_THROTTLE_GEAR_MAX_VALUES = \[1600, 1650, 1800, 1900, 2000\]/);
  assert.match(html, /id="throttle" type="range" min="1000" max="2000"/);
});

test('FFB is configured from the input setup and stays out of the driving UI', () => {
  const html = readProjectFile('viewer.html');
  const js = readProjectFile('viewer.js');
  const bridgeClient = readProjectFile('ffb-bridge.js');
  const gamepadHtml = readProjectFile('gamepad.html');
  const gamepadJs = readProjectFile('gamepad.js');
  const relayHtml = readProjectFile('variants/relay/pilot.html');
  const relayJs = readProjectFile('variants/relay/pilot.js');
  const bridgeServer = readProjectFile('tools/ffb-bridge/MomoFpvFfbBridge/FfbBridgeServer.cs');
  const backend = readProjectFile('tools/ffb-bridge/MomoFpvFfbBridge/DirectInputFfbBackend.cs');
  assert.ok(html.indexOf('ffb-bridge.js') < html.indexOf('viewer.js'));
  assert.doesNotMatch(html, /id="ffbTestPanel"/);
  assert.doesNotMatch(relayHtml, /id="ffbTestPanel"/);
  assert.match(gamepadHtml, /id="ffbEnabled"/);
  assert.match(gamepadHtml, /id="ffbBaseFriction"/);
  assert.match(gamepadHtml, /id="ffbParkingFriction"/);
  assert.match(gamepadHtml, /id="ffbBaseDamper"/);
  assert.match(gamepadHtml, /id="ffbSpeedDamper"/);
  assert.match(gamepadHtml, /id="ffbRunningCentering"/);
  assert.match(gamepadHtml, /id="ffbCenteringReverse"/);
  assert.doesNotMatch(gamepadHtml, /id="ffbCentering"/);
  assert.match(gamepadHtml, /id="ffbBridgeUrl"/);
  assert.match(gamepadJs, /ffbEnabled: false/);
  assert.match(gamepadJs, /params\.set\("ffbEnabled", mapping\.ffbEnabled \? "1" : "0"\)/);
  assert.match(gamepadJs, /params\.set\("ffbBaseFriction", String\(mapping\.ffbBaseFriction \?\? 0\.05\)\)/);
  assert.match(gamepadJs, /params\.set\("ffbRunningCentering", String\(mapping\.ffbRunningCentering \?\? 0\.20\)\)/);
  assert.match(js, /const FFB_ENABLED = getBooleanParam\('ffbEnabled', getBooleanParam\('ffbTest', false\)\)/);
  assert.match(js, /const FFB_BASE_FRICTION = Math\.max\(0, Math\.min\(1\.0/);
  assert.match(js, /const FFB_RUNNING_CENTERING = Math\.max\(0, Math\.min\(1\.0/);
  assert.match(js, /function updateFfbVehicleState\(\)/);
  assert.match(js, /function sendFfbSteering\(\)/);
  assert.match(js, /function initializeFfb\(\)/);
  assert.match(js, /ffbClient\.connect\(\);/);
  assert.match(js, /ffbOutputEnabled = FFB_ENABLED/);
  assert.match(js, /stopFfbOutput\(\);/);
  assert.match(js, /effectMode: 'baseline'/);
  assert.match(js, /torque: 0/);
  assert.match(js, /virtualSteering: vehicleState\.virtualSteering/);
  assert.match(js, /runningCentering: FFB_RUNNING_CENTERING/);
  assert.match(js, /window\.addEventListener\('pagehide', \(\) => \{\s*stopFfbOutput\(\);/);
  assert.match(bridgeClient, /ws:\/\/127\.0\.0\.1:24725/);
  assert.match(bridgeClient, /type: 'stopAll'/);
  assert.equal(readProjectFile('variants/relay/ffb-bridge.js'), bridgeClient);
  assert.match(relayHtml, /script src="\.\/ffb-bridge\.js"/);
  assert.match(relayJs, /const FFB_ENABLED = getBooleanParam\('ffbEnabled', getBooleanParam\('ffbTest', false\)\)/);
  assert.match(relayJs, /function updateFfbVehicleState\(\)/);
  assert.match(bridgeServer, /string\.Equals\(effectMode, "baseline", StringComparison\.OrdinalIgnoreCase\)/);
  assert.match(bridgeServer, /friction = ClampUnit\(baseFriction \+ parkingFriction \* lowSpeed \* lowSpeed\)/);
  assert.match(bridgeServer, /damper = ClampUnit\(baseDamper \+ speedDamper \* speed \* speed\)/);
  assert.match(bridgeServer, /torque = ClampSignedUnit\(virtualSteering \* runningCentering \* centeringWeight \* centeringDirection\)/);
  assert.match(bridgeServer, /private static double SmoothStep\(/);
  assert.match(backend, /Math\.Abs\(_lastTorque\) < 0\.0001 && _lastDamper <= 0\.0001 && _lastFriction <= 0\.0001/);
  assert.match(backend, /StopAllLocked\(\);/);
});

test('automatic Ayame client ID follows the room lock policy', () => {
  const js = readProjectFile('viewer.js');
  const roomLockIndex = js.indexOf("const ROOM_LOCK_ENABLED = getBooleanParam('roomLock'");
  const clientIdIndex = js.indexOf('const AYAME_CLIENT_ID = getAyameClientId(ROOM_LOCK_ENABLED)');

  assert.notEqual(roomLockIndex, -1, 'ROOM_LOCK_ENABLED is missing');
  assert.notEqual(clientIdIndex, -1, 'AYAME_CLIENT_ID does not use the room lock policy');
  assert.ok(roomLockIndex < clientIdIndex, 'room lock policy must be resolved before client ID generation');
  assert.match(js, /const prefix = roomLockEnabled \? 'fpv-viewer' : 'fpv-unlocked'/);
  assert.match(js, /return createAyameClientId\(roomLockEnabled\)/);
});

test('Gamepad mappings are stored and selected per VID and PID profile', () => {
  const gamepadHtml = readProjectFile('gamepad.html');
  const gamepadJs = readProjectFile('gamepad.js');
  const viewerHtml = readProjectFile('viewer.html');
  const viewerJs = readProjectFile('viewer.js');
  assert.ok(gamepadHtml.indexOf('gamepad-profile.js') < gamepadHtml.indexOf('gamepad.js'));
  assert.ok(viewerHtml.indexOf('gamepad-profile.js') < viewerHtml.indexOf('viewer.js'));
  assert.match(gamepadJs, /profileApi\.saveProfile\(/);
  assert.match(gamepadJs, /data-select-gamepad/);
  assert.match(gamepadJs, /params\.set\("gamepadProfile", selectedProfileKey\)/);
  assert.match(viewerJs, /params\.get\('gamepadProfile'\)/);
  assert.match(viewerJs, /profileApi\.parseGamepadIdentity\(gamepad\.id\)/);
});
