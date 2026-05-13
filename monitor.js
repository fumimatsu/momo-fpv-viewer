(() => {
  'use strict';

  const DEFAULT_HOSTS = ['192.168.11.2', '192.168.11.3'];
  const POLL_INTERVAL_MS = 10000;
  const STATUS_TIMEOUT_MS = 5000;
  const MODE_TIMEOUT_MS = 5000;
  const LOCK_TIMEOUT_MS = 5000;

  const grid = document.getElementById('grid');
  const hostsInput = document.getElementById('hostsInput');
  const lockTokenInput = document.getElementById('lockTokenInput');
  const applyHosts = document.getElementById('applyHosts');
  const refreshNow = document.getElementById('refreshNow');
  const exportJson = document.getElementById('exportJson');
  const exportCsv = document.getElementById('exportCsv');
  const onlineCount = document.getElementById('onlineCount');
  const totalCount = document.getElementById('totalCount');
  const warnCount = document.getElementById('warnCount');
  const downCount = document.getElementById('downCount');
  const lastUpdate = document.getElementById('lastUpdate');

  let hosts = loadHosts();
  let lockAdminToken = loadLockAdminToken();
  const tiles = new Map();
  const states = new Map();
  const samples = [];

  function getParams() {
    const search = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#\??/, ''));
    hash.forEach((value, key) => {
      if (!search.has(key)) {
        search.set(key, value);
      }
    });
    return search;
  }

  function normalizeHost(value) {
    return value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  }

  function parseHosts(value) {
    return value
      .split(/[,\s]+/)
      .map(normalizeHost)
      .filter(Boolean);
  }

  function loadHosts() {
    const params = getParams();
    const fromUrl = params.get('hosts');
    if (fromUrl) {
      return parseHosts(fromUrl);
    }
    const fromStorage = window.localStorage?.getItem('fpvMonitorHosts');
    if (fromStorage) {
      return parseHosts(fromStorage);
    }
    return DEFAULT_HOSTS;
  }

  function statusUrl(host) {
    return `http://${host}:8090/status`;
  }

  function modeUrl(host) {
    return `http://${host}:8090/mode`;
  }

  function lockBaseUrl(status) {
    const params = getParams();
    const explicit = params.get('lockUrl');
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const ayameUrl = status?.signaling?.ayame_url || '';
    if (!ayameUrl) {
      return '';
    }
    try {
      const url = new URL(ayameUrl);
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      url.pathname = '/fpv-lock';
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/+$/, '');
    } catch (_) {
      return '';
    }
  }

  function lockUrl(status, suffix = '') {
    const base = lockBaseUrl(status);
    const roomId = status?.signaling?.room_id || '';
    if (!base || !roomId) {
      return '';
    }
    return `${base}/rooms/${encodeURIComponent(roomId)}${suffix}`;
  }

  function deviceId(status, host) {
    const source = status?.hostname || host || '';
    const match = source.match(/(?:fpv|momo-fpv)[^\d]*(\d+)/i);
    if (match) {
      return `FPV-${match[1].padStart(2, '0')}`;
    }
    return source || 'FPV';
  }

  function viewerUrl(host, status = null) {
    if (status?.signaling?.mode === 'ayame' && status.signaling.room_id) {
      const url = new URL('viewer.html', location.href);
      url.searchParams.set('signaling', 'ayame');
      url.searchParams.set('roomId', status.signaling.room_id);
      url.searchParams.set('id', deviceId(status, host));
      url.searchParams.set('clientId', 'auto');
      url.searchParams.set('debug', '0');
      url.searchParams.set('deviceStatus', 'off');
      url.searchParams.set('autoReconnect', '1');
      url.searchParams.set('videoReconnect', '1');
      url.searchParams.set('iceMode', 'turn');
      url.searchParams.set('deviceHost', host);
      return url.toString();
    }

    return `http://${host}:8080/html/fpv-viewer.html#debug=0&deviceStatus=off&autoReconnect=1&videoReconnect=0`;
  }

  function modeLabel(status) {
    if (!status || !status.mode) {
      return 'n/a';
    }
    const mode = status.mode;
    return mode.label || `${mode.resolution || '?'} ${mode.framerate || '?'}fps`;
  }

  function powerLabel(status) {
    if (!status || status.power_status_available === false) {
      return 'n/a';
    }
    if (status.undervoltage_now) {
      return 'UV NOW';
    }
    if (status.undervoltage_seen) {
      return 'uv seen';
    }
    return 'ok';
  }

  function wifiLabel(status) {
    if (!status || !status.wifi_connected) {
      return 'n/a';
    }
    const parts = [];
    if (Number.isFinite(status.freq_mhz)) {
      parts.push(`${status.freq_mhz}MHz`);
    }
    if (Number.isFinite(status.rssi_dbm)) {
      parts.push(`${status.rssi_dbm}dBm`);
    }
    if (Number.isFinite(status.signal_percent)) {
      parts.push(`${status.signal_percent}%`);
    }
    return parts.join(' ');
  }

  function bandLabel(status) {
    if (!Number.isFinite(status?.freq_mhz)) {
      return { label: 'n/a', className: '' };
    }
    if (status.freq_mhz >= 5925) {
      return { label: '6G', className: 'band-6' };
    }
    if (status.freq_mhz >= 4900) {
      return { label: '5G', className: 'band-5' };
    }
    return { label: '2.4G', className: 'band-24' };
  }

  function classify(status, error, state) {
    if (error || !status) {
      return 'down';
    }
    if (status.momo && !status.momo.metrics_ok) {
      return 'down';
    }
    if (status.service?.momo?.available && status.service.momo.ok === false) {
      return 'down';
    }
    if (
      status.momo?.state === 'stalled' ||
      status.momo?.state === 'connected_no_video' ||
      (status.signaling?.mode === 'ayame' && status.network?.signaling_sockets?.connected === false) ||
      status.undervoltage_now ||
      status.undervoltage_seen ||
      state.undervoltageSeen ||
      !status.wifi_connected
    ) {
      return 'warn';
    }
    if (state.lockStatus?.lease?.driveEnabled) {
      return 'drive';
    }
    if (state.lockStatus?.locked) {
      return 'viewer';
    }
    if (status.momo?.state === 'streaming' || status.momo?.state === 'idle') {
      return 'standby';
    }
    if (status.momo?.state === 'connected') {
      return 'connected';
    }
    return 'ok';
  }

  function stateLabel(stateName) {
    switch (stateName) {
      case 'standby':
        return 'STANDBY';
      case 'viewer':
        return 'VIEWER';
      case 'drive':
        return 'DRIVE';
      case 'connected':
        return 'CONNECTED';
      default:
        return stateName.toUpperCase();
    }
  }

  function applyTileState(tile, stateName) {
    tile.className = `tile ${stateName}`;
    updateViewerButton(tile, stateName);
    setText(tile, '.state', stateLabel(stateName));
  }

  function getDeviceState(host) {
    if (!states.has(host)) {
      states.set(host, {
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastErrorAt: null,
        undervoltageSeen: false,
        lastStatus: null,
        modeOptions: [],
        modeOptionsLoaded: false,
        modeOptionsLoading: false,
        modeBusy: false,
        lastModeMessage: '',
        renderedActiveMode: '',
        lockStatus: null,
        lockBusy: false,
        lastLockMessage: '',
      });
    }
    return states.get(host);
  }

  function loadLockAdminToken() {
    const params = getParams();
    const fromUrl = params.get('lockToken') || params.get('roomLockToken');
    if (fromUrl) {
      return fromUrl;
    }
    return window.localStorage?.getItem('fpvRoomLockAdminToken') || '';
  }

  function formatTime(value) {
    if (!value) {
      return 'n/a';
    }
    return new Date(value).toLocaleTimeString();
  }

  function pushSample(host, result, stateName) {
    const status = result.status || {};
    samples.push({
      at: new Date().toISOString(),
      host,
      state: stateName,
      rtt_ms: Number.isFinite(result.rttMs) ? Math.round(result.rttMs) : null,
      error: result.error || '',
      hostname: status.hostname || '',
      mode: status.mode?.name || '',
      freq_mhz: status.freq_mhz ?? '',
      rssi_dbm: status.rssi_dbm ?? '',
      signal_percent: status.signal_percent ?? '',
      temp_c: status.temp_c ?? '',
      undervoltage_now: status.undervoltage_now ?? '',
      undervoltage_seen: status.undervoltage_seen ?? '',
      momo_state: status.momo?.state || '',
      momo_rtt_ms: status.momo?.rtt_ms ?? '',
      momo_fps: status.momo?.video?.fps ?? '',
      momo_ice: iceLabel(status),
      momo_restarts: status.service?.momo?.n_restarts ?? '',
      signaling_connected: status.network?.signaling_sockets?.connected ?? '',
    });
    if (samples.length > 5000) {
      samples.shift();
    }
  }

  function createTile(host) {
    const tile = document.createElement('section');
    tile.className = 'tile down';
    tile.innerHTML = `
      <div class="head">
        <div class="name"></div>
        <div class="state">checking</div>
      </div>
      <div class="kv">
        <span>IP</span><span class="ip"></span>
        <span>RTT</span><span class="rtt">n/a</span>
        <span>Last OK</span><span class="lastOk">n/a</span>
        <span>Fail</span><span class="fail">0</span>
        <span>Mode</span><span class="mode">n/a</span>
        <span>Momo</span><span class="momo">n/a</span>
        <span>Svc</span><span class="service">n/a</span>
        <span>ICE</span><span class="ice">n/a</span>
        <span>Signal</span><span class="signal">n/a</span>
        <span>Room</span><span class="room">n/a</span>
        <span>Lock</span><span class="roomLock">n/a</span>
        <span>Band</span><span class="bandCell">n/a</span>
        <span>Wi-Fi</span><span class="wifi">n/a</span>
        <span>Power</span><span class="power">n/a</span>
        <span>UV Hist</span><span class="uvHist">no</span>
        <span>Temp</span><span class="temp">n/a</span>
        <span>Time</span><span class="time">n/a</span>
        <span>Error</span><span class="error">n/a</span>
      </div>
      <div class="links">
        <a class="viewer viewerButton disabled" target="_blank" rel="noreferrer" aria-disabled="true">Open Viewer</a>
        <a class="statusLink" target="_blank" rel="noreferrer">Status</a>
      </div>
      <div class="modeControls">
        <select class="modeSelect" disabled>
          <option value="">mode loading</option>
        </select>
        <button class="modeApply" type="button" disabled>Apply</button>
        <div class="modeMessage"></div>
      </div>
      <div class="roomControls">
        <button class="roomRefresh" type="button">Refresh Lock</button>
        <button class="roomForceRelease" type="button" disabled>Force Release</button>
        <div class="roomMessage"></div>
      </div>
    `;
    tile.querySelector('.ip').textContent = host;
    tile.querySelector('.name').textContent = host;
    tile.querySelector('.viewer').dataset.href = viewerUrl(host);
    tile.querySelector('.statusLink').href = statusUrl(host);
    tile.querySelector('.modeSelect').addEventListener('change', () => updateModeControls(host, tile));
    tile.querySelector('.modeApply').addEventListener('click', () => applySelectedMode(host));
    tile.querySelector('.roomRefresh').addEventListener('click', () => loadLockStatus(host));
    tile.querySelector('.roomForceRelease').addEventListener('click', () => forceReleaseRoom(host));
    grid.appendChild(tile);
    return tile;
  }

  function setText(tile, selector, value) {
    tile.querySelector(selector).textContent = value;
  }

  function updateTile(host, result) {
    const tile = tiles.get(host) || createTile(host);
    const status = result.status;
    const error = result.error;
    const state = getDeviceState(host);
    if (status && !error) {
      state.consecutiveFailures = 0;
      state.lastSuccessAt = Date.now();
      state.lastStatus = status;
      if (status.undervoltage_now || status.undervoltage_seen) {
        state.undervoltageSeen = true;
      }
    } else {
      state.consecutiveFailures += 1;
      state.lastErrorAt = Date.now();
    }
    const stateName = classify(status, error, state);
    pushSample(host, result, stateName);

    applyTileState(tile, stateName);
    setText(tile, '.name', status?.hostname || host);
    tile.querySelector('.viewer').dataset.href = viewerUrl(host, status);
    setText(tile, '.rtt', Number.isFinite(result.rttMs) ? `${result.rttMs.toFixed(0)}ms` : 'timeout');
    setText(tile, '.lastOk', formatTime(state.lastSuccessAt));
    setText(tile, '.fail', String(state.consecutiveFailures));
    setText(tile, '.mode', modeLabel(status));
    setText(tile, '.momo', momoLabel(status));
    setText(tile, '.service', serviceLabel(status));
    setText(tile, '.ice', iceLabel(status));
    setText(tile, '.signal', signalingSocketLabel(status));
    setText(tile, '.room', status?.signaling?.room_id || 'n/a');
    updateLockControls(host, tile);
    const band = bandLabel(status);
    const bandCell = tile.querySelector('.bandCell');
    bandCell.innerHTML = `<span class="band ${band.className}">${band.label}</span>`;
    setText(tile, '.wifi', wifiLabel(status));
    setText(tile, '.power', powerLabel(status));
    setText(tile, '.uvHist', state.undervoltageSeen ? 'yes' : 'no');
    setText(tile, '.temp', Number.isFinite(status?.temp_c) ? `${status.temp_c.toFixed(1)}C` : 'n/a');
    setText(tile, '.time', status?.local_time || 'n/a');
    setText(tile, '.error', error || 'n/a');
    updateModeControls(host, tile);
    if (status && !error && !state.modeOptionsLoaded && !state.modeOptionsLoading) {
      loadModeOptions(host);
    }
    if (status && !error && status.signaling?.room_id) {
      loadLockStatus(host);
    }
  }

  function momoLabel(status) {
    const momo = status?.momo;
    if (!momo) {
      return 'n/a';
    }
    if (!momo.metrics_ok) {
      return `bad ${momo.error || ''}`.trim();
    }
    const parts = [momo.state || 'unknown'];
    if (Number.isFinite(momo.rtt_ms)) {
      parts.push(`${momo.rtt_ms}ms`);
    }
    if (Number.isFinite(momo.video?.fps)) {
      parts.push(`${momo.video.fps}fps`);
    }
    return parts.join(' ');
  }

  function serviceLabel(status) {
    const service = status?.service?.momo;
    if (!service?.available) {
      return 'n/a';
    }
    const parts = [
      `${service.active_state || '?'}:${service.sub_state || '?'}`,
      `r${service.n_restarts ?? 0}`,
    ];
    if (Number.isFinite(service.main_pid) && service.main_pid > 0) {
      parts.push(`pid${service.main_pid}`);
    }
    return parts.join(' ');
  }

  function iceLabel(status) {
    const ice = status?.momo?.ice;
    if (!ice) {
      return 'n/a';
    }
    const local = ice.local;
    const remote = ice.remote;
    const route = [
      local?.type || '?',
      local?.protocol || '?',
      remote?.type || '?',
    ].join('/');
    const rtt = Number.isFinite(ice.rtt_ms) ? `${ice.rtt_ms}ms` : 'rtt?';
    return `${ice.state || '?'} ${route} ${rtt}`;
  }

  function signalingSocketLabel(status) {
    const sockets = status?.network?.signaling_sockets;
    if (!sockets?.host) {
      return 'n/a';
    }
    const count = Array.isArray(sockets.connections) ? sockets.connections.length : 0;
    return `${sockets.connected ? 'up' : 'down'} ${count} ${sockets.host}`;
  }

  function updateViewerButton(tile, stateName) {
    const viewer = tile.querySelector('.viewer');
    if (!viewer) {
      return;
    }
    if (stateName === 'ok' || stateName === 'standby' || stateName === 'connected') {
      viewer.href = viewer.dataset.href;
      viewer.classList.remove('disabled');
      viewer.setAttribute('aria-disabled', 'false');
      viewer.tabIndex = 0;
      return;
    }
    viewer.removeAttribute('href');
    viewer.classList.add('disabled');
    viewer.setAttribute('aria-disabled', 'true');
    viewer.tabIndex = -1;
  }

  async function fetchStatus(host) {
    return fetchJson(statusUrl(host), STATUS_TIMEOUT_MS);
  }

  async function fetchJson(url, timeoutMs, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        ...options,
      });
      const rttMs = performance.now() - startedAt;
      if (!response.ok) {
        return { rttMs, error: `HTTP ${response.status}` };
      }
      return { rttMs, status: await response.json() };
    } catch (error) {
      return {
        rttMs: performance.now() - startedAt,
        error: error.name === 'AbortError' ? 'timeout' : String(error.message || error),
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadModeOptions(host) {
    const state = getDeviceState(host);
    const tile = tiles.get(host);
    state.modeOptionsLoading = true;
    state.lastModeMessage = 'loading modes';
    updateModeControls(host, tile);

    const result = await fetchJson(modeUrl(host), MODE_TIMEOUT_MS);
    state.modeOptionsLoading = false;
    if (result.error || !result.status) {
      state.modeOptions = [];
      state.modeOptionsLoaded = false;
      state.lastModeMessage = result.error || 'mode unavailable';
      updateModeControls(host, tile);
      return;
    }

    state.modeOptions = Array.isArray(result.status.modes) ? result.status.modes : [];
    state.modeOptionsLoaded = state.modeOptions.length > 0;
    state.lastModeMessage = state.modeOptionsLoaded ? 'mode ready' : 'mode unavailable';
    if (result.status.active) {
      state.lastStatus = {
        ...(state.lastStatus || {}),
        mode: result.status.active,
      };
    }
    updateModeControls(host, tile);
  }

  function updateModeControls(host, tile = tiles.get(host)) {
    if (!tile) {
      return;
    }
    const state = getDeviceState(host);
    const select = tile.querySelector('.modeSelect');
    const button = tile.querySelector('.modeApply');
    const message = tile.querySelector('.modeMessage');
    const activeMode = state.lastStatus?.mode?.name || '';

    if (!state.modeOptionsLoaded) {
      const label = state.modeOptionsLoading ? 'mode loading' : 'mode unavailable';
      select.replaceChildren(new Option(label, ''));
      select.disabled = true;
      button.disabled = true;
      message.textContent = state.lastModeMessage || '';
      return;
    }

    const currentValues = Array.from(select.options).map((option) => option.value).join(',');
    const nextValues = state.modeOptions.map((mode) => mode.name).join(',');
    if (currentValues !== nextValues) {
      select.replaceChildren();
      for (const mode of state.modeOptions) {
        const option = document.createElement('option');
        option.value = mode.name;
        option.textContent = mode.label || mode.name;
        select.appendChild(option);
      }
    }
    const selectedBefore = select.value;
    if (
      activeMode &&
      state.modeOptions.some((mode) => mode.name === activeMode) &&
      (state.renderedActiveMode !== activeMode ||
        !state.modeOptions.some((mode) => mode.name === selectedBefore))
    ) {
      select.value = activeMode;
    }
    state.renderedActiveMode = activeMode;
    const selectedMode = select.value;
    select.disabled = state.modeBusy;
    button.disabled =
      state.modeBusy ||
      state.consecutiveFailures > 0 ||
      !selectedMode ||
      selectedMode === activeMode;
    button.textContent = state.modeBusy ? 'Switching' : 'Apply';
    message.textContent = state.lastModeMessage || '';
  }

  async function applySelectedMode(host) {
    const state = getDeviceState(host);
    const tile = tiles.get(host);
    const select = tile?.querySelector('.modeSelect');
    const mode = select?.value || '';
    if (!mode || state.modeBusy) {
      return;
    }

    const selected = state.modeOptions.find((item) => item.name === mode);
    const label = selected ? modeLabel({ mode: selected }) : mode;
    const hostname = state.lastStatus?.hostname || host;
    const confirmed = window.confirm(`${hostname} を ${label} に切り替えます。Momo が数秒再起動します。`);
    if (!confirmed) {
      return;
    }

    state.modeBusy = true;
    state.lastModeMessage = 'switching';
    updateModeControls(host, tile);
    const result = await fetchJson(modeUrl(host), MODE_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    state.modeBusy = false;

    if (result.error || !result.status || result.status.ok === false) {
      state.lastModeMessage = result.status?.error || result.error || 'switch failed';
      updateModeControls(host, tile);
      window.alert(`モード切替に失敗しました: ${state.lastModeMessage}`);
      return;
    }

    state.lastStatus = {
      ...(state.lastStatus || {}),
      mode: result.status.active || selected,
    };
    state.modeOptionsLoaded = false;
    state.lastModeMessage = 'restarting momo';
    updateModeControls(host, tile);
    window.setTimeout(() => {
      loadModeOptions(host);
      pollOnce();
    }, 3500);
  }

  async function loadLockStatus(host) {
    const state = getDeviceState(host);
    const status = state.lastStatus;
    const url = lockUrl(status);
    const tile = tiles.get(host);
    if (!url || state.lockBusy) {
      updateLockControls(host, tile);
      return;
    }
    try {
      const result = await fetchJson(url, LOCK_TIMEOUT_MS);
      if (result.error || !result.status) {
        throw new Error(result.error || 'lock unavailable');
      }
      state.lockStatus = result.status;
      state.lastLockMessage = result.status.locked ? 'locked' : 'free';
    } catch (error) {
      state.lockStatus = null;
      state.lastLockMessage = error.message || String(error);
    } finally {
      updateLockControls(host, tile);
      if (tile && state.lastStatus) {
        applyTileState(tile, classify(state.lastStatus, null, state));
      }
    }
  }

  function updateLockControls(host, tile = tiles.get(host)) {
    if (!tile) {
      return;
    }
    const state = getDeviceState(host);
    const status = state.lastStatus;
    const lockStatus = state.lockStatus;
    const refresh = tile.querySelector('.roomRefresh');
    const force = tile.querySelector('.roomForceRelease');
    const message = tile.querySelector('.roomMessage');
    const hasRoom = Boolean(status?.signaling?.room_id);
    const hasLockUrl = Boolean(lockUrl(status));
    const locked = Boolean(lockStatus?.locked);
    const holder = lockStatus?.lease?.clientId || 'n/a';

    setText(tile, '.roomLock', locked ? holder : (hasRoom ? 'free' : 'n/a'));
    refresh.disabled = !hasRoom || !hasLockUrl || state.lockBusy;
    force.disabled = !hasRoom || !hasLockUrl || !locked || !lockAdminToken || state.lockBusy;
    force.textContent = state.lockBusy ? 'Releasing' : 'Force Release';
    message.textContent = !lockAdminToken && locked
      ? `${state.lastLockMessage || ''} admin token required`.trim()
      : (state.lastLockMessage || '');
  }

  async function forceReleaseRoom(host) {
    const state = getDeviceState(host);
    const status = state.lastStatus;
    const url = lockUrl(status, '/force-release');
    if (!url || !lockAdminToken || state.lockBusy) {
      return;
    }
    const roomId = status?.signaling?.room_id || host;
    const confirmed = window.confirm(`${roomId} の Viewer lock を強制開放します。接続中の操縦者がいる場合も開放されます。`);
    if (!confirmed) {
      return;
    }

    state.lockBusy = true;
    state.lastLockMessage = 'force releasing';
    updateLockControls(host);
    try {
      const result = await fetchJson(url, LOCK_TIMEOUT_MS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FPV-Admin-Token': lockAdminToken,
        },
        body: JSON.stringify({ roomId }),
      });
      if (result.error || !result.status || result.status.ok === false) {
        throw new Error(result.status?.error || result.error || 'force release failed');
      }
      state.lockStatus = result.status;
      state.lastLockMessage = 'released';
    } catch (error) {
      state.lastLockMessage = error.message || String(error);
      window.alert(`強制開放に失敗しました: ${state.lastLockMessage}`);
    } finally {
      state.lockBusy = false;
      updateLockControls(host);
    }
  }

  function renderHosts() {
    grid.replaceChildren();
    tiles.clear();
    states.clear();
    for (const host of hosts) {
      tiles.set(host, createTile(host));
    }
    hostsInput.value = hosts.join(', ');
    totalCount.textContent = String(hosts.length);
  }

  async function pollOnce() {
    const results = await Promise.all(hosts.map(async (host) => [host, await fetchStatus(host)]));
    let online = 0;
    let warn = 0;
    let down = 0;
    for (const [host, result] of results) {
      updateTile(host, result);
      if (result.status && !result.error) {
        online += 1;
      }
      const tile = tiles.get(host);
      if (tile?.classList.contains('warn')) {
        warn += 1;
      }
      if (tile?.classList.contains('down')) {
        down += 1;
      }
    }
    onlineCount.textContent = String(online);
    warnCount.textContent = String(warn);
    downCount.textContent = String(down);
    totalCount.textContent = String(hosts.length);
    lastUpdate.textContent = new Date().toLocaleTimeString();
  }

  function applyHostList() {
    const nextHosts = parseHosts(hostsInput.value);
    if (nextHosts.length === 0) {
      return;
    }
    hosts = nextHosts;
    window.localStorage?.setItem('fpvMonitorHosts', hosts.join(','));
    renderHosts();
    pollOnce();
  }

  applyHosts.addEventListener('click', applyHostList);
  refreshNow.addEventListener('click', pollOnce);
  if (lockTokenInput) {
    lockTokenInput.value = lockAdminToken;
    lockTokenInput.addEventListener('change', () => {
      lockAdminToken = lockTokenInput.value.trim();
      if (lockAdminToken) {
        window.localStorage?.setItem('fpvRoomLockAdminToken', lockAdminToken);
      } else {
        window.localStorage?.removeItem('fpvRoomLockAdminToken');
      }
      for (const host of hosts) {
        updateLockControls(host);
      }
    });
  }
  exportJson.addEventListener('click', () => downloadText('fpv-monitor.json', JSON.stringify(samples, null, 2)));
  exportCsv.addEventListener('click', () => downloadText('fpv-monitor.csv', toCsv(samples)));
  hostsInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyHostList();
    }
  });

  renderHosts();
  pollOnce();
  window.setInterval(() => {
    if (!document.hidden) {
      pollOnce();
    }
  }, POLL_INTERVAL_MS);

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toCsv(rows) {
    if (rows.length === 0) {
      return '';
    }
    const headers = Object.keys(rows[0]);
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
    ].join('\n');
  }
})();
