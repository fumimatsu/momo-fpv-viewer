(() => {
  'use strict';

  const VIEWER_BUILD_ID = '20260710-race-info-countdown';
  const DEFAULT_HOST = '192.168.11.3:8080';
  const RECONNECT_BASE_DELAY_MS = 500;
  const RECONNECT_MAX_DELAY_MS = 5000;
  const ROOM_FULL_RETRY_BASE_DELAY_MS = getNumberParam('roomFullRetryMs', 10000);
  const ROOM_FULL_RETRY_MAX_DELAY_MS = getNumberParam('roomFullRetryMaxMs', 30000);
  const VIDEO_FREEZE_TIMEOUT_MS = getNumberParam('videoFreezeMs', 12000);
  const CONNECT_GRACE_MS = getNumberParam('connectGraceMs', 15000);
  const SIGNALING_MODE = getStringParam(['signaling', 'signalingMode'], 'p2p').toLowerCase();
  const AUTO_RECONNECT = getBooleanParam('autoReconnect', true);
  const AUTO_RECONNECT_ON_VIDEO_LOST = getBooleanParam('videoReconnect', SIGNALING_MODE === 'ayame');
  const DEVICE_STATUS_MODE = getDeviceStatusMode();
  const RC_TX_INTERVAL_MS = getNumberParam('rcTxMs', 20);
  const RC_STEERING_THROW = getNumberParam('rcSteeringThrow', 400);
  const RC_THROTTLE_THROW = getNumberParam('rcThrottleThrow', 300);
  const RC_THROTTLE_MIN = getNumberParam('rcThrottleMin', 1300);
  const RC_BRAKE_VALUE = getNumberParam('rcBrakeValue', 1300);
  const RC_BRAKE_DURATION_MS = getNumberParam('rcBrakeMs', 1000);
  const RC_BRAKE_THRESHOLD = getNumberParam('rcBrakeThreshold', 1700);
  const RC_THROTTLE_GEAR_MIN_VALUES = [1400, 1400, 1300, 1300, 1300];
  const RC_THROTTLE_GEAR_MAX_VALUES = [1600, 1650, 1800, 1900, 2000];
  const RC_INITIAL_GEAR = Math.max(1, Math.min(5, getIntegerParam('rcGear', 1)));
  const RC_STEERING_NEUTRAL_DEADBAND_US = getNumberParamAllowZero('rcSteeringNeutralDeadband', 10);
  const RC_THROTTLE_NEUTRAL_DEADBAND_US = getNumberParamAllowZero('rcThrottleNeutralDeadband', 10);
  const GAMEPAD_PROFILE_STORAGE_KEY = 'fpvGamepadMapping';
  const GAMEPAD_PROFILE = loadGamepadProfile();
  const GAMEPAD_ENABLED = getBooleanParam('gamepad', true);
  const GAMEPAD_INDEX = getNumberParamWithProfile('gamepadIndex', 'index', 0, true);
  const GAMEPAD_STEERING_AXIS = getNumberParamWithProfile('gamepadSteeringAxis', 'steeringAxis', 0, true);
  const GAMEPAD_STEERING_INVERT = getBooleanParamWithProfile('gamepadSteeringInvert', 'steeringInvert', false);
  const GAMEPAD_STEERING_DEADZONE = getNumberParamWithProfile('gamepadSteeringDeadzone', 'steeringDeadzone', 0.03);
  const GAMEPAD_STEERING_CENTER = getNumberParamWithProfile('gamepadSteeringCenter', 'steeringCenter', 0);
  const GAMEPAD_STEERING_LEFT = getNumberParamWithProfile('gamepadSteeringLeft', 'steeringLeft', -1);
  const GAMEPAD_STEERING_RIGHT = getNumberParamWithProfile('gamepadSteeringRight', 'steeringRight', 1);
  const GAMEPAD_STEERING_CALIBRATED =
    hasNumberParamWithProfile('gamepadSteeringCenter', 'steeringCenter') &&
    hasNumberParamWithProfile('gamepadSteeringLeft', 'steeringLeft') &&
    hasNumberParamWithProfile('gamepadSteeringRight', 'steeringRight');
  const GAMEPAD_STEERING_GAIN = getEffectiveSteeringGain(
    getNumberParamWithProfile('gamepadSteeringGain', 'steeringGain', GAMEPAD_STEERING_CALIBRATED ? 1.0 : 3.75),
    GAMEPAD_STEERING_CALIBRATED,
  );
  const GAMEPAD_THROTTLE_BUTTON = getNumberParamWithProfile('gamepadThrottleButton', 'throttleButton', -1, true);
  const GAMEPAD_THROTTLE_AXIS = getNumberParamWithProfile('gamepadThrottleAxis', 'throttleAxis', GAMEPAD_THROTTLE_BUTTON >= 0 ? -1 : 5, true);
  const GAMEPAD_THROTTLE_INVERT = getBooleanParamWithProfile('gamepadThrottleInvert', 'throttleInvert', false);
  const GAMEPAD_THROTTLE_IDLE = getNumberParamWithProfile('gamepadThrottleIdle', 'throttleIdle', GAMEPAD_THROTTLE_BUTTON >= 0 ? 0 : 1);
  const GAMEPAD_THROTTLE_PRESSED = getNumberParamWithProfile('gamepadThrottlePressed', 'throttlePressed', GAMEPAD_THROTTLE_BUTTON >= 0 ? 1 : -1);
  const GAMEPAD_THROTTLE_IDLE_CONFIGURED = hasNumberParamWithProfile('gamepadThrottleIdle', 'throttleIdle');
  const GAMEPAD_BRAKE_BUTTON = getNumberParamWithProfile('gamepadBrakeButton', 'brakeButton', -1, true);
  const GAMEPAD_BRAKE_AXIS = getNumberParamWithProfile('gamepadBrakeAxis', 'brakeAxis', GAMEPAD_BRAKE_BUTTON >= 0 ? -1 : 6, true);
  const GAMEPAD_BRAKE_INVERT = getBooleanParamWithProfile('gamepadBrakeInvert', 'brakeInvert', false);
  const GAMEPAD_BRAKE_IDLE = getNumberParamWithProfile('gamepadBrakeIdle', 'brakeIdle', GAMEPAD_BRAKE_BUTTON >= 0 ? 0 : 1);
  const GAMEPAD_BRAKE_PRESSED = getNumberParamWithProfile('gamepadBrakePressed', 'brakePressed', GAMEPAD_BRAKE_BUTTON >= 0 ? 1 : -1);
  const GAMEPAD_BRAKE_IDLE_CONFIGURED = hasNumberParamWithProfile('gamepadBrakeIdle', 'brakeIdle');
  const GAMEPAD_PEDAL_DEADZONE = getNumberParamWithProfile('gamepadPedalDeadzone', 'pedalDeadzone', 0.05);
  const GAMEPAD_DRIVE_BUTTON = getNumberParamWithProfile('gamepadDriveButton', 'driveButton', 8, true);
  const GAMEPAD_DRIVE_BUTTON_ENABLED = getBooleanParam('gamepadDriveButtonEnabled', true);
  const GAMEPAD_PADDLE_LEFT_BUTTON = getNumberParamWithProfile('gamepadPaddleLeftButton', 'paddleLeftButton', 0, true);
  const GAMEPAD_PADDLE_RIGHT_BUTTON = getNumberParamWithProfile('gamepadPaddleRightButton', 'paddleRightButton', 1, true);
  const OSD_UPDATE_INTERVAL_MS = getNumberParam('osdMs', 100);
  const DC_PING_ENABLED = getBooleanParam('dcPing', false);
  const DC_PING_INTERVAL_MS = getNumberParam('dcPingMs', 1000);
  const DEFAULT_AYAME_SIGNALING_URL = 'wss://133.88.123.51.nip.io/signaling';
  const AYAME_SIGNALING_URL = getStringParam(
    ['ayameUrl', 'signalingUrl'],
    DEFAULT_AYAME_SIGNALING_URL,
  );
  const AYAME_ROOM_ID = getStringParam(['roomId', 'ayameRoomId'], '');
  const AYAME_CLIENT_ID = getAyameClientId();
  const AYAME_SIGNALING_KEY = getStringParam(['signalingKey', 'ayameKey'], '');
  const AUTO_START = getBooleanParam('autoStart', SIGNALING_MODE !== 'ayame');
  const ICE_MODE = normalizeIceMode(getStringParam(['iceMode', 'ice'], 'auto'));
  const STUN_URLS = getStringListParam(['stunUrls', 'stunUrl'], ['stun:stun.l.google.com:19302']);
  const TURN_URLS = getStringListParam(['turnUrls', 'turnUrl'], []);
  const TURN_USERNAME = getStringParam(['turnUsername', 'turnUser'], '');
  const TURN_CREDENTIAL = getStringParam(['turnCredential', 'turnPassword'], '');
  const AUDIO_FILTER_DEFAULT = getBooleanParam('audioFilter', false);
  const AUDIO_FILTER_Q = getNumberParam('audioFilterQ', 24);
  const AUDIO_FILTER_FREQS = getStringListParam(['audioFilterFreqs'], ['50', '100', '150'])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const AUDIO_OPUS_MAX_BITRATE_BPS = getAudioOpusMaxBitrateBps();
  const AUDIO_OPUS_STEREO = getOptionalBooleanParam('audioOpusStereo');
  const AUDIO_OPUS_DTX = getOptionalBooleanParam('audioOpusDtx');
  const AUDIO_OPUS_FEC = getOptionalBooleanParam('audioOpusFec');
  const MEDIA_CONTROLS_VISIBLE = getBooleanParam(
    'audioControls',
    getBooleanParam('mediaControls', !location.pathname.includes('local-mic-ui')),
  );
  const MIC_DEFAULT_VOLUME = Math.max(0, Math.min(200, getNumberParamAllowZero('micVolume', 100)));
  const MIC_METER_INTERVAL_MS = 100;
  const ROOM_LOCK_ENABLED = getBooleanParam('roomLock', SIGNALING_MODE === 'ayame');
  const ROOM_LOCK_URL = normalizeBaseUrl(getStringParam(['lockUrl', 'roomLockUrl'], defaultRoomLockUrl()));
  const ROOM_LOCK_TTL_SEC = getNumberParam('roomLockTtl', 30);
  const ROOM_LOCK_POLL_MS = getNumberParam('roomLockPollMs', 5000);
  const ROOM_LOCK_HEARTBEAT_MAX_FAILURES = Math.max(1, getIntegerParam('roomLockHeartbeatFailures', 3));
  const RACE_MODE = getBooleanParam('raceMode', false);
  const RACE_URL_RAW = getStringParam(['raceUrl', 'raceWs'], '');
  const RACE_TOKEN = getStringParam(['raceToken', 'viewerToken'], '');
  const RACE_CAR_ID = getStringParam(['carId', 'raceCarId'], getStringParam(['id'], ''));
  const RACE_RECONNECT_BASE_MS = getNumberParam('raceReconnectMs', 1000);
  const RACE_RECONNECT_MAX_MS = getNumberParam('raceReconnectMaxMs', 10000);
  const RACE_BANNER_TRANSIENT_MS = getNumberParam('raceBannerMs', 4000);
  const RACE_SOUND_ENABLED = getBooleanParam('raceSound', RACE_MODE);
  const RACE_SOUND_VOLUME = Math.max(0, Math.min(1, getNumberParamAllowZero('raceSoundVolume', 0.35)));

  const remoteVideo = document.getElementById('remote_video');
  const endpointInput = document.getElementById('endpoint');
  const dataTextInput = document.getElementById('data_text');
  const steeringInput = document.getElementById('steering');
  const throttleInput = document.getElementById('throttle');
  const steeringValue = document.getElementById('steeringValue');
  const throttleValue = document.getElementById('throttleValue');
  const wsState = document.getElementById('wsState');
  const iceState = document.getElementById('iceState');
  const dcState = document.getElementById('dcState');
  const hostState = document.getElementById('hostState');
  const timeState = document.getElementById('timeState');
  const linkState = document.getElementById('linkState');
  const videoState = document.getElementById('videoState');
  const fpsState = document.getElementById('fpsState');
  const renderFpsState = document.getElementById('renderFpsState');
  const netState = document.getElementById('netState');
  const jitterState = document.getElementById('jitterState');
  const rttState = document.getElementById('rttState');
  const dcRttState = document.getElementById('dcRttState');
  const micTxState = document.getElementById('micTxState');
  const latencyState = document.getElementById('latencyState');
  const dropState = document.getElementById('dropState');
  const uptimeState = document.getElementById('uptimeState');
  const retryState = document.getElementById('retryState');
  const lastEventState = document.getElementById('lastEventState');
  const diagState = document.getElementById('diagState');
  const videoAgeState = document.getElementById('videoAgeState');
  const rcState = document.getElementById('rcState');
  const telemetryState = document.getElementById('telemetryState');
  const modeState = document.getElementById('modeState');
  const deviceState = document.getElementById('deviceState');
  const raceBanner = document.getElementById('raceBanner');
  const raceBannerTitle = document.getElementById('raceBannerTitle');
  const raceBannerMain = document.getElementById('raceBannerMain');
  const raceBannerSub = document.getElementById('raceBannerSub');
  const racePhaseState = document.getElementById('racePhaseState');
  const raceFlagState = document.getElementById('raceFlagState');
  const raceNameState = document.getElementById('raceNameState');
  const raceTotalLapsState = document.getElementById('raceTotalLapsState');
  const racePositionState = document.getElementById('racePositionState');
  const raceLapState = document.getElementById('raceLapState');
  const raceWsState = document.getElementById('raceWsState');
  const btnReconnect = document.getElementById('btnReconnect');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnFlip = document.getElementById('btnFlip');
  const btnMirror = document.getElementById('btnMirror');
  const btnSwapControls = document.getElementById('btnSwapControls');
  const btnAudio = document.getElementById('btnAudio');
  const btnAudioFilter = document.getElementById('btnAudioFilter');
  const btnMic = document.getElementById('btnMic');
  const btnMicTone = document.getElementById('btnMicTone');
  const micVolumeInput = document.getElementById('micVolume');
  const micMeter = document.getElementById('micMeter');
  const btnDebug = document.getElementById('btnDebug');
  const modeSelect = document.getElementById('modeSelect');
  const btnApplyMode = document.getElementById('btnApplyMode');
  const btnRefreshMode = document.getElementById('btnRefreshMode');
  const btnRefreshDevice = document.getElementById('btnRefreshDevice');
  const btnInputSetup = document.getElementById('btnInputSetup');
  const btnDrive = document.getElementById('btnDrive');
  const btnSend = document.getElementById('btnSend');
  const btnNeutral = document.getElementById('btnNeutral');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const gearState = document.getElementById('gearState');
  const gearButtons = Array.from(document.querySelectorAll('.gear-button'));

  let ws = null;
  let peerConnection = null;
  let dataChannel = null;
  let candidates = [];
  let hasReceivedSdp = false;
  let fpsFrameCount = 0;
  let fpsStartedAt = performance.now();
  let lastTotalVideoFrames = 0;
  let lastQualitySampleAt = performance.now();
  let lastVideoFrameAt = 0;
  let lastDecodedFrameAt = 0;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let reconnectReason = '';
  let reconnectAfter = 0;
  let shouldReconnect = AUTO_START;
  let connectStartedAt = 0;
  let connectedAt = 0;
  let visibleSince = performance.now();
  let reconnectCount = 0;
  let lastEvent = 'start';
  let lastReconnectAt = 0;
  let lastReconnectReason = '';
  let lastWsClose = 'n/a';
  let eventLog = [];
  const eventCounters = {
    videoLost: 0,
    noVideo: 0,
    wsClosed: 0,
    wsError: 0,
    peerClosed: 0,
    dcClosed: 0,
    roomFull: 0,
    iceFailed: 0,
    pcFailed: 0,
  };
  let modeOptions = [];
  let lastStatsSampleAt = 0;
  let lastBytesReceived = 0;
  let lastPacketsReceived = 0;
  let lastPacketsLost = 0;
  let lastFramesDropped = 0;
  let lastJitterBufferDelay = 0;
  let lastJitterBufferEmittedCount = 0;
  let lastTotalProcessingDelay = 0;
  let lastFramesDecoded = 0;
  let decodedFrameHistory = [];
  let lastMicInputPeak = 0;
  let lastMicTxSampleAt = 0;
  let lastMicTxBytesSent = 0;
  let lastMicTxPacketsSent = 0;
  let lastMicTxReportId = '';
  let lastMicTxStatus = 'n/a';
  let rcDriveEnabled = false;
  let currentGear = RC_INITIAL_GEAR;
  let rcTxTimer = null;
  let rcBrakeTimer = null;
  let lastRcCommand = 'S:1500,T:1500';
  let lastTelemetry = 'n/a';
  let dcPingSeq = 0;
  let dcRttMs = null;
  let lastDcPongAt = 0;
  let lastDeviceHostHint = '';
  const pendingDcPings = new Map();
  let deviceClock = null;
  const pressedControlKeys = new Set();
  const activeRcPointers = new Map();
  const gamepadButtonState = new Map();
  let gamepadSeen = false;
  let lastGamepadAt = 0;
  let lastGamepadStatus = 'n/a';
  let ayameIceServers = [];
  let audioContext = null;
  let audioSourceNode = null;
  let audioGainNode = null;
  let audioFilterNodes = [];
  let audioFilterEnabled = false;
  let audioSender = null;
  let micEnabled = false;
  let micToneEnabled = false;
  let micStream = null;
  let micAudioContext = null;
  let micSourceNode = null;
  let micToneNode = null;
  let micToneGainNode = null;
  let micGainNode = null;
  let micAnalyserNode = null;
  let micDestinationNode = null;
  let micOutputTrack = null;
  let micMeterTimer = null;
  let audioTransceiver = null;
  let silentAudioContext = null;
  let silentSourceNode = null;
  let silentGainNode = null;
  let silentDestinationNode = null;
  let silentAudioTrack = null;
  let roomLease = null;
  let roomLockStatus = null;
  let roomLockBusy = false;
  let roomLockStatusTimer = null;
  let roomLockHeartbeatTimer = null;
  let roomLockHeartbeatFailures = 0;
  let raceWs = null;
  let raceState = null;
  let raceReconnectTimer = null;
  let raceReconnectAttempt = 0;
  let raceReconnectEnabled = RACE_MODE;
  let lastRaceMessageAt = 0;
  let lastRaceBannerEventKey = '';
  let raceBannerVisibleUntil = 0;
  let raceBannerHideTimer = null;
  let raceAudioContext = null;
  let raceSoundUnlocked = false;
  let lastRaceSoundKey = '';
  let raceCountdownTimer = null;
  const gamepadPedalIdle = {
    throttle: GAMEPAD_THROTTLE_IDLE,
    brake: GAMEPAD_BRAKE_IDLE,
  };

  function getUrlParams() {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.replace(/^#\??/, '');
    if (!hash) {
      return params;
    }
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
    return params;
  }

  function loadGamepadProfile() {
    try {
      const raw = window.localStorage?.getItem(GAMEPAD_PROFILE_STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function getNumberParamWithProfile(paramName, profileName, defaultValue, integer = false) {
    const params = getUrlParams();
    const raw = params.get(paramName);
    if (raw !== null) {
      const value = Number(raw);
      if (Number.isFinite(value)) {
        return integer ? Math.trunc(value) : value;
      }
      return defaultValue;
    }
    const profileValue = GAMEPAD_PROFILE[profileName];
    if (Number.isFinite(profileValue)) {
      return integer ? Math.trunc(profileValue) : profileValue;
    }
    return defaultValue;
  }

  function hasNumberParamWithProfile(paramName, profileName) {
    const params = getUrlParams();
    if (params.has(paramName)) {
      return Number.isFinite(Number(params.get(paramName)));
    }
    return Number.isFinite(GAMEPAD_PROFILE[profileName]);
  }

  function getBooleanParamWithProfile(paramName, profileName, defaultValue) {
    const params = getUrlParams();
    const raw = params.get(paramName);
    if (raw !== null) {
      return raw !== '0' && raw !== 'false';
    }
    const profileValue = GAMEPAD_PROFILE[profileName];
    if (typeof profileValue === 'boolean') {
      return profileValue;
    }
    return defaultValue;
  }

  function getEffectiveSteeringGain(rawGain, calibrated) {
    if (!calibrated) {
      return rawGain;
    }
    if (Math.abs(rawGain - 4.0) < 0.001 || Math.abs(rawGain - 3.75) < 0.001) {
      return 1.0;
    }
    return rawGain;
  }

  function getInitialHost() {
    const params = getUrlParams();
    const host = params.get('host');
    if (host) {
      return host;
    }
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.host || DEFAULT_HOST;
    }
    return DEFAULT_HOST;
  }

  function getNumberParam(name, defaultValue) {
    const params = getUrlParams();
    const value = Number(params.get(name));
    return Number.isFinite(value) && value > 0 ? value : defaultValue;
  }

  function getNumberParamAllowZero(name, defaultValue) {
    const params = getUrlParams();
    const raw = params.get(name);
    if (raw === null) {
      return defaultValue;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : defaultValue;
  }

  function getIntegerParam(name, defaultValue) {
    const params = getUrlParams();
    const raw = params.get(name);
    if (raw === null) {
      return defaultValue;
    }
    const value = Number(raw);
    return Number.isInteger(value) ? value : defaultValue;
  }

  function getBooleanParam(name, defaultValue) {
    const params = getUrlParams();
    const value = params.get(name);
    if (value === null) {
      return defaultValue;
    }
    return value !== '0' && value !== 'false';
  }

  function getOptionalBooleanParam(name) {
    const params = getUrlParams();
    const value = params.get(name);
    if (value === null) {
      return null;
    }
    return value !== '0' && value !== 'false';
  }

  function getAudioOpusMaxBitrateBps() {
    const params = getUrlParams();
    const bps = Number(params.get('audioOpusMaxBitrate'));
    if (Number.isFinite(bps) && bps > 0) {
      return Math.trunc(bps);
    }
    const kbps = Number(params.get('audioOpusMaxKbps'));
    if (Number.isFinite(kbps) && kbps > 0) {
      return Math.trunc(kbps * 1000);
    }
    return 0;
  }

  function setElementHidden(element, hidden) {
    if (!element) {
      return;
    }
    element.hidden = hidden;
    element.style.display = hidden ? 'none' : '';
  }

  function applyMediaControlsVisibility() {
    const hidden = !MEDIA_CONTROLS_VISIBLE;
    document.body.classList.toggle('media-controls-hidden', hidden);
    setElementHidden(btnAudio?.closest('.media-control') || btnAudio, hidden);
    setElementHidden(btnAudioFilter, hidden);
    setElementHidden(micTxState?.closest('.debug-only'), hidden);
  }

  function getStringParam(names, defaultValue = '') {
    const params = getUrlParams();
    for (const name of names) {
      const value = params.get(name);
      if (value !== null && value.trim() !== '') {
        return value.trim();
      }
    }
    return defaultValue;
  }

  function getStringListParam(names, defaultValue = []) {
    const raw = getStringParam(names, '');
    if (!raw) {
      return defaultValue;
    }
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function normalizeIceMode(value) {
    const mode = String(value || '').toLowerCase();
    return ['auto', 'turn', 'stun', 'none'].includes(mode) ? mode : 'auto';
  }

  function normalizeBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function defaultRoomLockUrl() {
    if (!AYAME_SIGNALING_URL) {
      return '';
    }
    try {
      const url = new URL(AYAME_SIGNALING_URL);
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      url.pathname = '/fpv-lock';
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/+$/, '');
    } catch (_) {
      return '';
    }
  }

  function createRandomIdPart() {
    const bytes = new Uint8Array(6);
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(36).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).slice(2, 12);
  }

  function createAyameClientId() {
    return `fpv-viewer-${Date.now().toString(36)}-${createRandomIdPart()}`;
  }

  function getAyameClientId() {
    const configured = getStringParam(['clientId', 'ayameClientId'], '');
    if (configured && configured.toLowerCase() !== 'auto') {
      return configured;
    }
    return createAyameClientId();
  }

  function isAyameSignaling() {
    return SIGNALING_MODE === 'ayame';
  }

  function getDeviceStatusMode() {
    const params = getUrlParams();
    const value = (params.get('deviceStatus') || '').toLowerCase();
    if (value === '') {
      return 'off';
    }
    if (value === '1' || value === 'true' || value === 'poll' || value === 'on') {
      return 'poll';
    }
    if (value === 'debug') {
      return 'debug';
    }
    if (value === 'once') {
      return 'once';
    }
    return 'off';
  }

  function isDebugEnabledByDefault() {
    const params = getUrlParams();
    const debug = params.get('debug');
    return debug === '1' || debug === 'true';
  }

  function isFlipEnabledByDefault() {
    const params = getUrlParams();
    const flip = params.get('flip');
    return flip !== '0' && flip !== 'false';
  }

  function isMirrorEnabledByDefault() {
    const params = getUrlParams();
    const mirror = params.get('mirror');
    return mirror === '1' || mirror === 'true';
  }

  function isControlsSwappedByDefault() {
    const params = getUrlParams();
    const value = params.get('swapControls') || params.get('controlsSwapped');
    return value === '1' || value === 'true';
  }

  function setDebugOsd(enabled) {
    document.body.classList.toggle('debug-osd', enabled);
    btnDebug.textContent = enabled ? 'Debug On' : 'Debug';
    btnDebug.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    updateHostUi();
    updateDebugDeviceState();
  }

  function toggleDebugOsd() {
    setDebugOsd(!document.body.classList.contains('debug-osd'));
  }

  function setVideoFlip(enabled) {
    document.body.classList.toggle('flip-video', enabled);
    btnFlip.textContent = enabled ? 'Flip On' : 'Flip';
    btnFlip.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  function toggleVideoFlip() {
    setVideoFlip(!document.body.classList.contains('flip-video'));
  }

  function setVideoMirror(enabled) {
    document.body.classList.toggle('mirror-video', enabled);
    btnMirror.textContent = enabled ? 'Mirror On' : 'Mirror';
    btnMirror.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  function toggleVideoMirror() {
    setVideoMirror(!document.body.classList.contains('mirror-video'));
  }

  function setControlsSwapped(enabled) {
    document.body.classList.toggle('controls-swapped', enabled);
    btnSwapControls.textContent = enabled ? 'Swap On' : 'Swap';
    btnSwapControls.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  function toggleControlsSwapped() {
    setControlsSwapped(!document.body.classList.contains('controls-swapped'));
  }

  function ensureAudioGraph() {
    if (audioContext && audioSourceNode && audioGainNode) {
      return true;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      recordEvent('audio filter unavailable', 'no AudioContext');
      return false;
    }
    try {
      audioContext = audioContext || new AudioContextCtor();
      audioSourceNode = audioSourceNode || audioContext.createMediaElementSource(remoteVideo);
      audioGainNode = audioGainNode || audioContext.createGain();
      audioFilterNodes = AUDIO_FILTER_FREQS.map((frequency) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'notch';
        filter.frequency.value = frequency;
        filter.Q.value = AUDIO_FILTER_Q;
        return filter;
      });
      connectAudioGraph();
      return true;
    } catch (error) {
      recordEvent('audio filter failed', error.message || String(error));
      return false;
    }
  }

  function connectAudioGraph() {
    if (!audioSourceNode || !audioGainNode || !audioContext) {
      return;
    }
    try {
      audioSourceNode.disconnect();
      audioFilterNodes.forEach((node) => node.disconnect());
      audioGainNode.disconnect();
    } catch (_) {
    }

    let node = audioSourceNode;
    if (audioFilterEnabled) {
      for (const filter of audioFilterNodes) {
        node.connect(filter);
        node = filter;
      }
    }
    node.connect(audioGainNode);
    audioGainNode.connect(audioContext.destination);
    audioGainNode.gain.value = remoteVideo.muted ? 0 : 1;
  }

  function setAudioFilterEnabled(enabled) {
    audioFilterEnabled = Boolean(enabled);
    if (btnAudioFilter) {
      btnAudioFilter.textContent = audioFilterEnabled ? 'Filter On' : 'Filter';
      btnAudioFilter.setAttribute('aria-pressed', audioFilterEnabled ? 'true' : 'false');
    }
    if (!audioFilterEnabled && !audioContext) {
      return;
    }
    if (ensureAudioGraph()) {
      connectAudioGraph();
    }
  }

  function toggleAudioFilter() {
    setAudioFilterEnabled(!audioFilterEnabled);
    audioContext?.resume?.().catch(() => {});
    remoteVideo.play?.().catch(() => {});
  }

  function setAudioEnabled(enabled) {
    remoteVideo.muted = !enabled;
    remoteVideo.volume = enabled ? 1 : 0;
    if (audioGainNode) {
      audioGainNode.gain.value = enabled ? 1 : 0;
    }
    btnAudio.textContent = enabled ? 'Audio On' : 'Audio';
    btnAudio.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  function toggleAudio() {
    setAudioEnabled(remoteVideo.muted);
    audioContext?.resume?.().catch(() => {});
    remoteVideo.play?.().catch(() => {});
  }

  function canUseMicrophone() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function isMicrophoneOriginAllowed() {
    return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function getMicVolume() {
    const value = Number(micVolumeInput?.value ?? MIC_DEFAULT_VOLUME);
    return Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : MIC_DEFAULT_VOLUME;
  }

  function setMicMeterLevel(level) {
    if (!micMeter) {
      return;
    }
    micMeter.dataset.level = String(Math.max(0, Math.min(4, Math.round(level))));
  }

  function updateMicUi(detail = '') {
    if (!btnMic) {
      return;
    }
    const blocked = !canUseMicrophone() || !isMicrophoneOriginAllowed();
    btnMic.disabled = blocked;
    if (blocked) {
      btnMic.textContent = 'Mic Block';
      btnMic.title = 'Microphone requires HTTPS, localhost, or a browser insecure-origin exception.';
      btnMic.setAttribute('aria-pressed', 'false');
      if (btnMicTone) {
        btnMicTone.disabled = !window.isSecureContext;
        btnMicTone.textContent = 'Tone';
        btnMicTone.title = 'Send a browser-generated test tone to the car speaker.';
        btnMicTone.setAttribute('aria-pressed', 'false');
      }
      setMicMeterLevel(0);
      return;
    }
    btnMic.textContent = micEnabled ? 'Mic On' : 'Mic';
    btnMic.title = detail || (micEnabled ? 'Sending browser microphone to the car speaker.' : 'Start sending browser microphone to the car speaker.');
    btnMic.setAttribute('aria-pressed', micEnabled ? 'true' : 'false');
    if (btnMicTone) {
      btnMicTone.disabled = false;
      btnMicTone.textContent = micToneEnabled ? 'Tone On' : 'Tone';
      btnMicTone.title = micToneEnabled ? 'Sending test tone to the car speaker.' : 'Send a browser-generated test tone to the car speaker.';
      btnMicTone.setAttribute('aria-pressed', micToneEnabled ? 'true' : 'false');
    }
    if (!micEnabled) {
      setMicMeterLevel(0);
    }
  }

  function setMicVolume(value = getMicVolume()) {
    const volume = Math.max(0, Math.min(200, Number(value) || 0));
    if (micVolumeInput && micVolumeInput.value !== String(volume)) {
      micVolumeInput.value = String(volume);
    }
    if (micGainNode) {
      micGainNode.gain.value = volume / 100;
    }
  }

  function startMicMeter() {
    if (micMeterTimer || !micAnalyserNode) {
      return;
    }
    const samples = new Uint8Array(micAnalyserNode.fftSize);
    micMeterTimer = window.setInterval(() => {
      if (!micEnabled || !micAnalyserNode) {
        setMicMeterLevel(0);
        return;
      }
      micAnalyserNode.getByteTimeDomainData(samples);
      let peak = 0;
      for (const value of samples) {
        peak = Math.max(peak, Math.abs(value - 128));
      }
      lastMicInputPeak = peak / 128;
      setMicMeterLevel(Math.min(4, Math.ceil((peak / 128) * 5)));
    }, MIC_METER_INTERVAL_MS);
  }

  function stopMicMeter() {
    if (micMeterTimer) {
      window.clearInterval(micMeterTimer);
      micMeterTimer = null;
    }
    lastMicInputPeak = 0;
    setMicMeterLevel(0);
  }

  function stopLocalMic(options = {}) {
    const stopInput = options.stopInput !== false;
    if (stopInput && micStream) {
      for (const track of micStream.getTracks()) {
        try { track.stop(); } catch (_) {}
      }
    }
    if (micOutputTrack) {
      try { micOutputTrack.stop(); } catch (_) {}
    }
    try { micToneNode?.stop(); } catch (_) {}
    try { micSourceNode?.disconnect(); } catch (_) {}
    try { micToneNode?.disconnect(); } catch (_) {}
    try { micToneGainNode?.disconnect(); } catch (_) {}
    try { micGainNode?.disconnect(); } catch (_) {}
    try { micAnalyserNode?.disconnect(); } catch (_) {}
    if (stopInput) {
      micStream = null;
    }
    micSourceNode = null;
    micToneNode = null;
    micToneGainNode = null;
    micGainNode = null;
    micAnalyserNode = null;
    micDestinationNode = null;
    micOutputTrack = null;
    stopMicMeter();
  }

  function getTrackDebugState(track) {
    if (!track) {
      return 'none';
    }
    return `${track.readyState}/${track.enabled ? 'on' : 'off'}`;
  }

  function getMicDebugState() {
    const inputTracks = micStream ? micStream.getAudioTracks() : [];
    const gainValue = micGainNode ? micGainNode.gain.value.toFixed(2) : 'none';
    return [
      `enabled=${micEnabled ? '1' : '0'}`,
      `tone=${micToneEnabled ? '1' : '0'}`,
      `sender=${getTrackDebugState(audioSender?.track || null)}`,
      `output=${getTrackDebugState(micOutputTrack)}`,
      `silent=${getTrackDebugState(silentAudioTrack)}`,
      `input=${inputTracks.map(getTrackDebugState).join(',') || 'none'}`,
      `ctx=${micAudioContext?.state || 'none'}`,
      `gain=${gainValue}`,
    ].join(' ');
  }

  async function ensureSilentAudioTrack() {
    if (silentAudioTrack && silentAudioTrack.readyState === 'live') {
      return silentAudioTrack;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('AudioContext unavailable');
    }

    silentAudioContext = silentAudioContext || new AudioContextCtor();
    silentDestinationNode = silentAudioContext.createMediaStreamDestination();
    silentGainNode = silentAudioContext.createGain();
    silentGainNode.gain.value = 0;
    if (typeof silentAudioContext.createConstantSource === 'function') {
      silentSourceNode = silentAudioContext.createConstantSource();
      silentSourceNode.offset.value = 0;
    } else {
      silentSourceNode = silentAudioContext.createOscillator();
      silentSourceNode.frequency.value = 20;
    }
    silentSourceNode.connect(silentGainNode);
    silentGainNode.connect(silentDestinationNode);
    silentSourceNode.start();
    silentAudioTrack = silentDestinationNode.stream.getAudioTracks()[0] || null;
    if (!silentAudioTrack) {
      throw new Error('silent audio track unavailable');
    }
    silentAudioTrack.enabled = true;
    return silentAudioTrack;
  }

  async function attachMicTrackToSender(track = micEnabled ? micOutputTrack : null) {
    if (!audioSender) {
      return;
    }
    const nextTrack = track || null;
    if (audioSender.track === nextTrack) {
      return;
    }
    await audioSender.replaceTrack(nextTrack);
  }

  async function ensureLocalMic(options = {}) {
    const forceOutputTrack = options.forceOutputTrack === true;
    const forceInputStream = options.forceInputStream === true;
    micToneEnabled = false;
    const hasLiveInput = Boolean(
      micStream?.getAudioTracks().some((track) => track.readyState === 'live'),
    );
    if (!forceOutputTrack && micOutputTrack && micOutputTrack.readyState === 'live' && hasLiveInput) {
      micOutputTrack.enabled = true;
      await micAudioContext?.resume?.();
      setMicVolume();
      startMicMeter();
      return;
    }
    if (hasLiveInput && !forceInputStream) {
      stopLocalMic({ stopInput: false });
    } else {
      stopLocalMic();
      if (!canUseMicrophone()) {
        throw new Error('microphone API unavailable');
      }
      if (!isMicrophoneOriginAllowed()) {
        throw new Error('microphone requires HTTPS or localhost');
      }

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('AudioContext unavailable');
    }

    micAudioContext = micAudioContext || new AudioContextCtor();
    await micAudioContext.resume?.();
    micSourceNode = micAudioContext.createMediaStreamSource(micStream);
    micGainNode = micAudioContext.createGain();
    micAnalyserNode = micAudioContext.createAnalyser();
    micAnalyserNode.fftSize = 256;
    micDestinationNode = micAudioContext.createMediaStreamDestination();
    micSourceNode.connect(micGainNode);
    micGainNode.connect(micAnalyserNode);
    micAnalyserNode.connect(micDestinationNode);
    micOutputTrack = micDestinationNode.stream.getAudioTracks()[0] || null;
    if (!micOutputTrack) {
      throw new Error('microphone output track unavailable');
    }
    micOutputTrack.enabled = true;
    setMicVolume();
    startMicMeter();
  }

  async function ensureMicTone(options = {}) {
    const forceOutputTrack = options.forceOutputTrack === true;
    if (!forceOutputTrack && micOutputTrack && micOutputTrack.readyState === 'live' && micToneNode) {
      micOutputTrack.enabled = true;
      await micAudioContext?.resume?.();
      setMicVolume();
      startMicMeter();
      return;
    }
    stopLocalMic();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('AudioContext unavailable');
    }

    micAudioContext = micAudioContext || new AudioContextCtor();
    await micAudioContext.resume?.();
    micToneNode = micAudioContext.createOscillator();
    micToneNode.type = 'sine';
    micToneNode.frequency.value = 880;
    micToneGainNode = micAudioContext.createGain();
    micToneGainNode.gain.value = 0.2;
    micGainNode = micAudioContext.createGain();
    micAnalyserNode = micAudioContext.createAnalyser();
    micAnalyserNode.fftSize = 256;
    micDestinationNode = micAudioContext.createMediaStreamDestination();
    micToneNode.connect(micToneGainNode);
    micToneGainNode.connect(micGainNode);
    micGainNode.connect(micAnalyserNode);
    micAnalyserNode.connect(micDestinationNode);
    micToneNode.start();
    micOutputTrack = micDestinationNode.stream.getAudioTracks()[0] || null;
    if (!micOutputTrack) {
      throw new Error('test tone output track unavailable');
    }
    micOutputTrack.enabled = true;
    setMicVolume();
    startMicMeter();
  }

  async function restoreMicTrackForNewPeer() {
    if (!micEnabled) {
      await attachMicTrackToSender();
      return;
    }
    if (micToneEnabled) {
      await ensureMicTone({ forceOutputTrack: true });
    } else {
      await ensureLocalMic({ forceInputStream: true, forceOutputTrack: true });
    }
    await attachMicTrackToSender(micOutputTrack);
  }

  async function setMicEnabled(enabled) {
    if (!btnMic) {
      return;
    }
    if (!enabled) {
      micEnabled = false;
      micToneEnabled = false;
      await attachMicTrackToSender().catch((error) => {
        recordEvent('mic mute failed', error.message || String(error));
      });
      stopLocalMic();
      updateMicUi();
      recordEvent('mic off', getMicDebugState());
      return;
    }

    try {
      micToneEnabled = false;
      await ensureLocalMic();
      micEnabled = true;
      await attachMicTrackToSender(micOutputTrack);
      updateMicUi();
      recordEvent('mic on', getMicDebugState());
      reconnectIfMicNeedsNegotiation();
    } catch (error) {
      micEnabled = false;
      stopLocalMic();
      await attachMicTrackToSender().catch(() => {});
      updateMicUi(error.message || String(error));
      recordEvent('mic failed', error.message || String(error));
    }
  }

  async function setMicToneEnabled(enabled) {
    if (!btnMicTone) {
      return;
    }
    if (!enabled) {
      micToneEnabled = false;
      if (micEnabled) {
        try {
          await ensureLocalMic();
          await attachMicTrackToSender(micOutputTrack);
          updateMicUi();
          recordEvent('mic tone off', getMicDebugState());
        } catch (error) {
          micEnabled = false;
          stopLocalMic();
          await attachMicTrackToSender().catch(() => {});
          updateMicUi(error.message || String(error));
          recordEvent('mic tone off failed', error.message || String(error));
        }
      } else {
        await attachMicTrackToSender().catch(() => {});
        stopLocalMic();
        updateMicUi();
        recordEvent('mic tone off', getMicDebugState());
      }
      return;
    }

    try {
      micToneEnabled = true;
      micEnabled = true;
      await ensureMicTone();
      await attachMicTrackToSender(micOutputTrack);
      updateMicUi();
      recordEvent('mic tone on', getMicDebugState());
      reconnectIfMicNeedsNegotiation();
    } catch (error) {
      micToneEnabled = false;
      micEnabled = false;
      stopLocalMic();
      await attachMicTrackToSender().catch(() => {});
      updateMicUi(error.message || String(error));
      recordEvent('mic tone failed', error.message || String(error));
    }
  }

  function reconnectIfMicNeedsNegotiation() {
    if (!micEnabled || !peerConnection || reconnectTimer) {
      return;
    }
    const direction = audioTransceiver?.currentDirection || audioTransceiver?.direction || '';
    if (direction.includes('send')) {
      return;
    }
    recordEvent('mic renegotiate', `direction=${direction || 'none'} ${getMicDebugState()}`);
    scheduleReconnect('mic negotiation', {
      force: true,
      baseDelayMs: 100,
      maxDelayMs: 100,
    });
  }

  function toggleMic() {
    setMicEnabled(!micEnabled);
  }

  function toggleMicTone() {
    setMicToneEnabled(!micToneEnabled);
  }

  function setText(element, value) {
    if (!element) {
      return;
    }
    element.textContent = value;
  }

  function getRaceWsStatus() {
    return raceWs ? ['connecting', 'open', 'closing', 'closed'][raceWs.readyState] : 'closed';
  }

  function normalizeRaceControlUrl() {
    if (!RACE_URL_RAW) {
      return '';
    }
    try {
      const url = new URL(RACE_URL_RAW, location.href);
      if (url.protocol === 'https:') {
        url.protocol = 'wss:';
      } else if (url.protocol === 'http:') {
        url.protocol = 'ws:';
      }
      if (RACE_CAR_ID && !url.searchParams.has('carId')) {
        url.searchParams.set('carId', RACE_CAR_ID);
      }
      if (RACE_TOKEN && !url.searchParams.has('viewerToken')) {
        url.searchParams.set('viewerToken', RACE_TOKEN);
      }
      return url.toString();
    } catch (error) {
      recordEvent('race url invalid', error.message || String(error));
      return '';
    }
  }

  function getRaceSelf(state = raceState) {
    if (!state) {
      return null;
    }
    if (state.self) {
      return state.self;
    }
    if (!RACE_CAR_ID || !Array.isArray(state.leaderboard)) {
      return null;
    }
    return state.leaderboard.find((item) => item && item.carId === RACE_CAR_ID) || null;
  }

  function getRaceInfo(state = raceState) {
    if (!state || !state.raceInfo || typeof state.raceInfo !== 'object') {
      return {};
    }
    return state.raceInfo;
  }

  function formatRaceName(state = raceState) {
    const title = getRaceInfo(state).title;
    if (typeof title === 'string' && title.trim()) {
      return title.trim();
    }
    return 'n/a';
  }

  function formatRaceTotalLaps(state = raceState) {
    const totalLaps = Number(getRaceInfo(state).totalLaps);
    if (!Number.isFinite(totalLaps) || totalLaps <= 0) {
      return 'n/a';
    }
    return String(Math.floor(totalLaps));
  }

  function formatRacePosition(self) {
    if (!self || !Number.isFinite(self.position)) {
      return 'n/a';
    }
    return `P${self.position}`;
  }

  function formatRaceLap(self, state = raceState) {
    if (!self || !Number.isFinite(self.lap)) {
      return 'n/a';
    }
    const totalLaps = Number(getRaceInfo(state).totalLaps);
    const lapText = Number.isFinite(totalLaps) && totalLaps > 0
      ? `${self.lap}/${Math.floor(totalLaps)}`
      : String(self.lap);
    if (Number.isFinite(self.lastLapMs)) {
      return `${lapText} ${formatMs(self.lastLapMs)}`;
    }
    return lapText;
  }

  function formatMs(value) {
    if (!Number.isFinite(value)) {
      return '--';
    }
    const ms = Math.max(0, Math.round(value));
    const seconds = Math.floor(ms / 1000);
    const millis = String(ms % 1000).padStart(3, '0');
    return `${seconds}.${millis}`;
  }

  function getRaceCountdownText(state) {
    if (!state) {
      return '';
    }
    if (Number.isFinite(state.startAtMs)) {
      const remaining = Math.ceil((Number(state.startAtMs) - Date.now()) / 1000);
      if (remaining > 0) {
        return String(remaining);
      }
      return '';
    }
    if (Number.isFinite(state.countdown) && Number(state.countdown) > 0) {
      return String(Math.ceil(Number(state.countdown)));
    }
    return '';
  }

  function getRaceBannerMain(state = raceState) {
    if (!RACE_MODE) {
      return 'Race';
    }
    if (!RACE_URL_RAW) {
      return 'Race URL missing';
    }
    if (!state) {
      return getRaceWsStatus() === 'open' ? 'Race waiting' : 'Race connecting';
    }
    const countdown = getRaceCountdownText(state);
    if (countdown) {
      return countdown;
    }
    switch (state.phase) {
      case 'ready':
        return 'READY';
      case 'countdown':
        return 'START';
      case 'green':
        return 'GO';
      case 'paused':
        return state.flag === 'red' ? 'RED FLAG' : 'PAUSED';
      case 'finished':
        return 'FINISH';
      default:
        return String(state.phase || 'idle').toUpperCase();
    }
  }

  function getRaceBannerSub(state = raceState) {
    if (!RACE_MODE) {
      return 'off';
    }
    if (!RACE_URL_RAW) {
      return 'set raceUrl';
    }
    if (!state) {
      return getRaceWsStatus();
    }
    const self = getRaceSelf(state);
    const parts = [];
    const raceName = formatRaceName(state);
    if (raceName !== 'n/a') {
      parts.push(raceName);
    }
    if (state.message) {
      parts.push(String(state.message));
    }
    if (state.flag && state.flag !== 'none') {
      parts.push(`flag ${state.flag}`);
    }
    if (self) {
      parts.push(`${formatRacePosition(self)} lap ${Number.isFinite(self.lap) ? self.lap : '-'}`);
    }
    return parts.join(' / ') || getRaceWsStatus();
  }

  function getRaceBannerEventKey(state = raceState) {
    if (!state) {
      return getRaceWsStatus();
    }
    const self = getRaceSelf(state);
    return [
      state.phase || '',
      state.flag || '',
      getRaceCountdownText(state),
      state.message || '',
      self && Number.isFinite(self.position) ? self.position : '',
      self && Number.isFinite(self.lap) ? self.lap : '',
      self && Number.isFinite(self.lastLapMs) ? Math.round(self.lastLapMs) : '',
    ].join('|');
  }

  function isRaceBannerPersistent(state = raceState) {
    if (!RACE_MODE) {
      return false;
    }
    if (!RACE_URL_RAW || !state) {
      return true;
    }
    if (getRaceCountdownText(state)) {
      return true;
    }
    if (state.phase === 'ready' || state.phase === 'countdown' || state.phase === 'paused' || state.phase === 'finished') {
      return true;
    }
    return state.flag === 'yellow' || state.flag === 'red' || state.flag === 'finish';
  }

  function clearRaceBannerHideTimer() {
    if (!raceBannerHideTimer) {
      return;
    }
    window.clearTimeout(raceBannerHideTimer);
    raceBannerHideTimer = null;
  }

  function clearRaceCountdownTimer() {
    if (!raceCountdownTimer) {
      return;
    }
    window.clearTimeout(raceCountdownTimer);
    raceCountdownTimer = null;
  }

  function scheduleRaceBannerHide() {
    clearRaceBannerHideTimer();
    if (!raceBannerVisibleUntil || raceBannerVisibleUntil <= performance.now()) {
      return;
    }
    raceBannerHideTimer = window.setTimeout(() => {
      raceBannerHideTimer = null;
      updateRaceUi();
    }, Math.max(0, raceBannerVisibleUntil - performance.now()));
  }

  function scheduleRaceCountdownTick(state = raceState) {
    clearRaceCountdownTimer();
    if (!state || !Number.isFinite(state.startAtMs)) {
      return;
    }
    const remainingMs = Number(state.startAtMs) - Date.now();
    if (remainingMs <= 0) {
      return;
    }
    raceCountdownTimer = window.setTimeout(() => {
      raceCountdownTimer = null;
      playRaceSoundForState(raceState);
      updateRaceUi();
      scheduleRaceCountdownTick(raceState);
    }, Math.min(250, Math.max(50, remainingMs)));
  }

  function markRaceBannerEvent(state = raceState) {
    const eventKey = getRaceBannerEventKey(state);
    if (isRaceBannerPersistent(state)) {
      lastRaceBannerEventKey = eventKey;
      raceBannerVisibleUntil = Number.POSITIVE_INFINITY;
      clearRaceBannerHideTimer();
      return;
    }
    if (eventKey !== lastRaceBannerEventKey) {
      lastRaceBannerEventKey = eventKey;
      raceBannerVisibleUntil = performance.now() + Math.max(0, RACE_BANNER_TRANSIENT_MS);
      scheduleRaceBannerHide();
    }
  }

  function isRaceBannerVisible() {
    if (!RACE_MODE) {
      return false;
    }
    if (isRaceBannerPersistent()) {
      return true;
    }
    return raceBannerVisibleUntil > performance.now();
  }

  function getRaceAudioContext() {
    if (!RACE_SOUND_ENABLED || RACE_SOUND_VOLUME <= 0) {
      return null;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      recordEvent('race sound unavailable', 'no AudioContext');
      return null;
    }
    raceAudioContext = raceAudioContext || new AudioContextCtor();
    return raceAudioContext;
  }

  function unlockRaceSound() {
    if (!RACE_SOUND_ENABLED || raceSoundUnlocked) {
      return;
    }
    const context = getRaceAudioContext();
    if (!context) {
      return;
    }
    context.resume?.()
      .then(() => {
        raceSoundUnlocked = context.state === 'running';
      })
      .catch((error) => {
        recordEvent('race sound unlock failed', error.message || String(error));
      });
  }

  function playRaceTone(frequency, startAt, durationMs, volume = RACE_SOUND_VOLUME) {
    const context = getRaceAudioContext();
    if (!context || context.state !== 'running') {
      unlockRaceSound();
      return false;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const attack = 0.008;
    const release = 0.045;
    const duration = Math.max(0.03, durationMs / 1000);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + attack);
    gain.gain.setValueAtTime(volume, Math.max(startAt + attack, startAt + duration - release));
    gain.gain.linearRampToValueAtTime(0, startAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
    return true;
  }

  function playRaceCountdownSound() {
    const context = getRaceAudioContext();
    if (!context) {
      return;
    }
    if (context.state !== 'running') {
      unlockRaceSound();
      return;
    }
    playRaceTone(880, context.currentTime, 120);
  }

  function playRaceStartSound() {
    const context = getRaceAudioContext();
    if (!context) {
      return;
    }
    if (context.state !== 'running') {
      unlockRaceSound();
      return;
    }
    const now = context.currentTime;
    playRaceTone(1046, now, 120);
    playRaceTone(1568, now + 0.14, 260, Math.min(1, RACE_SOUND_VOLUME * 1.1));
  }

  function playRaceSoundForState(state = raceState) {
    if (!RACE_SOUND_ENABLED || !state) {
      return;
    }
    const countdown = getRaceCountdownText(state);
    const soundKey = countdown ? `countdown:${countdown}` : `phase:${state.phase || ''}:flag:${state.flag || ''}`;
    if (soundKey === lastRaceSoundKey) {
      return;
    }
    lastRaceSoundKey = soundKey;
    if (countdown) {
      playRaceCountdownSound();
      return;
    }
    if (state.phase === 'green') {
      playRaceStartSound();
    }
  }

  function updateRaceUi() {
    document.body.classList.toggle('race-mode', RACE_MODE);
    setText(raceWsState, getRaceWsStatus());
    if (!RACE_MODE) {
      setText(racePhaseState, 'off');
      setText(raceFlagState, 'n/a');
      setText(raceNameState, 'n/a');
      setText(raceTotalLapsState, 'n/a');
      setText(racePositionState, 'n/a');
      setText(raceLapState, 'n/a');
      setText(raceBannerTitle, '');
      return;
    }
    const self = getRaceSelf();
    const raceName = formatRaceName();
    setText(racePhaseState, raceState?.phase || (RACE_URL_RAW ? 'waiting' : 'no url'));
    setText(raceFlagState, raceState?.flag || 'n/a');
    setText(raceNameState, raceName);
    setText(raceTotalLapsState, formatRaceTotalLaps());
    setText(racePositionState, formatRacePosition(self));
    setText(raceLapState, formatRaceLap(self));
    setText(raceBannerTitle, raceName === 'n/a' ? '' : raceName);
    setText(raceBannerMain, getRaceBannerMain());
    setText(raceBannerSub, getRaceBannerSub());
    if (raceBanner) {
      raceBanner.dataset.phase = raceState?.phase || 'waiting';
      raceBanner.dataset.flag = raceState?.flag || 'none';
      raceBanner.classList.toggle('race-banner-hidden', !isRaceBannerVisible());
    }
  }

  function clearRaceReconnectTimer() {
    if (!raceReconnectTimer) {
      return;
    }
    window.clearTimeout(raceReconnectTimer);
    raceReconnectTimer = null;
  }

  function scheduleRaceReconnect(reason) {
    if (!RACE_MODE || !raceReconnectEnabled || raceReconnectTimer) {
      return;
    }
    const delay = Math.min(
      RACE_RECONNECT_MAX_MS,
      RACE_RECONNECT_BASE_MS * (2 ** Math.min(raceReconnectAttempt, 5)),
    );
    raceReconnectAttempt += 1;
    recordEvent('race reconnect', `${reason} ${delay}ms`);
    raceReconnectTimer = window.setTimeout(() => {
      raceReconnectTimer = null;
      connectRaceControl();
    }, delay);
    updateRaceUi();
  }

  function closeRaceControl() {
    raceReconnectEnabled = false;
    clearRaceReconnectTimer();
    if (raceWs) {
      try {
        raceWs.close(1000, 'viewer closing');
      } catch (_) {
      }
    }
    raceWs = null;
    raceBannerVisibleUntil = 0;
    lastRaceBannerEventKey = '';
    clearRaceBannerHideTimer();
    clearRaceCountdownTimer();
    updateRaceUi();
  }

  function handleRaceMessage(payload) {
    if (!payload || payload.type !== 'race_state') {
      return;
    }
    raceState = payload;
    lastRaceMessageAt = performance.now();
    markRaceBannerEvent(payload);
    playRaceSoundForState(payload);
    scheduleRaceCountdownTick(payload);
    updateRaceUi();
  }

  function connectRaceControl() {
    if (!RACE_MODE) {
      return;
    }
    const raceUrl = normalizeRaceControlUrl();
    if (!raceUrl) {
      recordEvent('race disabled', 'missing raceUrl');
      updateRaceUi();
      return;
    }
    if (
      raceWs &&
      (raceWs.readyState === WebSocket.CONNECTING || raceWs.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    try {
      raceReconnectEnabled = true;
      raceWs = new WebSocket(raceUrl);
      updateRaceUi();
      raceWs.addEventListener('open', () => {
        raceReconnectAttempt = 0;
        recordEvent('race open', RACE_CAR_ID || 'no carId');
        updateRaceUi();
      });
      raceWs.addEventListener('message', (event) => {
        try {
          handleRaceMessage(JSON.parse(event.data));
        } catch (error) {
          recordEvent('race message invalid', error.message || String(error));
        }
      });
      raceWs.addEventListener('close', (event) => {
        raceWs = null;
        updateRaceUi();
        scheduleRaceReconnect(`close ${event.code}`);
      });
      raceWs.addEventListener('error', () => {
        recordEvent('race error', getRaceWsStatus());
        updateRaceUi();
      });
    } catch (error) {
      raceWs = null;
      recordEvent('race connect failed', error.message || String(error));
      scheduleRaceReconnect('connect failed');
    }
  }

  function updateConnectionUi() {
    setText(wsState, ws ? ['connecting', 'open', 'closing', 'closed'][ws.readyState] : 'closed');
    setText(iceState, peerConnection ? peerConnection.iceConnectionState : 'new');
    setText(dcState, dataChannel ? dataChannel.readyState : 'closed');
    setText(linkState, getLinkStatus());
    setText(videoState, getVideoStatus());

    const canSend = dataChannel && dataChannel.readyState === 'open';
    const active = isConnectionActive();
    const lockedByOther = isRoomLockedByOther();
    if (btnReconnect) {
      if (active) {
        btnReconnect.textContent = reconnectTimer ? 'CANCEL' : 'DISCONNECT';
        btnReconnect.dataset.state = 'connected';
        btnReconnect.disabled = false;
      } else if (roomLockBusy) {
        btnReconnect.textContent = 'CONNECTING';
        btnReconnect.dataset.state = 'connecting';
        btnReconnect.disabled = true;
      } else if (lockedByOther) {
        btnReconnect.textContent = 'BUSY';
        btnReconnect.dataset.state = 'busy';
        btnReconnect.disabled = true;
      } else {
        btnReconnect.textContent = 'CONNECT';
        btnReconnect.dataset.state = 'idle';
        btnReconnect.disabled = false;
      }
    }
    if (btnSend) {
      btnSend.disabled = !canSend;
    }
    if (btnNeutral) {
      btnNeutral.disabled = !canSend;
    }
    btnDrive.disabled = !canSend && !rcDriveEnabled;
    if (btnDisconnect) {
      btnDisconnect.disabled = !active;
    }
    updateMicUi();
  }

  function updateTimerUi() {
    updateDeviceTimeUi();
    setText(videoState, getVideoStatus());
    setText(uptimeState, getUptimeStatus());
    setText(retryState, getRetryStatus());
    setText(lastEventState, lastEvent);
    setText(diagState, getDiagnosticStatus());
    setText(videoAgeState, getVideoAgeStatus());
    setText(dcRttState, getDcRttStatus());
    setText(micTxState, lastMicTxStatus);
  }

  function updateRcUi() {
    setText(rcState, getRcStatus());
    const canSend = dataChannel && dataChannel.readyState === 'open';
    if (btnSend) {
      btnSend.disabled = !canSend;
    }
    if (btnNeutral) {
      btnNeutral.disabled = !canSend;
    }
    btnDrive.disabled = !canSend && !rcDriveEnabled;
  }

  function updateTelemetryUi() {
    setText(telemetryState, getTelemetryStatus());
  }

  function updateUiState() {
    updateConnectionUi();
    updateTimerUi();
    updateRcUi();
    updateTelemetryUi();
  }

  function updateDecodedFps(value) {
    setText(fpsState, value.toFixed(1));
  }

  function updateRenderFps(value) {
    setText(renderFpsState, value.toFixed(1));
  }

  function getLinkStatus() {
    if (reconnectTimer) {
      return 'reconnecting';
    }
    if (roomLockBusy) {
      return 'locking';
    }
    if (isRoomLockedByOther()) {
      return 'room busy';
    }
    if (!shouldReconnect && !peerConnection && !ws) {
      return 'stopped';
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return 'signaling';
    }
    if (!peerConnection) {
      return 'starting';
    }
    if (peerConnection.connectionState === 'failed') {
      return 'failed';
    }
    if (peerConnection.iceConnectionState === 'connected' ||
        peerConnection.iceConnectionState === 'completed') {
      return 'connected';
    }
    return peerConnection.iceConnectionState;
  }

  function getVideoStatus() {
    if (remoteVideo.videoWidth <= 0) {
      return 'waiting';
    }
    if (isVideoFrozen()) {
      return 'VIDEO LOST';
    }
    return `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
  }

  function getRetryStatus() {
    if (!shouldReconnect) {
      return 'off';
    }
    if (!reconnectTimer) {
      return reconnectCount === 0 ? 'standby' : `${reconnectCount}x`;
    }
    const remaining = Math.max(0, reconnectAfter - performance.now());
    return `${reconnectCount}x ${reconnectReason || 'link'} ${Math.ceil(remaining / 1000)}s`;
  }

  function getUptimeStatus() {
    if (connectedAt === 0) {
      return '0s';
    }
    return formatDuration((performance.now() - connectedAt) / 1000);
  }

  function getDiagnosticStatus() {
    return [
      `rc${reconnectCount}`,
      `vl${eventCounters.videoLost}`,
      `nv${eventCounters.noVideo}`,
      `ws${eventCounters.wsClosed}`,
      `dc${eventCounters.dcClosed}`,
      `rf${eventCounters.roomFull}`,
      `ice${eventCounters.iceFailed}`,
      `pc${eventCounters.pcFailed}`,
    ].join(' ');
  }

  function getVideoAgeStatus() {
    const lastMediaFrameAt = Math.max(lastVideoFrameAt, lastDecodedFrameAt);
    if (lastMediaFrameAt === 0) {
      return 'n/a';
    }
    return `${Math.max(0, performance.now() - lastMediaFrameAt).toFixed(0)}ms`;
  }

  function resetMicTxStats(status = 'n/a') {
    lastMicTxSampleAt = 0;
    lastMicTxBytesSent = 0;
    lastMicTxPacketsSent = 0;
    lastMicTxReportId = '';
    lastMicTxStatus = status;
    setText(micTxState, lastMicTxStatus);
  }

  function updateMicTxStats(stats, now) {
    if (!audioSender) {
      resetMicTxStats('no sender');
      return;
    }

    let outboundAudio = null;
    let audioSource = null;
    stats.forEach((report) => {
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        outboundAudio = report;
      }
    });
    if (outboundAudio?.mediaSourceId) {
      audioSource = stats.get(outboundAudio.mediaSourceId) || null;
    }
    if (!audioSource) {
      stats.forEach((report) => {
        if (!audioSource && report.type === 'media-source' && report.kind === 'audio') {
          audioSource = report;
        }
      });
    }

    const trackState = getTrackDebugState(audioSender.track);
    const direction = audioTransceiver?.currentDirection || audioTransceiver?.direction || 'none';
    const inputPercent = Math.round(Math.max(0, Math.min(1, lastMicInputPeak)) * 100);
    const sourceLevel = Number.isFinite(audioSource?.audioLevel) ? audioSource.audioLevel : null;
    const sourceText = sourceLevel === null ? 'src n/a' : `src ${sourceLevel.toFixed(4)}`;

    if (!outboundAudio) {
      resetMicTxStats(`${trackState} ${direction} no rtp in${inputPercent}%`);
      return;
    }

    const bytesSent = outboundAudio.bytesSent || 0;
    const packetsSent = outboundAudio.packetsSent || 0;
    if (lastMicTxReportId !== outboundAudio.id || lastMicTxSampleAt === 0) {
      lastMicTxReportId = outboundAudio.id;
      lastMicTxSampleAt = now;
      lastMicTxBytesSent = bytesSent;
      lastMicTxPacketsSent = packetsSent;
      lastMicTxStatus = `${trackState} ${direction} tx -- ${sourceText} in${inputPercent}%`;
      setText(micTxState, lastMicTxStatus);
      return;
    }

    const elapsedSeconds = Math.max((now - lastMicTxSampleAt) / 1000, 0.001);
    const txKbps = Math.max(0, ((bytesSent - lastMicTxBytesSent) * 8) / elapsedSeconds / 1000);
    const txPps = Math.max(0, (packetsSent - lastMicTxPacketsSent) / elapsedSeconds);
    lastMicTxStatus =
      `${trackState} ${direction} tx ${txKbps.toFixed(0)}k ${txPps.toFixed(0)}pps ${sourceText} in${inputPercent}%`;
    setText(micTxState, lastMicTxStatus);
    lastMicTxSampleAt = now;
    lastMicTxBytesSent = bytesSent;
    lastMicTxPacketsSent = packetsSent;
  }

  function getTransportSummary() {
    const wsStatus = ws ? ['connecting', 'open', 'closing', 'closed'][ws.readyState] : 'none';
    const iceStatus = peerConnection ? peerConnection.iceConnectionState : 'none';
    const pcStatus = peerConnection ? peerConnection.connectionState : 'none';
    const dcStatus = dataChannel ? dataChannel.readyState : 'none';
    return `ws=${wsStatus} ice=${iceStatus} pc=${pcStatus} dc=${dcStatus} video=${getVideoAgeStatus()}`;
  }

  function recordEvent(type, detail = '') {
    const elapsedMs = performance.now();
    const entry = {
      at: new Date().toISOString(),
      elapsedMs: Math.round(elapsedMs),
      type,
      detail,
      transport: getTransportSummary(),
      reconnectCount,
    };
    eventLog.push(entry);
    if (eventLog.length > 100) {
      eventLog.shift();
    }
    lastEvent = detail ? `${type}: ${detail}` : type;
    window.localStorage?.setItem('fpvViewerLastEvents', JSON.stringify(eventLog.slice(-20)));
    console.info('[FPV]', entry);
  }

  function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const rest = totalSeconds % 60;
    if (minutes === 0) {
      return `${rest}s`;
    }
    return `${minutes}m${rest.toString().padStart(2, '0')}s`;
  }

  function isVideoFrozen() {
    const lastMediaFrameAt = Math.max(lastVideoFrameAt, lastDecodedFrameAt);
    if (!peerConnection || remoteVideo.videoWidth <= 0 || lastMediaFrameAt === 0) {
      return false;
    }
    return performance.now() - lastMediaFrameAt > VIDEO_FREEZE_TIMEOUT_MS;
  }

  function startFpsMonitor() {
    if ('requestVideoFrameCallback' in remoteVideo) {
      const onVideoFrame = () => {
        lastVideoFrameAt = performance.now();
        fpsFrameCount += 1;
        const now = performance.now();
        const elapsed = now - fpsStartedAt;
        if (elapsed >= 1000) {
          updateRenderFps((fpsFrameCount * 1000) / elapsed);
          fpsFrameCount = 0;
          fpsStartedAt = now;
        }
        remoteVideo.requestVideoFrameCallback(onVideoFrame);
      };
      remoteVideo.requestVideoFrameCallback(onVideoFrame);
      return;
    }

    window.setInterval(() => {
      if (!remoteVideo.getVideoPlaybackQuality) {
        return;
      }
      const quality = remoteVideo.getVideoPlaybackQuality();
      const now = performance.now();
      const elapsed = now - lastQualitySampleAt;
      if (elapsed <= 0) {
        return;
      }
      const frameDelta = quality.totalVideoFrames - lastTotalVideoFrames;
      if (frameDelta > 0) {
        lastVideoFrameAt = now;
      }
      updateRenderFps((frameDelta * 1000) / elapsed);
      lastTotalVideoFrames = quality.totalVideoFrames;
      lastQualitySampleAt = now;
    }, 1000);
  }

  function buildCommand() {
    return `S:${steeringInput.value},T:${throttleInput.value}`;
  }

  function syncCommandFromSliders() {
    steeringValue.value = steeringInput.value;
    throttleValue.value = throttleInput.value;
    lastRcCommand = buildCommand();
    if (dataTextInput) {
      dataTextInput.value = lastRcCommand;
    }
    updateRcUi();
  }

  function syncCommandFromThrottleSlider() {
    cancelThrottleBrake();
    throttleInput.value = String(clampRcAxisValue('throttle', Number(throttleInput.value)));
    syncCommandFromSliders();
  }

  function sendCommand(command) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      return false;
    }
    dataChannel.send(`${command}\n`);
    lastRcCommand = command;
    return true;
  }

  function getRcStatus() {
    const mode = rcDriveEnabled ? 'drive' : 'manual';
    const link = dataChannel && dataChannel.readyState === 'open' ? 'open' : 'wait';
    const gamepad = GAMEPAD_ENABLED ? ` ${lastGamepadStatus}` : '';
    return `${mode} ${link} g${currentGear} ${lastRcCommand}${gamepad}`;
  }

  function getTelemetryStatus() {
    return lastTelemetry;
  }

  function getDcRttStatus() {
    if (dcRttMs === null) {
      return 'n/a';
    }
    const ageMs = lastDcPongAt > 0 ? performance.now() - lastDcPongAt : 0;
    return `${dcRttMs.toFixed(1)}ms ${formatDuration(ageMs / 1000)} ago`;
  }

  function parseTelemetryFields(message) {
    const fields = {};
    for (const token of message.split(/\s+/)) {
      const pos = token.indexOf('=');
      if (pos <= 0) {
        continue;
      }
      fields[token.slice(0, pos)] = token.slice(pos + 1);
    }
    return fields;
  }

  function formatTelemetryDeviceStatus(fields) {
    const parts = [];
    if (fields.host) {
      updateHostUi(fields.host);
    }
    if (fields.temp) {
      parts.push(fields.temp);
    }
    if (fields.thr) {
      parts.push(fields.thr);
    }
    if (fields.uv === '1') {
      parts.push('UV!');
    } else if (fields.uv_seen === '1') {
      parts.push('uvSeen');
    } else if (fields.uv || fields.uv_seen || fields.thr) {
      parts.push('PWRok');
    }
    if (fields.vcore) {
      parts.push(`core${fields.vcore}`);
    }
    if (fields.rssi) {
      parts.push(fields.rssi);
    }
    if (fields.freq) {
      parts.push(fields.freq);
    }
    if (fields.ssid) {
      parts.push(fields.ssid);
    }
    return parts.join(' ');
  }

  function stripPort(host) {
    const hostWithoutPort = String(host || '').split(':')[0];
    return hostWithoutPort || host || '';
  }

  function formatDebugHost(host) {
    return stripPort(host) || 'n/a';
  }

  function sanitizeDeviceLabel(label) {
    return String(label || '')
      .trim()
      .replace(/[^\w.-]/g, '')
      .slice(0, 24);
  }

  function formatPublicDeviceId(host) {
    const configured = sanitizeDeviceLabel(getStringParam(['id', 'deviceId', 'device', 'label']));
    if (configured) {
      return configured;
    }

    const hostWithoutPort = stripPort(host);
    const match = hostWithoutPort.match(/^192\.168\.11\.(\d+)$/);
    if (match) {
      return `FPV-${match[1].padStart(2, '0')}`;
    }

    const firstLabel = hostWithoutPort.split('.')[0];
    const namedMatch = firstLabel.match(/^momo-fpv-(\d+)$/i);
    if (namedMatch) {
      return `FPV-${namedMatch[1].padStart(2, '0')}`;
    }

    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort) || hostWithoutPort.includes(':')) {
      return 'FPV';
    }

    if (hostWithoutPort.includes('.')) {
      return sanitizeDeviceLabel(firstLabel) || 'FPV';
    }

    return sanitizeDeviceLabel(hostWithoutPort) || 'FPV';
  }

  function updateHostUi(host) {
    const hostHint = host || lastDeviceHostHint || getEndpointHostName();
    lastDeviceHostHint = hostHint;
    const display = isDebugOsdEnabled() ? formatDebugHost(hostHint) : formatPublicDeviceId(hostHint);
    setText(hostState, display);
  }

  function applyTelemetry(message) {
    lastTelemetry = message;
    updateTelemetryUi();

    const deviceStatus = formatTelemetryDeviceStatus(parseTelemetryFields(message));
    if (deviceStatus) {
      setText(deviceState, deviceStatus);
    }
  }

  function handleDcPong(message) {
    const parts = message.split(':');
    if (parts.length < 3) {
      return;
    }
    const seq = parts[1];
    const fallbackSentAt = Number(parts[2]);
    const sentAt = pendingDcPings.get(seq) ?? fallbackSentAt;
    pendingDcPings.delete(seq);
    if (!Number.isFinite(sentAt)) {
      return;
    }
    dcRttMs = Math.max(0, performance.now() - sentAt);
    lastDcPongAt = performance.now();
    setText(dcRttState, getDcRttStatus());
  }

  function handleDataChannelMessage(message) {
    if (typeof message === 'string' && message.startsWith('PONG:')) {
      handleDcPong(message);
      return;
    }
    if (typeof message === 'string' && message.startsWith('TEL:')) {
      applyTelemetry(message);
      return;
    }
    console.log('DataChannel RX:', message);
  }

  function clampRcValue(value, minValue = 1000, maxValue = 2000) {
    return Math.max(minValue, Math.min(maxValue, Math.round(value)));
  }

  function getThrottleGearMin() {
    return RC_THROTTLE_GEAR_MIN_VALUES[currentGear - 1] || RC_THROTTLE_MIN;
  }

  function getThrottleGearMax() {
    return RC_THROTTLE_GEAR_MAX_VALUES[currentGear - 1] || 2000;
  }

  function updateGearUi() {
    const throttleMin = getThrottleGearMin();
    const throttleMax = getThrottleGearMax();
    throttleInput.min = String(throttleMin);
    throttleInput.max = String(throttleMax);
    if (gearState) {
      gearState.textContent = `Gear ${currentGear}`;
    }
    for (const button of gearButtons) {
      button.setAttribute('aria-pressed', button.dataset.gear === String(currentGear) ? 'true' : 'false');
    }
  }

  function setThrottleGear(gear) {
    const nextGear = Math.max(1, Math.min(5, Number(gear) || 1));
    if (nextGear === currentGear) {
      updateGearUi();
      return;
    }
    currentGear = nextGear;
    updateGearUi();
    const throttle = Number(throttleInput.value);
    const limitedThrottle = clampRcAxisValue('throttle', throttle);
    if (limitedThrottle !== throttle) {
      throttleInput.value = String(limitedThrottle);
      syncCommandFromSliders();
      if (rcDriveEnabled) {
        sendCurrentRcCommand();
      }
    } else {
      syncCommandFromSliders();
    }
    recordEvent('gear', String(currentGear));
  }

  function applyNeutralDeadband(value, deadbandUs) {
    const pulse = clampRcValue(value);
    return Math.abs(pulse - 1500) <= deadbandUs ? 1500 : pulse;
  }

  function clampRcAxisValue(axis, value) {
    if (axis === 'throttle') {
      const pulse = applyNeutralDeadband(value, RC_THROTTLE_NEUTRAL_DEADBAND_US);
      const minValue = pulse < 1500 ? getThrottleGearMin() : RC_THROTTLE_MIN;
      const maxValue = pulse > 1500 ? getThrottleGearMax() : 2000;
      return clampRcValue(pulse, minValue, maxValue);
    }
    return clampRcValue(applyNeutralDeadband(value, RC_STEERING_NEUTRAL_DEADBAND_US));
  }

  function cancelThrottleBrake() {
    if (!rcBrakeTimer) {
      return;
    }
    window.clearTimeout(rcBrakeTimer);
    rcBrakeTimer = null;
  }

  function setRcInputs(steering, throttle) {
    steeringInput.value = String(clampRcValue(steering));
    throttleInput.value = String(clampRcAxisValue('throttle', throttle));
    syncCommandFromSliders();
  }

  function setRcAxis(axis, value) {
    if (axis === 'steering') {
      steeringInput.value = String(clampRcAxisValue(axis, value));
    } else if (axis === 'throttle') {
      throttleInput.value = String(clampRcAxisValue(axis, value));
    }
    syncCommandFromSliders();
  }

  function setThrottleNeutral() {
    throttleInput.value = '1500';
    syncCommandFromSliders();
    if (rcDriveEnabled) {
      sendCurrentRcCommand();
    }
  }

  function startThrottleBrake() {
    cancelThrottleBrake();
    setRcAxis('throttle', RC_BRAKE_VALUE);
    if (rcDriveEnabled) {
      sendCurrentRcCommand();
    }
    rcBrakeTimer = window.setTimeout(() => {
      rcBrakeTimer = null;
      setThrottleNeutral();
    }, RC_BRAKE_DURATION_MS);
  }

  function resetRcAxis(axis) {
    if (axis === 'throttle') {
      if (Number(throttleInput.value) > RC_BRAKE_THRESHOLD) {
        startThrottleBrake();
      } else {
        setThrottleNeutral();
      }
      return;
    }
    setRcAxis(axis, 1500);
    if (rcDriveEnabled) {
      sendCurrentRcCommand();
    }
  }

  function onRcPointerDown(axis, event) {
    if (axis === 'throttle') {
      cancelThrottleBrake();
    }
    activeRcPointers.set(event.pointerId, axis);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onRcPointerEnd(event) {
    const axis = activeRcPointers.get(event.pointerId);
    if (!axis) {
      return;
    }
    activeRcPointers.delete(event.pointerId);
    if (event.type !== 'lostpointercapture') {
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        console.debug('releasePointerCapture failed:', error);
      }
    }
    resetRcAxis(axis);
  }

  function onRcControlBlur(axis) {
    for (const [pointerId, activeAxis] of activeRcPointers) {
      if (activeAxis === axis) {
        activeRcPointers.delete(pointerId);
      }
    }
    resetRcAxis(axis);
  }

  function setNeutralCommand() {
    cancelThrottleBrake();
    setRcInputs(1500, 1500);
  }

  function sendCurrentRcCommand() {
    sendCommand(buildCommand());
  }

  function cleanupDcPings(now) {
    for (const [seq, sentAt] of pendingDcPings) {
      if (now - sentAt > 5000) {
        pendingDcPings.delete(seq);
      }
    }
  }

  function sendDcPing() {
    if (
      isAyameSignaling()
      || !DC_PING_ENABLED
      || !isDebugOsdEnabled()
      || !dataChannel
      || dataChannel.readyState !== 'open'
    ) {
      return;
    }
    const now = performance.now();
    cleanupDcPings(now);
    dcPingSeq = (dcPingSeq + 1) % 1000000;
    const seq = String(dcPingSeq);
    pendingDcPings.set(seq, now);
    dataChannel.send(`PING:${seq}:${now.toFixed(3)}`);
  }

  function startDcPingMonitor() {
    window.setInterval(sendDcPing, DC_PING_INTERVAL_MS);
  }

  function startRcTx() {
    if (rcTxTimer) {
      return;
    }
    rcTxTimer = window.setInterval(sendCurrentRcCommand, RC_TX_INTERVAL_MS);
    sendCurrentRcCommand();
  }

  function stopRcTx() {
    if (!rcTxTimer) {
      return;
    }
    window.clearInterval(rcTxTimer);
    rcTxTimer = null;
  }

  function getActiveGamepad() {
    if (!GAMEPAD_ENABLED || !navigator.getGamepads) {
      return null;
    }
    const gamepad = navigator.getGamepads()[GAMEPAD_INDEX];
    return gamepad && gamepad.connected ? gamepad : null;
  }

  function setDriveEnabled(enabled) {
    rcDriveEnabled = enabled;
    btnDrive.textContent = enabled ? 'Drive On' : 'Drive Off';
    btnDrive.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    pressedControlKeys.clear();

    if (enabled) {
      setNeutralCommand();
      captureGamepadPedalIdle(getActiveGamepad());
      startRcTx();
    } else {
      cancelThrottleBrake();
      stopRcTx();
      setNeutralCommand();
      sendCurrentRcCommand();
    }
    if (roomLease) {
      heartbeatRoomLease();
    }
    updateRcUi();
  }

  function toggleDrive() {
    setDriveEnabled(!rcDriveEnabled);
  }

  function isTextEditingTarget(target) {
    if (!target) {
      return false;
    }
    const tagName = target.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  function getControlKey(code) {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        return 'left';
      case 'ArrowRight':
      case 'KeyD':
        return 'right';
      case 'ArrowUp':
      case 'KeyW':
        return 'forward';
      case 'ArrowDown':
      case 'KeyS':
        return 'backward';
      case 'Space':
        return 'neutral';
      default:
        return '';
    }
  }

  function applyKeyboardCommand() {
    if (pressedControlKeys.has('neutral')) {
      setNeutralCommand();
      return;
    }

    const steeringOffset =
      (pressedControlKeys.has('right') ? RC_STEERING_THROW : 0) -
      (pressedControlKeys.has('left') ? RC_STEERING_THROW : 0);
    const throttleOffset =
      (pressedControlKeys.has('forward') ? RC_THROTTLE_THROW : 0) -
      (pressedControlKeys.has('backward') ? RC_THROTTLE_THROW : 0);

    if (throttleOffset !== 0) {
      cancelThrottleBrake();
    }
    setRcInputs(1500 + steeringOffset, 1500 + throttleOffset);
  }

  function applyDeadzone(value, deadzone) {
    if (Math.abs(value) <= deadzone) {
      return 0;
    }
    const sign = value < 0 ? -1 : 1;
    return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
  }

  function getGamepadAxis(gamepad, axis, fallback = 0) {
    if (!gamepad || axis < 0 || axis >= gamepad.axes.length) {
      return fallback;
    }
    const value = Number(gamepad.axes[axis]);
    return Number.isFinite(value) ? value : fallback;
  }

  function getGamepadButtonValue(gamepad, buttonIndex, fallback = 0) {
    if (!gamepad || buttonIndex < 0 || buttonIndex >= gamepad.buttons.length) {
      return fallback;
    }
    const button = gamepad.buttons[buttonIndex];
    const value = typeof button === 'number' ? button : button.value;
    return Number.isFinite(value) ? value : fallback;
  }

  function getGamepadPedalValue(gamepad, axis, buttonIndex, fallback = 0) {
    if (buttonIndex >= 0) {
      return getGamepadButtonValue(gamepad, buttonIndex, fallback);
    }
    return getGamepadAxis(gamepad, axis, fallback);
  }

  function formatRawGamepadAxes(gamepad) {
    if (!gamepad) {
      return 'raw n/a';
    }
    const axes = gamepad.axes.map((value, index) => `${index}:${Number(value).toFixed(2)}`).join(' ');
    const buttons = gamepad.buttons.map((button, index) => {
      const value = typeof button === 'number' ? button : button.value;
      return `${index}:${Number(value).toFixed(2)}`;
    }).join(' ');
    return `raw[a ${axes}] btn[${buttons}]`;
  }

  function getGamepadButtonPressed(gamepad, buttonIndex) {
    if (!gamepad || buttonIndex < 0 || buttonIndex >= gamepad.buttons.length) {
      return false;
    }
    const button = gamepad.buttons[buttonIndex];
    if (typeof button === 'number') {
      return button >= 0.5;
    }
    return button.pressed || button.value >= 0.5;
  }

  function getGamepadButtonRisingEdge(gamepad, buttonIndex) {
    const pressed = getGamepadButtonPressed(gamepad, buttonIndex);
    const previous = gamepadButtonState.get(buttonIndex) === true;
    gamepadButtonState.set(buttonIndex, pressed);
    return pressed && !previous;
  }

  function captureGamepadPedalIdle(gamepad) {
    if (!gamepad) {
      return;
    }
    if ((GAMEPAD_THROTTLE_AXIS >= 0 || GAMEPAD_THROTTLE_BUTTON >= 0) && !GAMEPAD_THROTTLE_IDLE_CONFIGURED) {
      gamepadPedalIdle.throttle = getGamepadPedalValue(
        gamepad,
        GAMEPAD_THROTTLE_AXIS,
        GAMEPAD_THROTTLE_BUTTON,
        gamepadPedalIdle.throttle
      );
    }
    if ((GAMEPAD_BRAKE_AXIS >= 0 || GAMEPAD_BRAKE_BUTTON >= 0) && !GAMEPAD_BRAKE_IDLE_CONFIGURED) {
      gamepadPedalIdle.brake = getGamepadPedalValue(
        gamepad,
        GAMEPAD_BRAKE_AXIS,
        GAMEPAD_BRAKE_BUTTON,
        gamepadPedalIdle.brake
      );
    }
    recordEvent(
      'gamepad idle',
      `throttle=${gamepadPedalIdle.throttle.toFixed(3)} brake=${gamepadPedalIdle.brake.toFixed(3)}`
    );
  }

  function normalizePedalAxis(value, invert, idleValue, pressedValue) {
    const raw = invert ? -value : value;
    const idle = invert ? -idleValue : idleValue;
    const defaultPressed = idleValue >= 0 ? -1 : 1;
    const pressed = invert ? -pressedValue : pressedValue;
    const fallbackPressed = invert ? -defaultPressed : defaultPressed;
    const span = Math.abs(pressed - idle) >= 0.001
      ? pressed - idle
      : fallbackPressed - idle;
    const normalized = (raw - idle) / (Math.abs(span) >= 0.001 ? span : 1);
    return applyDeadzone(Math.max(0, Math.min(1, normalized)), GAMEPAD_PEDAL_DEADZONE);
  }

  function normalizeSteeringAxis(value) {
    const raw = GAMEPAD_STEERING_INVERT ? -value : value;
    const center = GAMEPAD_STEERING_INVERT ? -GAMEPAD_STEERING_CENTER : GAMEPAD_STEERING_CENTER;
    const left = GAMEPAD_STEERING_INVERT ? -GAMEPAD_STEERING_RIGHT : GAMEPAD_STEERING_LEFT;
    const right = GAMEPAD_STEERING_INVERT ? -GAMEPAD_STEERING_LEFT : GAMEPAD_STEERING_RIGHT;
    const leftSpan = Math.max(0.001, Math.abs(center - left));
    const rightSpan = Math.max(0.001, Math.abs(right - center));
    const normalized = raw < center
      ? -Math.min(1, Math.abs(raw - center) / leftSpan)
      : Math.min(1, Math.abs(raw - center) / rightSpan);
    return Math.max(-1, Math.min(1, applyDeadzone(normalized, GAMEPAD_STEERING_DEADZONE) * GAMEPAD_STEERING_GAIN));
  }

  function formatGamepadStatus(gamepad, steering, throttle, brake) {
    const ageMs = lastGamepadAt > 0 ? performance.now() - lastGamepadAt : 0;
    return `gp#${gamepad.index} s${steering.toFixed(2)} t${throttle.toFixed(2)} b${brake.toFixed(2)} idle${gamepadPedalIdle.throttle.toFixed(2)}/${gamepadPedalIdle.brake.toFixed(2)} ${Math.round(ageMs)}ms ${formatRawGamepadAxes(gamepad)}`;
  }

  function applyGamepadCommand(gamepad) {
    const rawSteering = getGamepadAxis(gamepad, GAMEPAD_STEERING_AXIS);
    const steering = normalizeSteeringAxis(rawSteering);
    const throttle = (GAMEPAD_THROTTLE_AXIS >= 0 || GAMEPAD_THROTTLE_BUTTON >= 0)
      ? normalizePedalAxis(
        getGamepadPedalValue(gamepad, GAMEPAD_THROTTLE_AXIS, GAMEPAD_THROTTLE_BUTTON, gamepadPedalIdle.throttle),
        GAMEPAD_THROTTLE_INVERT,
        gamepadPedalIdle.throttle,
        GAMEPAD_THROTTLE_PRESSED
      )
      : 0;
    const brake = (GAMEPAD_BRAKE_AXIS >= 0 || GAMEPAD_BRAKE_BUTTON >= 0)
      ? normalizePedalAxis(
        getGamepadPedalValue(gamepad, GAMEPAD_BRAKE_AXIS, GAMEPAD_BRAKE_BUTTON, gamepadPedalIdle.brake),
        GAMEPAD_BRAKE_INVERT,
        gamepadPedalIdle.brake,
        GAMEPAD_BRAKE_PRESSED
      )
      : 0;

    const steeringPwm = 1500 + steering * RC_STEERING_THROW;
    const throttlePwm = brake > 0
      ? 1500 - brake * (1500 - getThrottleGearMin())
      : 1500 + throttle * (getThrottleGearMax() - 1500);

    cancelThrottleBrake();
    setRcInputs(steeringPwm, throttlePwm);
    lastGamepadStatus = formatGamepadStatus(gamepad, steering, throttle, brake);
  }

  function pollGamepad() {
    if (!GAMEPAD_ENABLED) {
      return;
    }
    const gamepad = getActiveGamepad();
    if (!gamepad) {
      if (gamepadSeen && performance.now() - lastGamepadAt > 500) {
        lastGamepadStatus = 'gamepad lost';
      }
      return;
    }

    gamepadSeen = true;
    lastGamepadAt = performance.now();
    if (GAMEPAD_DRIVE_BUTTON_ENABLED && getGamepadButtonRisingEdge(gamepad, GAMEPAD_DRIVE_BUTTON)) {
      toggleDrive();
    }
    if (getGamepadButtonRisingEdge(gamepad, GAMEPAD_PADDLE_LEFT_BUTTON)) {
      setThrottleGear(currentGear - 1);
      recordEvent('gamepad paddle', 'left');
    }
    if (getGamepadButtonRisingEdge(gamepad, GAMEPAD_PADDLE_RIGHT_BUTTON)) {
      setThrottleGear(currentGear + 1);
      recordEvent('gamepad paddle', 'right');
    }
    if (rcDriveEnabled) {
      applyGamepadCommand(gamepad);
    } else {
      lastGamepadStatus = `gp#${gamepad.index} ready`;
    }
  }

  function startGamepadPoller() {
    if (!GAMEPAD_ENABLED) {
      return;
    }
    window.setInterval(pollGamepad, RC_TX_INTERVAL_MS);
  }

  function onControlKeyDown(event) {
    if (!rcDriveEnabled || isTextEditingTarget(event.target) || event.repeat) {
      return;
    }
    const key = getControlKey(event.code);
    if (!key) {
      return;
    }
    event.preventDefault();
    pressedControlKeys.add(key);
    applyKeyboardCommand();
  }

  function onControlKeyUp(event) {
    if (!rcDriveEnabled || isTextEditingTarget(event.target)) {
      return;
    }
    const key = getControlKey(event.code);
    if (!key) {
      return;
    }
    event.preventDefault();
    pressedControlKeys.delete(key);
    applyKeyboardCommand();
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) {
      return;
    }
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectAfter = 0;
  }

  function isConnectionActive() {
    return Boolean(ws || peerConnection || reconnectTimer);
  }

  function isDataChannelOpen() {
    return Boolean(dataChannel && dataChannel.readyState === 'open');
  }

  function roomLockActive() {
    return ROOM_LOCK_ENABLED && isAyameSignaling() && Boolean(ROOM_LOCK_URL) && Boolean(AYAME_ROOM_ID);
  }

  function roomLockEndpoint(suffix = '') {
    const room = encodeURIComponent(AYAME_ROOM_ID);
    return `${ROOM_LOCK_URL}/rooms/${room}${suffix}`;
  }

  function getRoomLeaseToken() {
    return roomLease?.token || '';
  }

  function isRoomLockedByOther() {
    if (!roomLockActive() || !roomLockStatus || roomLease) {
      return false;
    }
    const holder = roomLockStatus.lease;
    return Boolean(roomLockStatus.locked && holder?.clientId && holder.clientId !== AYAME_CLIENT_ID);
  }

  async function fetchRoomLockJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function refreshRoomLockStatus() {
    if (!roomLockActive()) {
      return;
    }
    if (isDataChannelOpen()) {
      if (!roomLease && !roomLockBusy) {
        recordEvent('room lease recover', 'active connection');
        acquireRoomLease();
      }
      return;
    }
    if (isConnectionActive()) {
      return;
    }
    try {
      roomLockStatus = await fetchRoomLockJson(roomLockEndpoint());
      if (isRoomLockedByOther()) {
        const holder = roomLockStatus.lease?.clientId || 'other';
        recordEvent('room busy', holder);
      }
    } catch (error) {
      roomLockStatus = { ok: false, locked: false, error: error.message || String(error) };
      recordEvent('room lock status failed', roomLockStatus.error);
    } finally {
      updateUiState();
    }
  }

  function startRoomLockStatusMonitor() {
    if (!roomLockActive() || roomLockStatusTimer) {
      return;
    }
    refreshRoomLockStatus();
    roomLockStatusTimer = window.setInterval(refreshRoomLockStatus, ROOM_LOCK_POLL_MS);
  }

  function stopRoomLockHeartbeat() {
    if (!roomLockHeartbeatTimer) {
      return;
    }
    window.clearInterval(roomLockHeartbeatTimer);
    roomLockHeartbeatTimer = null;
  }

  function clearRoomLease(reason) {
    if (!roomLease) {
      return;
    }
    stopRoomLockHeartbeat();
    roomLease = null;
    roomLockHeartbeatFailures = 0;
    recordEvent('room lease cleared', reason);
  }

  async function heartbeatRoomLease() {
    if (!roomLockActive() || !roomLease) {
      return false;
    }
    const leaseToken = getRoomLeaseToken();
    try {
      const payload = await fetchRoomLockJson(roomLockEndpoint('/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: AYAME_CLIENT_ID,
          token: leaseToken,
          ttlSec: ROOM_LOCK_TTL_SEC,
          driveEnabled: rcDriveEnabled,
        }),
      });
      if (!roomLease || getRoomLeaseToken() !== leaseToken) {
        return true;
      }
      const token = getRoomLeaseToken();
      roomLease = payload.lease ? { ...payload.lease, token } : roomLease;
      roomLockStatus = payload;
      roomLockHeartbeatFailures = 0;
      return true;
    } catch (error) {
      if (!roomLease || getRoomLeaseToken() !== leaseToken) {
        return true;
      }
      recordEvent('room heartbeat failed', error.message || String(error));
      roomLockStatus = error.payload || roomLockStatus;
      roomLockHeartbeatFailures += 1;
      if (isConnectionActive()) {
        if (error.status === 409) {
          stopRoomLockHeartbeat();
          roomLease = null;
          roomLockHeartbeatFailures = 0;
          recordEvent('room lease recover', 'heartbeat mismatch');
          acquireRoomLease();
        }
        return true;
      }
      if (error.status === 409 || roomLockHeartbeatFailures >= ROOM_LOCK_HEARTBEAT_MAX_FAILURES) {
        clearRoomLease(error.message || 'heartbeat failed');
      }
      return false;
    }
  }

  function startRoomLockHeartbeat() {
    if (!roomLockActive() || roomLockHeartbeatTimer) {
      return;
    }
    const intervalMs = Math.max(3000, Math.min(10000, Math.floor((ROOM_LOCK_TTL_SEC * 1000) / 3)));
    roomLockHeartbeatTimer = window.setInterval(heartbeatRoomLease, intervalMs);
  }

  async function acquireRoomLease() {
    if (!roomLockActive()) {
      return true;
    }
    if (roomLease) {
      const valid = await heartbeatRoomLease();
      if (valid) {
        startRoomLockHeartbeat();
        return true;
      }
    }

    roomLockBusy = true;
    recordEvent('room lock', 'acquire');
    updateUiState();
    try {
      const payload = await fetchRoomLockJson(roomLockEndpoint('/lease'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: AYAME_CLIENT_ID,
          ttlSec: ROOM_LOCK_TTL_SEC,
          displayName: getStringParam(['id'], AYAME_CLIENT_ID),
          userAgent: navigator.userAgent,
          driveEnabled: rcDriveEnabled,
        }),
      });
      roomLease = payload.lease || null;
      roomLockStatus = payload;
      roomLockHeartbeatFailures = 0;
      startRoomLockHeartbeat();
      recordEvent('room lock', 'acquired');
      return true;
    } catch (error) {
      roomLockStatus = error.payload || { ok: false, locked: true, error: error.message || String(error) };
      const holder = roomLockStatus.lease?.clientId || 'other';
      recordEvent('room lock denied', holder);
      return false;
    } finally {
      roomLockBusy = false;
      updateUiState();
    }
  }

  function releaseRoomLease(options = {}) {
    if (!roomLockActive() || !roomLease) {
      return;
    }
    const payload = {
      clientId: AYAME_CLIENT_ID,
      token: getRoomLeaseToken(),
    };
    const url = roomLockEndpoint('/release');
    stopRoomLockHeartbeat();
    roomLease = null;
    roomLockStatus = null;

    if (options.beacon && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    fetchRoomLockJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((status) => {
      roomLockStatus = status;
      updateUiState();
    }).catch((error) => {
      recordEvent('room release failed', error.message || String(error));
    });
  }

  function closeTransport(options = {}) {
    const sendSignalingClose = options.sendSignalingClose === true;
    const currentWs = ws;
    const currentDataChannel = dataChannel;
    const currentPeerConnection = peerConnection;

    if (currentWs) {
      currentWs.onopen = null;
      currentWs.onerror = null;
      currentWs.onclose = null;
      currentWs.onmessage = null;
    }
    if (currentDataChannel) {
      currentDataChannel.onopen = null;
      currentDataChannel.onclose = null;
      currentDataChannel.onmessage = null;
    }
    if (currentPeerConnection) {
      currentPeerConnection.ontrack = null;
      currentPeerConnection.onicecandidate = null;
      currentPeerConnection.oniceconnectionstatechange = null;
      currentPeerConnection.onconnectionstatechange = null;
    }

    if (sendSignalingClose &&
        currentWs &&
        currentWs.readyState === WebSocket.OPEN) {
      try {
        currentWs.send(JSON.stringify({ type: isAyameSignaling() ? 'bye' : 'close' }));
      } catch (_) {
      }
    }
    if (currentDataChannel) {
      try {
        currentDataChannel.close();
      } catch (_) {
      }
    }
    if (currentPeerConnection) {
      try {
        currentPeerConnection.close();
      } catch (_) {
      }
    }
    if (currentWs &&
        (currentWs.readyState === WebSocket.CONNECTING ||
         currentWs.readyState === WebSocket.OPEN)) {
      try {
        currentWs.close(1000, 'viewer closing');
      } catch (_) {
      }
    }
    dataChannel = null;
    audioSender = null;
    audioTransceiver = null;
    peerConnection = null;
    ws = null;
    candidates = [];
    hasReceivedSdp = false;
    lastStatsSampleAt = 0;
    lastBytesReceived = 0;
    lastPacketsReceived = 0;
    lastPacketsLost = 0;
    lastFramesDropped = 0;
    lastJitterBufferDelay = 0;
    lastJitterBufferEmittedCount = 0;
    lastTotalProcessingDelay = 0;
    lastFramesDecoded = 0;
    lastDecodedFrameAt = 0;
    decodedFrameHistory = [];
    remoteVideo.pause();
    remoteVideo.srcObject = null;
    updateUiState();
  }

  function disconnect() {
    shouldReconnect = false;
    reconnectAttempt = 0;
    reconnectReason = '';
    lastEvent = 'manual stop';
    connectedAt = 0;
    clearReconnectTimer();
    setDriveEnabled(false);
    micEnabled = false;
    stopLocalMic();
    closeTransport({ sendSignalingClose: true });
    releaseRoomLease();
  }

  function shutdownForPageHide() {
    shouldReconnect = false;
    reconnectAttempt = 0;
    reconnectReason = '';
    lastEvent = 'page hide';
    clearReconnectTimer();
    setDriveEnabled(false);
    micEnabled = false;
    stopLocalMic();
    closeTransport({ sendSignalingClose: true });
    releaseRoomLease({ beacon: true });
  }

  function scheduleReconnect(reason, options = {}) {
    const force = options.force === true;
    if (!AUTO_RECONNECT && !force) {
      recordEvent('reconnect blocked', reason);
      return;
    }
    if (!shouldReconnect || reconnectTimer) {
      return;
    }
    if (reason === 'video lost') {
      eventCounters.videoLost += 1;
    } else if (reason === 'no video') {
      eventCounters.noVideo += 1;
    } else if (reason === 'ws closed') {
      eventCounters.wsClosed += 1;
    } else if (reason === 'peer closed') {
      eventCounters.peerClosed += 1;
    } else if (reason === 'dc closed') {
      eventCounters.dcClosed += 1;
    } else if (reason === 'room full') {
      eventCounters.roomFull += 1;
    } else if (reason === 'ice failed') {
      eventCounters.iceFailed += 1;
    } else if (reason === 'pc failed') {
      eventCounters.pcFailed += 1;
    }
    lastReconnectAt = performance.now();
    lastReconnectReason = reason;
    reconnectCount += 1;
    reconnectAttempt += 1;
    reconnectReason = reason;
    const baseDelayMs = options.baseDelayMs || RECONNECT_BASE_DELAY_MS;
    const maxDelayMs = options.maxDelayMs || RECONNECT_MAX_DELAY_MS;
    const delay = Math.min(
      baseDelayMs * (2 ** Math.min(reconnectAttempt - 1, 4)),
      maxDelayMs,
    );
    reconnectAfter = performance.now() + delay;
    console.warn('Scheduling reconnect:', reason, `${delay}ms`);
    recordEvent('reconnect', `${reason} ${delay}ms ${getTransportSummary()}`);
    closeTransport({ sendSignalingClose: true });
    updateUiState();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectAfter = 0;
      connect({ isAutoReconnect: true }).catch((error) => {
        recordEvent('connect failed', error.message || String(error));
        updateUiState();
      });
    }, delay);
  }

  function createWebSocketUrl() {
    const host = endpointInput.value.trim() || DEFAULT_HOST;
    const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return `${protocol}${host}/ws`;
  }

  function createSignalingWebSocketUrl() {
    return isAyameSignaling() ? AYAME_SIGNALING_URL : createWebSocketUrl();
  }

  function sendAyameRegister() {
    if (!AYAME_ROOM_ID) {
      lastEvent = 'ayame room missing';
      recordEvent('ayame error', 'roomId is required');
      updateUiState();
      return;
    }
    const message = {
      type: 'register',
      roomId: AYAME_ROOM_ID,
      clientId: AYAME_CLIENT_ID,
    };
    if (AYAME_SIGNALING_KEY) {
      message.key = AYAME_SIGNALING_KEY;
    }
    ws.send(JSON.stringify(message));
  }

  function normalizeIceServers(iceServers) {
    if (!Array.isArray(iceServers)) {
      return [];
    }
    return iceServers
      .map((server) => {
        if (!server || !server.urls) {
          return null;
        }
        return {
          urls: server.urls,
          username: server.username,
          credential: server.credential,
        };
      })
      .filter(Boolean);
  }

  function hasTurnUrl(server) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => {
      const normalized = String(url || '').toLowerCase();
      return normalized.startsWith('turn:') || normalized.startsWith('turns:');
    });
  }

  function configuredStunIceServers() {
    return STUN_URLS.length > 0 ? [{ urls: STUN_URLS }] : [];
  }

  function configuredTurnIceServers() {
    if (TURN_URLS.length === 0) {
      return [];
    }
    const server = { urls: TURN_URLS };
    if (TURN_USERNAME && TURN_CREDENTIAL) {
      server.username = TURN_USERNAME;
      server.credential = TURN_CREDENTIAL;
    }
    return [server];
  }

  function defaultIceServers() {
    return getBooleanParam('stun', isAyameSignaling())
      ? configuredStunIceServers()
      : [];
  }

  function resolveIceServers(iceServers) {
    const normalizedIceServers = normalizeIceServers(iceServers);
    if (ICE_MODE === 'none') {
      return [];
    }
    if (ICE_MODE === 'stun') {
      return configuredStunIceServers();
    }
    if (ICE_MODE === 'turn') {
      const configuredTurnServers = configuredTurnIceServers();
      if (configuredTurnServers.length > 0) {
        return configuredTurnServers;
      }
      return normalizedIceServers.filter(hasTurnUrl);
    }
    return normalizedIceServers.length > 0
      ? normalizedIceServers
      : defaultIceServers();
  }

  function sendSignalingDescription(description) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !description) {
      return;
    }
    ws.send(JSON.stringify({
      type: description.type,
      sdp: description.sdp,
    }));
  }

  function applyAudioOpusSdpConstraints(description) {
    if (!description || !description.sdp || !hasAudioOpusSdpConstraints()) {
      return description;
    }
    const sdp = constrainAudioOpusSdp(description.sdp);
    if (sdp === description.sdp) {
      return description;
    }
    recordEvent('audio opus sdp', describeAudioOpusSdpConstraints());
    return {
      type: description.type,
      sdp,
    };
  }

  function hasAudioOpusSdpConstraints() {
    return AUDIO_OPUS_MAX_BITRATE_BPS > 0 ||
      AUDIO_OPUS_STEREO !== null ||
      AUDIO_OPUS_DTX !== null ||
      AUDIO_OPUS_FEC !== null;
  }

  function describeAudioOpusSdpConstraints() {
    const parts = [];
    if (AUDIO_OPUS_MAX_BITRATE_BPS > 0) {
      parts.push(`max=${AUDIO_OPUS_MAX_BITRATE_BPS}`);
    }
    if (AUDIO_OPUS_STEREO !== null) {
      parts.push(`stereo=${AUDIO_OPUS_STEREO ? 1 : 0}`);
    }
    if (AUDIO_OPUS_DTX !== null) {
      parts.push(`dtx=${AUDIO_OPUS_DTX ? 1 : 0}`);
    }
    if (AUDIO_OPUS_FEC !== null) {
      parts.push(`fec=${AUDIO_OPUS_FEC ? 1 : 0}`);
    }
    return parts.join(' ');
  }

  function constrainAudioOpusSdp(sdp) {
    const lines = sdp.split(/\r\n|\n/);
    const opusPayloadTypes = new Set();
    const rtpmapIndexes = new Map();
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
      if (!match) {
        continue;
      }
      opusPayloadTypes.add(match[1]);
      rtpmapIndexes.set(match[1], i);
    }
    if (opusPayloadTypes.size === 0) {
      return sdp;
    }

    const updatedPayloadTypes = new Set();
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^a=fmtp:(\d+)\s+(.*)$/);
      if (!match || !opusPayloadTypes.has(match[1])) {
        continue;
      }
      lines[i] = `a=fmtp:${match[1]} ${formatAudioOpusFmtp(match[2])}`;
      updatedPayloadTypes.add(match[1]);
    }

    const missingPayloadTypes = Array.from(opusPayloadTypes)
      .filter((payloadType) => !updatedPayloadTypes.has(payloadType))
      .sort((a, b) => (rtpmapIndexes.get(b) || 0) - (rtpmapIndexes.get(a) || 0));
    for (const payloadType of missingPayloadTypes) {
      const index = rtpmapIndexes.get(payloadType);
      if (!Number.isInteger(index)) {
        continue;
      }
      lines.splice(index + 1, 0, `a=fmtp:${payloadType} ${formatAudioOpusFmtp('')}`);
    }

    return lines.join('\r\n');
  }

  function formatAudioOpusFmtp(fmtp) {
    const params = new Map();
    String(fmtp || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const separator = part.indexOf('=');
        if (separator === -1) {
          params.set(part.toLowerCase(), { key: part, value: '' });
          return;
        }
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        params.set(key.toLowerCase(), { key, value });
      });

    setAudioOpusFmtpParam(params, 'maxaveragebitrate',
      AUDIO_OPUS_MAX_BITRATE_BPS > 0 ? String(AUDIO_OPUS_MAX_BITRATE_BPS) : null);
    if (AUDIO_OPUS_STEREO !== null) {
      const stereo = AUDIO_OPUS_STEREO ? '1' : '0';
      setAudioOpusFmtpParam(params, 'stereo', stereo);
      setAudioOpusFmtpParam(params, 'sprop-stereo', stereo);
    }
    setAudioOpusFmtpParam(params, 'usedtx',
      AUDIO_OPUS_DTX !== null ? (AUDIO_OPUS_DTX ? '1' : '0') : null);
    setAudioOpusFmtpParam(params, 'useinbandfec',
      AUDIO_OPUS_FEC !== null ? (AUDIO_OPUS_FEC ? '1' : '0') : null);

    return Array.from(params.values())
      .map(({ key, value }) => (value === '' ? key : `${key}=${value}`))
      .join(';');
  }

  function setAudioOpusFmtpParam(params, key, value) {
    if (value === null) {
      return;
    }
    params.set(key.toLowerCase(), { key, value });
  }

  async function setOfferAndAnswer(offer) {
    peerConnection = await createPeerConnection({ iceServers: ayameIceServers });
    updateUiState();
    try {
      await peerConnection.setRemoteDescription(offer);
      hasReceivedSdp = true;
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(applyAudioOpusSdpConstraints(answer));
      sendSignalingDescription(peerConnection.localDescription);
      for (const candidate of candidates) {
        addIceCandidate(candidate);
      }
      candidates = [];
      updateUiState();
    } catch (error) {
      console.error('setOfferAndAnswer failed:', error);
      recordEvent('answer failed', error?.message || 'unknown');
    }
  }

  function getAyameRejectReason(message) {
    return String(message.reason || message.error || message.message || 'unknown');
  }

  function isRoomFullReject(message) {
    const reason = getAyameRejectReason(message).toLowerCase();
    return reason === 'full' ||
      reason === 'roomfilled' ||
      reason.includes('room full') ||
      reason.includes('roomfilled');
  }

  function isRoomLockReject(message) {
    const reason = getAyameRejectReason(message).toLowerCase();
    return reason.includes('room lock') || reason.includes('lock required');
  }

  function handleAyameMessage(message) {
    switch (message.type) {
      case 'accept':
        ayameIceServers = normalizeIceServers(message.iceServers);
        recordEvent('ayame accept', message.isExistUser ? 'peer exists' : 'waiting');
        if (message.isExistUser || typeof message.isExistUser === 'undefined') {
          makeOffer({ iceServers: ayameIceServers });
        }
        break;
      case 'offer':
        setOfferAndAnswer(new RTCSessionDescription({
          type: 'offer',
          sdp: message.sdp,
        }));
        break;
      case 'answer':
        setAnswer(new RTCSessionDescription({
          type: 'answer',
          sdp: message.sdp,
        }));
        break;
      case 'candidate': {
        const candidate = new RTCIceCandidate(message.ice);
        if (hasReceivedSdp) {
          addIceCandidate(candidate);
        } else {
          candidates.push(candidate);
        }
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'bye':
        recordEvent('ayame bye');
        scheduleReconnect('peer closed');
        break;
      case 'reject':
        recordEvent('ayame reject', getAyameRejectReason(message));
        if (isRoomLockReject(message)) {
          clearRoomLease(getAyameRejectReason(message));
          scheduleReconnect('room lock lost', {
            force: true,
            baseDelayMs: 1000,
            maxDelayMs: 5000,
          });
        } else if (isRoomFullReject(message)) {
          scheduleReconnect('room full', {
            force: true,
            baseDelayMs: ROOM_FULL_RETRY_BASE_DELAY_MS,
            maxDelayMs: ROOM_FULL_RETRY_MAX_DELAY_MS,
          });
        }
        break;
      default:
        console.warn('Unknown Ayame message:', message.type);
    }
  }

  async function connect(options = {}) {
    if (roomLockBusy) {
      return;
    }
    if (roomLockActive()) {
      const acquired = await acquireRoomLease();
      if (!acquired) {
        shouldReconnect = false;
        return;
      }
    }
    shouldReconnect = true;
    if (!options.isAutoReconnect) {
      reconnectAttempt = 0;
      reconnectCount = 0;
    }
    recordEvent(options.isAutoReconnect ? 'connect auto' : 'connect manual');
    reconnectReason = '';
    clearReconnectTimer();
    closeTransport({ sendSignalingClose: false });
    connectStartedAt = performance.now();
    lastVideoFrameAt = 0;
    lastDecodedFrameAt = 0;

    const wsUrl = createSignalingWebSocketUrl();
    ws = new WebSocket(wsUrl);
    updateUiState();

    ws.onopen = () => {
      console.log('WebSocket open:', wsUrl);
      lastEvent = 'ws open';
      if (isAyameSignaling()) {
        sendAyameRegister();
      } else {
        makeOffer();
      }
      updateUiState();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      eventCounters.wsError += 1;
      recordEvent('ws error', error?.message || 'unknown');
      updateUiState();
    };

    ws.onclose = (event) => {
      lastWsClose = `${event.code || 0} ${event.reason || ''}`.trim();
      recordEvent('ws close', lastWsClose);
      scheduleReconnect('ws closed');
      updateUiState();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (isAyameSignaling()) {
        handleAyameMessage(message);
        return;
      }
      switch (message.type) {
        case 'answer':
          setAnswer(new RTCSessionDescription(message));
          break;
        case 'candidate': {
          const candidate = new RTCIceCandidate(message.ice);
          if (hasReceivedSdp) {
            addIceCandidate(candidate);
          } else {
            candidates.push(candidate);
          }
          break;
        }
        case 'close':
          console.log('Peer closed');
          recordEvent('peer close');
          scheduleReconnect('peer closed');
          break;
        default:
          console.warn('Unknown signaling message:', message.type);
      }
    };
  }

  async function createPeerConnection(options = {}) {
    candidates = [];
    hasReceivedSdp = false;

    const rtcConfig = {
      iceServers: resolveIceServers(options.iceServers),
    };
    if (ICE_MODE === 'turn') {
      rtcConfig.iceTransportPolicy = 'relay';
    }
    const peer = new RTCPeerConnection(rtcConfig);
    const attachDataChannel = (channel, source = 'remote') => {
      if (
        source === 'remote' &&
        channel.label === 'serial' &&
        dataChannel &&
        dataChannel !== channel &&
        dataChannel.readyState !== 'closed'
      ) {
        recordEvent('dc duplicate ignored');
        channel.close();
        return;
      }
      if (dataChannel && dataChannel !== channel) {
        dataChannel.onopen = null;
        dataChannel.onclose = null;
        dataChannel.onmessage = null;
      }
      dataChannel = channel;
      dataChannel.onopen = () => {
        connectedAt = performance.now();
        pendingDcPings.clear();
        dcRttMs = null;
        lastDcPongAt = 0;
        recordEvent('dc open');
        sendDcPing();
        updateUiState();
      };
      dataChannel.onclose = () => {
        recordEvent('dc close');
        scheduleReconnect('dc closed');
        updateUiState();
      };
      dataChannel.onmessage = (event) => handleDataChannelMessage(event.data);
      if (dataChannel.readyState === 'open') {
        connectedAt = performance.now();
        pendingDcPings.clear();
        dcRttMs = null;
        lastDcPongAt = 0;
        recordEvent('dc open');
        sendDcPing();
      }
      updateUiState();
    };

    peer.ondatachannel = (event) => attachDataChannel(event.channel, 'remote');

    attachDataChannel(peer.createDataChannel('serial', {
      ordered: false,
      maxRetransmits: 0,
    }), 'local');

    const mediaStream = new MediaStream();
    remoteVideo.srcObject = mediaStream;
    peer.ontrack = (event) => {
      mediaStream.addTrack(event.track);
      remoteVideo.play().catch((error) => console.warn('video play failed:', error));
      updateUiState();
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(JSON.stringify({ type: 'candidate', ice: event.candidate }));
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'connected' ||
          peer.iceConnectionState === 'completed') {
        recordEvent('ice connected', peer.iceConnectionState);
      }
      if (peer.iceConnectionState === 'failed') {
        recordEvent('ice failed');
        scheduleReconnect('ice failed');
      }
      updateUiState();
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        recordEvent('pc failed');
        scheduleReconnect('pc failed');
      }
      updateUiState();
    };

    const videoTransceiver = peer.addTransceiver('video', { direction: 'recvonly' });
    preferVideoCodec(videoTransceiver, getPreferredVideoCodec());
    audioTransceiver = peer.addTransceiver('audio', { direction: 'sendrecv' });
    audioSender = audioTransceiver.sender;
    await restoreMicTrackForNewPeer().catch((error) => {
      recordEvent('mic attach failed', error.message || String(error));
    });
    recordEvent('mic preattach', getMicDebugState());

    return peer;
  }

  function getPreferredVideoCodec() {
    const params = getUrlParams();
    const codec = (params.get('codec') || 'h264').toLowerCase();
    if (codec === 'vp8') {
      return 'video/vp8';
    }
    if (codec === 'vp9') {
      return 'video/vp9';
    }
    return 'video/h264';
  }

  function preferVideoCodec(transceiver, mimeType) {
    if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') {
      return;
    }
    if (typeof RTCRtpSender === 'undefined' || !RTCRtpSender.getCapabilities) {
      return;
    }
    const capabilities = RTCRtpSender.getCapabilities('video');
    if (!capabilities || !Array.isArray(capabilities.codecs)) {
      return;
    }
    const primaryCodecs = capabilities.codecs.filter((codec) => {
      const mime = (codec.mimeType || '').toLowerCase();
      return mime.startsWith('video/') && !/(\/rtx|\/red|\/ulpfec|\/flexfec)/.test(mime);
    });
    const selected = primaryCodecs.filter((codec) => {
      return (codec.mimeType || '').toLowerCase() === mimeType;
    });
    if (selected.length === 0) {
      return;
    }
    const others = primaryCodecs.filter((codec) => {
      return (codec.mimeType || '').toLowerCase() !== mimeType;
    });
    transceiver.setCodecPreferences(selected.concat(others));
  }

  async function makeOffer(options = {}) {
    peerConnection = await createPeerConnection(options);
    updateUiState();
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(applyAudioOpusSdpConstraints(offer));
      sendSignalingDescription(peerConnection.localDescription);
    } catch (error) {
      console.error('makeOffer failed:', error);
    }
  }

  async function setAnswer(answer) {
    if (!peerConnection) {
      return;
    }
    try {
      await peerConnection.setRemoteDescription(answer);
      hasReceivedSdp = true;
      for (const candidate of candidates) {
        addIceCandidate(candidate);
      }
      candidates = [];
      updateUiState();
    } catch (error) {
      console.error('setAnswer failed:', error);
    }
  }

  function addIceCandidate(candidate) {
    if (!peerConnection) {
      return;
    }
    peerConnection.addIceCandidate(candidate).catch((error) => {
      console.warn('addIceCandidate failed:', error);
    });
  }

  function startLinkMonitor() {
    window.setInterval(() => {
      updateTimerUi();
      if (!shouldReconnect || reconnectTimer || !peerConnection) {
        return;
      }
      if (document.hidden) {
        return;
      }
      const now = performance.now();
      if (now - visibleSince < CONNECT_GRACE_MS) {
        return;
      }
      if (isVideoFrozen()) {
        if (AUTO_RECONNECT_ON_VIDEO_LOST) {
          scheduleReconnect('video lost');
        } else {
          recordEvent('video lost', 'auto reconnect disabled');
        }
        return;
      }
      const hasNoVideo =
        remoteVideo.videoWidth <= 0 &&
        connectStartedAt > 0 &&
        now - connectStartedAt > CONNECT_GRACE_MS;
      if (hasNoVideo) {
        scheduleReconnect('no video');
      }
    }, 500);
  }

  async function sampleWebRtcStats() {
    if (!peerConnection) {
      setText(netState, '0kbps');
      setText(jitterState, '0ms');
      setText(rttState, 'n/a');
      setText(latencyState, 'n/a');
      resetMicTxStats();
      updateDecodedFps(0);
      decodedFrameHistory = [];
      return;
    }

    const stats = await peerConnection.getStats();
    const now = performance.now();
    updateMicTxStats(stats, now);
    let inboundVideo = null;
    let selectedPair = null;
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        inboundVideo = report;
      }
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        selectedPair = stats.get(report.selectedCandidatePairId);
      }
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
        selectedPair = report;
      }
    });
    if (!inboundVideo) {
      return;
    }

    const bytesReceived = inboundVideo.bytesReceived || 0;
    const packetsReceived = inboundVideo.packetsReceived || 0;
    const packetsLost = inboundVideo.packetsLost || 0;
    const framesDropped = inboundVideo.framesDropped || 0;
    const jitterBufferDelay = Number.isFinite(inboundVideo.jitterBufferDelay)
      ? inboundVideo.jitterBufferDelay
      : null;
    const jitterBufferEmittedCount = Number.isFinite(inboundVideo.jitterBufferEmittedCount)
      ? inboundVideo.jitterBufferEmittedCount
      : null;
    const totalProcessingDelay = Number.isFinite(inboundVideo.totalProcessingDelay)
      ? inboundVideo.totalProcessingDelay
      : null;
    const framesDecoded = Number.isFinite(inboundVideo.framesDecoded)
      ? inboundVideo.framesDecoded
      : null;

    if (lastStatsSampleAt === 0) {
      lastStatsSampleAt = now;
      lastBytesReceived = bytesReceived;
      lastPacketsReceived = packetsReceived;
      lastPacketsLost = packetsLost;
      lastFramesDropped = framesDropped;
      lastJitterBufferDelay = jitterBufferDelay || 0;
      lastJitterBufferEmittedCount = jitterBufferEmittedCount || 0;
      lastTotalProcessingDelay = totalProcessingDelay || 0;
      lastFramesDecoded = framesDecoded || 0;
      lastDecodedFrameAt = framesDecoded && framesDecoded > 0 ? now : 0;
      decodedFrameHistory = framesDecoded === null ? [] : [{ now, framesDecoded }];
      return;
    }

    const elapsedSeconds = Math.max((now - lastStatsSampleAt) / 1000, 0.001);
    const bitrateKbps =
      Math.max(0, ((bytesReceived - lastBytesReceived) * 8) / elapsedSeconds / 1000);
    const receivedDelta = Math.max(0, packetsReceived - lastPacketsReceived);
    const lostDelta = Math.max(0, packetsLost - lastPacketsLost);
    const totalDelta = receivedDelta + lostDelta;
    const lossPercent = totalDelta > 0 ? (lostDelta * 100) / totalDelta : 0;
    const jitterMs = Math.max(0, (inboundVideo.jitter || 0) * 1000);
    const droppedDelta = Math.max(0, framesDropped - lastFramesDropped);
    const totalLossPercent =
      packetsReceived + packetsLost > 0 ? (packetsLost * 100) / (packetsReceived + packetsLost) : 0;
    const rttMs = selectedPair && Number.isFinite(selectedPair.currentRoundTripTime)
      ? selectedPair.currentRoundTripTime * 1000
      : null;
    const jitterBufferDelayDelta = jitterBufferDelay === null
      ? null
      : jitterBufferDelay - lastJitterBufferDelay;
    const jitterBufferEmittedDelta = jitterBufferEmittedCount === null
      ? null
      : jitterBufferEmittedCount - lastJitterBufferEmittedCount;
    const processingDelayDelta = totalProcessingDelay === null
      ? null
      : totalProcessingDelay - lastTotalProcessingDelay;
    const framesDecodedDelta = framesDecoded === null
      ? null
      : framesDecoded - lastFramesDecoded;
    if (framesDecodedDelta !== null && framesDecodedDelta > 0) {
      lastDecodedFrameAt = now;
    }
    const decodedFps = updateDecodedFrameHistory(now, framesDecoded);
    const playoutDelayMs =
      jitterBufferDelayDelta !== null &&
      jitterBufferEmittedDelta !== null &&
      jitterBufferEmittedDelta > 0
        ? (jitterBufferDelayDelta / jitterBufferEmittedDelta) * 1000
        : null;
    const decodeDelayMs =
      processingDelayDelta !== null &&
      framesDecodedDelta !== null &&
      framesDecodedDelta > 0
        ? (processingDelayDelta / framesDecodedDelta) * 1000
        : null;
    const estimatedDelayParts = [];
    if (rttMs !== null) {
      estimatedDelayParts.push(rttMs / 2);
    }
    if (playoutDelayMs !== null) {
      estimatedDelayParts.push(playoutDelayMs);
    }
    if (decodeDelayMs !== null) {
      estimatedDelayParts.push(decodeDelayMs);
    }
    const estimatedDelayMs = estimatedDelayParts.length > 0
      ? estimatedDelayParts.reduce((sum, value) => sum + value, 0)
      : null;

    setText(netState, `${bitrateKbps.toFixed(0)}kbps ${lossPercent.toFixed(1)}%`);
    if (decodedFps !== null) {
      updateDecodedFps(decodedFps);
    }
    setText(jitterState, `${jitterMs.toFixed(1)}ms d${droppedDelta}`);
    setText(rttState, rttMs === null ? 'n/a' : `${rttMs.toFixed(1)}ms`);
    setText(latencyState, formatLatency(estimatedDelayMs, playoutDelayMs, decodeDelayMs));
    setText(dropState, `${framesDropped} L${packetsLost} ${totalLossPercent.toFixed(1)}%`);

    lastStatsSampleAt = now;
    lastBytesReceived = bytesReceived;
    lastPacketsReceived = packetsReceived;
    lastPacketsLost = packetsLost;
    lastFramesDropped = framesDropped;
    lastJitterBufferDelay = jitterBufferDelay || 0;
    lastJitterBufferEmittedCount = jitterBufferEmittedCount || 0;
    lastTotalProcessingDelay = totalProcessingDelay || 0;
    lastFramesDecoded = framesDecoded || 0;
  }

  function formatLatency(estimatedDelayMs, playoutDelayMs, decodeDelayMs) {
    if (estimatedDelayMs === null) {
      return 'n/a';
    }
    const parts = [`~${estimatedDelayMs.toFixed(0)}ms`];
    if (playoutDelayMs !== null) {
      parts.push(`buf${playoutDelayMs.toFixed(0)}`);
    }
    if (decodeDelayMs !== null) {
      parts.push(`dec${decodeDelayMs.toFixed(0)}`);
    }
    return parts.join(' ');
  }

  function updateDecodedFrameHistory(now, framesDecoded) {
    if (framesDecoded === null) {
      return null;
    }
    decodedFrameHistory.push({ now, framesDecoded });
    const cutoff = now - 3500;
    while (decodedFrameHistory.length > 2 && decodedFrameHistory[0].now < cutoff) {
      decodedFrameHistory.shift();
    }
    const first = decodedFrameHistory[0];
    const last = decodedFrameHistory[decodedFrameHistory.length - 1];
    if (!first || !last || first === last) {
      return null;
    }
    const elapsedSeconds = (last.now - first.now) / 1000;
    const frameDelta = last.framesDecoded - first.framesDecoded;
    if (elapsedSeconds <= 0 || frameDelta < 0) {
      return null;
    }
    return frameDelta / elapsedSeconds;
  }

  function startStatsMonitor() {
    window.setInterval(() => {
      sampleWebRtcStats().catch((error) => {
        console.warn('getStats failed:', error);
      });
    }, 1000);
  }

  function startOsdMonitor() {
    window.setInterval(updateTimerUi, OSD_UPDATE_INTERVAL_MS);
  }

  function getEndpointHostName() {
    return (endpointInput.value.trim() || DEFAULT_HOST).split(':')[0];
  }

  function createDeviceStatusUrl() {
    const params = getUrlParams();
    const statusUrl = params.get('statusUrl');
    if (statusUrl) {
      return statusUrl;
    }
    const host = getStatusApiHost();
    return `http://${host}:8090/status`;
  }

  function getStatusApiHost() {
    const configured = getStringParam(['statusHost', 'deviceHost']);
    if (configured) {
      return configured.split(':')[0];
    }
    return getEndpointHostName();
  }

  function formatDeviceTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    return `${month}/${day} ${hour}:${minute}:${second}`;
  }

  function updateDeviceTimeUi() {
    if (!deviceClock) {
      return;
    }
    const elapsed = performance.now() - deviceClock.sampledAt;
    setText(timeState, formatDeviceTime(new Date(deviceClock.epochMs + elapsed)));
  }

  function applyDeviceInfo(status) {
    updateHostUi(status.hostname || getEndpointHostName());

    if (Number.isFinite(status.unix_time)) {
      deviceClock = {
        epochMs: status.unix_time * 1000,
        sampledAt: performance.now(),
      };
      updateDeviceTimeUi();
      return;
    }

    if (status.local_time) {
      const parsed = Date.parse(status.local_time);
      if (Number.isFinite(parsed)) {
        deviceClock = {
          epochMs: parsed,
          sampledAt: performance.now(),
        };
        updateDeviceTimeUi();
      }
    }
  }

  async function sampleDeviceStatus() {
    const statusUrl = createDeviceStatusUrl();
    if (!statusUrl) {
      setText(deviceState, 'n/a');
      return;
    }

    try {
      const response = await fetch(statusUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const status = await response.json();
      const temp = Number.isFinite(status.temp_c) ? `${status.temp_c.toFixed(1)}C` : 'temp?';
      const powerStatusAvailable = status.power_status_available !== false;
      const throttled = status.throttled || (powerStatusAvailable ? 'thr?' : 'thr n/a');
      const power = !powerStatusAvailable
        ? ' PWR?'
        : status.undervoltage_now
          ? ' UV!'
          : status.undervoltage_seen
            ? ' uvSeen'
            : ' PWRok';
      const volts = Number.isFinite(status.core_volts)
        ? ` core${status.core_volts.toFixed(2)}V`
        : '';
      const rssi = Number.isFinite(status.rssi_dbm) ? ` ${status.rssi_dbm}dBm` : '';
      const signal = Number.isFinite(status.signal_percent) ? ` ${status.signal_percent}%` : '';
      const freq = Number.isFinite(status.freq_mhz) ? ` ${status.freq_mhz}MHz` : '';
      if (status.mode) {
        setText(modeState, formatMode(status.mode));
      }
      applyDeviceInfo(status);
      setText(deviceState, `${temp} ${throttled}${power}${volts}${rssi}${signal}${freq}`);
    } catch (_) {
      setText(deviceState, 'n/a');
    }
  }

  async function sampleDeviceInfo() {
    updateHostUi(getEndpointHostName());
    setText(timeState, 'n/a');
  }

  function startDeviceStatusMonitor() {
    sampleDeviceInfo();
    if (DEVICE_STATUS_MODE === 'off') {
      setText(deviceState, 'off');
      return;
    }
    if (DEVICE_STATUS_MODE === 'once') {
      sampleDeviceStatus();
      return;
    }
    if (DEVICE_STATUS_MODE === 'poll') {
      sampleDeviceStatus();
      return;
    }
    setText(deviceState, 'off');
  }

  function isDebugOsdEnabled() {
    return document.body.classList.contains('debug-osd');
  }

  function updateDebugDeviceState() {
    const enabled = isDebugOsdEnabled();
    btnRefreshMode.disabled = !enabled;
    btnRefreshDevice.disabled = !enabled;
    setModeUiEnabled(enabled && modeOptions.length > 0);

    if (DEVICE_STATUS_MODE === 'off' || DEVICE_STATUS_MODE === 'debug') {
      setText(deviceState, 'off');
    }
  }

  async function refreshDebugModeStatus() {
    if (!isDebugOsdEnabled()) {
      return;
    }
    setText(modeState, 'updating');
    await loadModeStatus();
  }

  async function refreshDebugDeviceStatus() {
    if (!isDebugOsdEnabled()) {
      return;
    }
    setText(deviceState, 'updating');
    await sampleDeviceStatus();
  }

  function createStatusApiUrl(path) {
    const params = getUrlParams();
    const baseUrl = params.get('statusBaseUrl');
    if (baseUrl) {
      return `${baseUrl.replace(/\/$/, '')}${path}`;
    }
    const host = getStatusApiHost();
    return `http://${host}:8090${path}`;
  }

  function createModeUrl() {
    const params = getUrlParams();
    const modeUrl = params.get('modeUrl');
    if (modeUrl) {
      return modeUrl;
    }
    return createStatusApiUrl('/mode');
  }

  function openInputSetup() {
    setDriveEnabled(false);
    const url = new URL('gamepad.html', location.href);
    window.open(url.toString(), '_blank', 'noopener');
  }

  function formatMode(mode) {
    if (!mode) {
      return 'n/a';
    }
    const label = mode.label || `${mode.resolution || '?'} ${mode.framerate || '?'}fps`;
    if (mode.audio_enabled && !/audio/i.test(label)) {
      return `${label} + Audio`;
    }
    return label;
  }

  function setModeUiEnabled(enabled) {
    modeSelect.disabled = !enabled;
    btnApplyMode.disabled = !enabled || modeSelect.value === '';
  }

  async function loadModeStatus() {
    if (!isDebugOsdEnabled()) {
      return;
    }
    try {
      const response = await fetch(createModeUrl(), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      modeOptions = Array.isArray(payload.modes) ? payload.modes : [];
      modeSelect.replaceChildren();
      for (const mode of modeOptions) {
        const option = document.createElement('option');
        option.value = mode.name;
        option.textContent = mode.label || mode.name;
        modeSelect.appendChild(option);
      }
      if (payload.active && payload.active.name) {
        modeSelect.value = payload.active.name;
        setText(modeState, formatMode(payload.active));
      }
      setModeUiEnabled(modeOptions.length > 0);
    } catch (error) {
      console.warn('load mode failed:', error);
      modeSelect.replaceChildren(new Option('unavailable', ''));
      setModeUiEnabled(false);
      setText(modeState, 'n/a');
    }
  }

  async function applySelectedMode() {
    const mode = modeSelect.value;
    if (!mode) {
      return;
    }
    const selected = modeOptions.find((item) => item.name === mode);
    const label = selected ? formatMode(selected) : mode;
    const confirmed = window.confirm(`${label} に切り替えます。Momo が数秒再起動します。`);
    if (!confirmed) {
      return;
    }

    setModeUiEnabled(false);
    setText(modeState, 'switching');
    recordEvent('mode switch', mode);
    try {
      const response = await fetch(createModeUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      if (payload.active) {
        setText(modeState, formatMode(payload.active));
      }
      shouldReconnect = true;
      scheduleReconnect('mode switch');
    } catch (error) {
      console.error('apply mode failed:', error);
      setText(modeState, 'switch failed');
      window.alert(`モード切替に失敗しました: ${error.message || error}`);
    } finally {
      window.setTimeout(loadModeStatus, 3500);
    }
  }

  endpointInput.value = getInitialHost();
  syncCommandFromSliders();

  steeringInput.addEventListener('input', syncCommandFromSliders);
  throttleInput.addEventListener('input', syncCommandFromThrottleSlider);
  steeringInput.addEventListener('pointerdown', (event) => onRcPointerDown('steering', event));
  throttleInput.addEventListener('pointerdown', (event) => onRcPointerDown('throttle', event));
  steeringInput.addEventListener('pointerup', onRcPointerEnd);
  throttleInput.addEventListener('pointerup', onRcPointerEnd);
  steeringInput.addEventListener('pointercancel', onRcPointerEnd);
  throttleInput.addEventListener('pointercancel', onRcPointerEnd);
  steeringInput.addEventListener('lostpointercapture', onRcPointerEnd);
  throttleInput.addEventListener('lostpointercapture', onRcPointerEnd);
  steeringInput.addEventListener('blur', () => onRcControlBlur('steering'));
  throttleInput.addEventListener('blur', () => onRcControlBlur('throttle'));
  btnDrive.addEventListener('click', toggleDrive);
  for (const button of gearButtons) {
    button.addEventListener('click', () => setThrottleGear(button.dataset.gear));
  }
  if (btnSend) {
    btnSend.addEventListener('click', () => sendCommand(lastRcCommand));
  }
  if (dataTextInput) {
    dataTextInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        sendCommand(lastRcCommand);
      }
    });
  }
  if (btnNeutral) {
    btnNeutral.addEventListener('click', () => {
      setNeutralCommand();
      sendCommand(lastRcCommand);
    });
  }
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', disconnect);
  }
  btnReconnect.addEventListener('click', () => {
    if (isConnectionActive()) {
      disconnect();
      return;
    }
    connect().catch((error) => {
      recordEvent('connect failed', error.message || String(error));
      updateUiState();
    });
  });
  btnFullscreen.addEventListener('click', () => {
    document.documentElement.requestFullscreen?.();
  });
  btnFlip.addEventListener('click', toggleVideoFlip);
  btnMirror.addEventListener('click', toggleVideoMirror);
  btnSwapControls.addEventListener('click', toggleControlsSwapped);
  applyMediaControlsVisibility();
  if (MEDIA_CONTROLS_VISIBLE) {
    btnAudio.addEventListener('click', toggleAudio);
    btnAudioFilter?.addEventListener('click', toggleAudioFilter);
    btnMic?.addEventListener('click', toggleMic);
    btnMicTone?.addEventListener('click', toggleMicTone);
    micVolumeInput?.addEventListener('input', () => setMicVolume());
  }
  btnDebug.addEventListener('click', toggleDebugOsd);
  modeSelect.addEventListener('change', () => setModeUiEnabled(isDebugOsdEnabled() && modeOptions.length > 0));
  btnApplyMode.addEventListener('click', applySelectedMode);
  btnRefreshMode.addEventListener('click', () => {
    refreshDebugModeStatus().catch((error) => {
      console.warn('refresh mode failed:', error);
    });
  });
  btnRefreshDevice.addEventListener('click', () => {
    refreshDebugDeviceStatus().catch((error) => {
      console.warn('refresh device failed:', error);
    });
  });
  btnInputSetup.addEventListener('click', openInputSetup);
  window.addEventListener('keydown', onControlKeyDown);
  window.addEventListener('keyup', onControlKeyUp);
  window.addEventListener('pointerdown', unlockRaceSound);
  window.addEventListener('keydown', unlockRaceSound);
  remoteVideo.addEventListener('loadedmetadata', updateUiState);
  remoteVideo.addEventListener('resize', updateUiState);
  if (micVolumeInput) {
    micVolumeInput.value = String(MIC_DEFAULT_VOLUME);
  }
  setMicVolume(MIC_DEFAULT_VOLUME);
  updateMicUi();

  window.fpvViewer = {
    connect,
    disconnect,
    scheduleReconnect,
    sendCommand,
    setDriveEnabled,
    setDebugOsd,
    setVideoFlip,
    setVideoMirror,
    setControlsSwapped,
    setMicEnabled,
    setMicToneEnabled,
    connectRaceControl,
    closeRaceControl,
    getDiagnostics: () => ({
      reconnectCount,
      lastReconnectAt,
      lastReconnectReason,
      lastWsClose,
      eventCounters: { ...eventCounters },
      eventLog: eventLog.slice(),
      videoFreezeTimeoutMs: VIDEO_FREEZE_TIMEOUT_MS,
      autoReconnectOnVideoLost: AUTO_RECONNECT_ON_VIDEO_LOST,
      autoReconnect: AUTO_RECONNECT,
      deviceStatusMode: DEVICE_STATUS_MODE,
      audioFilter: {
        enabled: audioFilterEnabled,
        frequencies: AUDIO_FILTER_FREQS.slice(),
        q: AUDIO_FILTER_Q,
        contextState: audioContext?.state || 'none',
      },
      mic: {
        state: getMicDebugState(),
        tx: lastMicTxStatus,
        inputPeak: lastMicInputPeak,
        enabled: micEnabled,
        toneEnabled: micToneEnabled,
        senderTrack: getTrackDebugState(audioSender?.track || null),
        outputTrack: getTrackDebugState(micOutputTrack),
        silentTrack: getTrackDebugState(silentAudioTrack),
        audioContextState: micAudioContext?.state || 'none',
      },
      gamepad: {
        enabled: GAMEPAD_ENABLED,
        index: GAMEPAD_INDEX,
        steeringAxis: GAMEPAD_STEERING_AXIS,
        steeringInvert: GAMEPAD_STEERING_INVERT,
        steeringGain: GAMEPAD_STEERING_GAIN,
        steeringDeadzone: GAMEPAD_STEERING_DEADZONE,
        throttleAxis: GAMEPAD_THROTTLE_AXIS,
        throttleButton: GAMEPAD_THROTTLE_BUTTON,
        throttleInvert: GAMEPAD_THROTTLE_INVERT,
        brakeAxis: GAMEPAD_BRAKE_AXIS,
        brakeButton: GAMEPAD_BRAKE_BUTTON,
        brakeInvert: GAMEPAD_BRAKE_INVERT,
        pedalDeadzone: GAMEPAD_PEDAL_DEADZONE,
        driveButton: GAMEPAD_DRIVE_BUTTON,
        paddleLeftButton: GAMEPAD_PADDLE_LEFT_BUTTON,
        paddleRightButton: GAMEPAD_PADDLE_RIGHT_BUTTON,
        profileId: GAMEPAD_PROFILE.id || '',
      },
      controls: {
        swapped: document.body.classList.contains('controls-swapped'),
      },
      race: {
        enabled: RACE_MODE,
        url: normalizeRaceControlUrl(),
        carId: RACE_CAR_ID,
        ws: getRaceWsStatus(),
        soundEnabled: RACE_SOUND_ENABLED,
        soundUnlocked: raceSoundUnlocked,
        audioContextState: raceAudioContext?.state || 'none',
        lastMessageAgeMs: lastRaceMessageAt > 0
          ? Math.round(performance.now() - lastRaceMessageAt)
          : null,
        state: raceState,
      },
    }),
    getPeerConnection: () => peerConnection,
  };

  recordEvent('viewer build', VIEWER_BUILD_ID);
  setVideoFlip(isFlipEnabledByDefault());
  setVideoMirror(isMirrorEnabledByDefault());
  setControlsSwapped(isControlsSwappedByDefault());
  setAudioEnabled(false);
  setAudioFilterEnabled(AUDIO_FILTER_DEFAULT);
  setDebugOsd(isDebugEnabledByDefault());
  updateRaceUi();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      visibleSince = performance.now();
    }
  });
  window.addEventListener('pagehide', () => {
    closeRaceControl();
    shutdownForPageHide();
  });
  startFpsMonitor();
  startLinkMonitor();
  startStatsMonitor();
  startOsdMonitor();
  startDcPingMonitor();
  startDeviceStatusMonitor();
  startRoomLockStatusMonitor();
  startGamepadPoller();
  updateGearUi();
  connectRaceControl();
  if (AUTO_START) {
    connect().catch((error) => {
      recordEvent('connect failed', error.message || String(error));
      updateUiState();
    });
  } else {
    shouldReconnect = false;
    recordEvent('manual connect required');
    updateUiState();
  }
})();
