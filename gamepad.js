"use strict";

const padsEl = document.getElementById("pads");
const statusEl = document.getElementById("status");
const mappingOutputEl = document.getElementById("mappingOutput");
const resetCalibrationEl = document.getElementById("resetCalibration");
const copyMappingEl = document.getElementById("copyMapping");
const saveMappingEl = document.getElementById("saveMapping");
const clearMappingEl = document.getElementById("clearMapping");
const openViewerEl = document.getElementById("openViewer");
const assignStatusEl = document.getElementById("assignStatus");
const captureButtons = Array.from(document.querySelectorAll(".captureButton"));
const optionInputs = {
  steeringInvert: document.getElementById("steeringInvert"),
  throttleInvert: document.getElementById("throttleInvert"),
  brakeInvert: document.getElementById("brakeInvert"),
  steeringGain: document.getElementById("steeringGain"),
  steeringDeadzone: document.getElementById("steeringDeadzone"),
  pedalDeadzone: document.getElementById("pedalDeadzone")
};

const storageKey = "fpvGamepadMapping";
const axisDeadzone = 0.003;
const recentMs = 700;
const axisChangeThreshold = 0.01;
const buttonChangeThreshold = 0.05;
const states = new Map();

let lastSeen = 0;
let selectedGamepadIndex = null;

const mapping = {
  id: "",
  index: 0,
  steeringAxis: null,
  steeringInvert: false,
  steeringGain: 4.0,
  steeringDeadzone: 0.03,
  throttleAxis: null,
  throttleInvert: false,
  throttleMin: 1500,
  throttleMax: 2000,
  brakeAxis: null,
  brakeInvert: false,
  pedalDeadzone: 0.05,
  reverseMin: 1300,
  driveButton: null,
  paddleLeftButton: null,
  paddleRightButton: null
};

function formatValue(value) {
  const normalized = Math.abs(value) < axisDeadzone ? 0 : value;
  return normalized.toFixed(4);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function axisPercent(value) {
  return clamp01((value + 1) / 2) * 100;
}

function buttonPercent(value) {
  return clamp01(value) * 100;
}

function loadSavedMapping() {
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) {
      return;
    }
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") {
      return;
    }
    Object.assign(mapping, saved);
  } catch (error) {
    console.warn("load saved mapping failed", error);
  }
}

function numberFromInput(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function syncOptionsFromMapping() {
  optionInputs.steeringInvert.checked = Boolean(mapping.steeringInvert);
  optionInputs.throttleInvert.checked = Boolean(mapping.throttleInvert);
  optionInputs.brakeInvert.checked = Boolean(mapping.brakeInvert);
  optionInputs.steeringGain.value = String(mapping.steeringGain ?? 4.0);
  optionInputs.steeringDeadzone.value = String(mapping.steeringDeadzone ?? 0.03);
  optionInputs.pedalDeadzone.value = String(mapping.pedalDeadzone ?? 0.05);
}

function syncMappingFromOptions() {
  mapping.steeringInvert = Boolean(optionInputs.steeringInvert.checked);
  mapping.throttleInvert = Boolean(optionInputs.throttleInvert.checked);
  mapping.brakeInvert = Boolean(optionInputs.brakeInvert.checked);
  mapping.steeringGain = numberFromInput(optionInputs.steeringGain, 4.0);
  mapping.steeringDeadzone = numberFromInput(optionInputs.steeringDeadzone, 0.03);
  mapping.pedalDeadzone = numberFromInput(optionInputs.pedalDeadzone, 0.05);
}

function buildViewerUrl() {
  const url = new URL(openViewerEl?.getAttribute("href") || "./viewer.html", location.href);
  url.searchParams.set("gamepad", "1");
  url.searchParams.set("gamepadIndex", String(mapping.index ?? 0));
  if (mapping.steeringAxis !== null) {
    url.searchParams.set("gamepadSteeringAxis", String(mapping.steeringAxis));
  }
  url.searchParams.set("gamepadSteeringInvert", mapping.steeringInvert ? "1" : "0");
  url.searchParams.set("gamepadSteeringGain", String(mapping.steeringGain ?? 4.0));
  url.searchParams.set("gamepadSteeringDeadzone", String(mapping.steeringDeadzone ?? 0.03));
  if (mapping.throttleAxis !== null) {
    url.searchParams.set("gamepadThrottleAxis", String(mapping.throttleAxis));
  }
  url.searchParams.set("gamepadThrottleInvert", mapping.throttleInvert ? "1" : "0");
  if (mapping.brakeAxis !== null) {
    url.searchParams.set("gamepadBrakeAxis", String(mapping.brakeAxis));
  }
  url.searchParams.set("gamepadBrakeInvert", mapping.brakeInvert ? "1" : "0");
  url.searchParams.set("gamepadPedalDeadzone", String(mapping.pedalDeadzone ?? 0.05));
  if (mapping.driveButton !== null) {
    url.searchParams.set("gamepadDriveButton", String(mapping.driveButton));
  }
  if (mapping.paddleLeftButton !== null) {
    url.searchParams.set("gamepadPaddleLeftButton", String(mapping.paddleLeftButton));
  }
  if (mapping.paddleRightButton !== null) {
    url.searchParams.set("gamepadPaddleRightButton", String(mapping.paddleRightButton));
  }
  return url.toString();
}

function updateViewerLink() {
  if (openViewerEl) {
    openViewerEl.href = buildViewerUrl();
  }
}

function getState(gamepad) {
  let state = states.get(gamepad.index);
  if (!state) {
    state = {
      id: gamepad.id || "",
      axes: [],
      buttons: []
    };
    states.set(gamepad.index, state);
  }
  state.id = gamepad.id || state.id;
  return state;
}

function updateState(gamepad) {
  const now = performance.now();
  const state = getState(gamepad);

  gamepad.axes.forEach((value, index) => {
    const previous = state.axes[index];
    const last = previous ? previous.current : value;
    const delta = value - last;
    const changed = Math.abs(delta) >= axisChangeThreshold;
    state.axes[index] = {
      current: value,
      min: previous ? Math.min(previous.min, value) : value,
      max: previous ? Math.max(previous.max, value) : value,
      delta,
      lastChange: changed ? now : previous?.lastChange || 0
    };
  });

  gamepad.buttons.forEach((button, index) => {
    const value = typeof button === "number" ? button : button.value;
    const pressed = typeof button === "object" && button.pressed;
    const previous = state.buttons[index];
    const last = previous ? previous.current : value;
    const delta = value - last;
    const changed = Math.abs(delta) >= buttonChangeThreshold || pressed !== Boolean(previous?.pressed);
    state.buttons[index] = {
      current: value,
      pressed,
      min: previous ? Math.min(previous.min, value) : value,
      max: previous ? Math.max(previous.max, value) : value,
      delta,
      lastChange: changed ? now : previous?.lastChange || 0
    };
  });

  return state;
}

function makeHeaderRow() {
  const row = document.createElement("div");
  row.className = "row header";
  for (const text of ["input", "current", "min", "max", "delta", "range"]) {
    const cell = document.createElement("div");
    cell.textContent = text;
    row.appendChild(cell);
  }
  return row;
}

function makeRow(label, valueText, minText, maxText, deltaText, percent, active, recent) {
  const row = document.createElement("div");
  row.className = ["row", active ? "button-on" : "", recent ? "recent" : ""].filter(Boolean).join(" ");

  const name = document.createElement("div");
  name.textContent = label;

  const value = document.createElement("div");
  value.textContent = valueText;

  const min = document.createElement("div");
  min.textContent = minText;

  const max = document.createElement("div");
  max.textContent = maxText;

  const delta = document.createElement("div");
  delta.textContent = deltaText;

  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("div");
  fill.className = "fill";
  fill.style.width = `${percent}%`;
  bar.appendChild(fill);

  row.append(name, value, min, max, delta, bar);
  return row;
}

function makeActions(type, index) {
  const actions = document.createElement("div");
  actions.className = "actions";

  const labels = type === "axis"
    ? [
      ["steeringAxis", "Steering"],
      ["throttleAxis", "Throttle"],
      ["brakeAxis", "Brake"]
    ]
    : [
      ["driveButton", "Drive"],
      ["paddleLeftButton", "Paddle L"],
      ["paddleRightButton", "Paddle R"]
    ];

  for (const [field, label] of labels) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.field = field;
    button.dataset.index = String(index);
    if (mapping[field] === index) {
      button.classList.add("assigned");
      button.textContent = `${label}: ${index}`;
    } else {
      button.textContent = `Set ${label}`;
    }
    actions.appendChild(button);
  }

  return actions;
}

function renderGamepad(gamepad) {
  const now = performance.now();
  const state = updateState(gamepad);
  const pad = document.createElement("section");
  pad.className = "pad";

  const title = document.createElement("h2");
  title.textContent = `#${gamepad.index} ${gamepad.id || "Unknown gamepad"}`;
  pad.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [
    `connected=${gamepad.connected}`,
    `mapping=${gamepad.mapping || "none"}`,
    `axes=${gamepad.axes.length}`,
    `buttons=${gamepad.buttons.length}`,
    `timestamp=${Math.round(gamepad.timestamp || 0)}`
  ].join("  ");
  pad.appendChild(meta);
  pad.appendChild(makeHeaderRow());

  state.axes.forEach((axis, index) => {
    const recent = now - axis.lastChange <= recentMs;
    pad.appendChild(makeRow(
      `axis ${index}`,
      formatValue(axis.current),
      formatValue(axis.min),
      formatValue(axis.max),
      axis.delta.toFixed(4),
      axisPercent(axis.current),
      false,
      recent
    ));
    pad.appendChild(makeActions("axis", index));
  });

  state.buttons.forEach((button, index) => {
    const recent = now - button.lastChange <= recentMs;
    pad.appendChild(makeRow(
      `btn ${index}`,
      button.current.toFixed(3),
      button.min.toFixed(3),
      button.max.toFixed(3),
      button.delta.toFixed(3),
      buttonPercent(button.current),
      button.pressed,
      recent
    ));
    pad.appendChild(makeActions("button", index));
  });

  return pad;
}

function updateMappingOutput() {
  syncMappingFromOptions();
  mappingOutputEl.textContent = JSON.stringify(mapping, null, 2);
  updateViewerLink();
}

function fieldLabel(field) {
  switch (field) {
    case "steeringAxis":
      return "Steering";
    case "throttleAxis":
      return "Throttle";
    case "brakeAxis":
      return "Brake";
    case "driveButton":
      return "Drive";
    case "paddleLeftButton":
      return "Paddle L";
    case "paddleRightButton":
      return "Paddle R";
    default:
      return field;
  }
}

function assignInput(field, index) {
  mapping[field] = index;
  updateMappingOutput();
  assignStatusEl.textContent = `${fieldLabel(field)} = ${index}`;
}

function saveMapping() {
  syncMappingFromOptions();
  window.localStorage?.setItem(storageKey, JSON.stringify(mapping));
  updateMappingOutput();
  assignStatusEl.textContent = "saved for Viewer";
}

function clearSavedMapping() {
  window.localStorage?.removeItem(storageKey);
  assignStatusEl.textContent = "saved mapping cleared";
}

function resetCalibration() {
  states.clear();
}

function getCaptureUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("captureUrl") || "http://127.0.0.1:18084/capture";
}

function snapshotGamepads(label) {
  const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  return {
    label,
    at: new Date().toISOString(),
    pads: gamepads.map((gamepad) => ({
      index: gamepad.index,
      id: gamepad.id,
      mapping: gamepad.mapping || "",
      connected: gamepad.connected,
      axes: gamepad.axes.map((value) => Number(value.toFixed(6))),
      buttons: gamepad.buttons.map((button) => ({
        pressed: button.pressed,
        touched: button.touched,
        value: Number(button.value.toFixed(6))
      }))
    }))
  };
}

async function captureGamepad(label, button) {
  const payload = snapshotGamepads(label);
  if (payload.pads.length === 0) {
    assignStatusEl.textContent = `capture ${label}: no gamepad`;
    return;
  }
  try {
    await fetch(getCaptureUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assignStatusEl.textContent = `captured ${label}`;
    if (button) {
      button.textContent = `Captured ${label}`;
      setTimeout(() => {
        button.textContent = button.dataset.originalText || button.textContent;
      }, 900);
    }
  } catch (error) {
    console.error("capture failed", error);
    assignStatusEl.textContent = `capture failed: ${label}`;
  }
}

function render() {
  const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  padsEl.replaceChildren();

  if (gamepads.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No gamepad reported by the browser yet. Click this page and move the wheel or press a button.";
    padsEl.appendChild(empty);
  } else {
    lastSeen = performance.now();
    if (selectedGamepadIndex === null || !gamepads.some((gamepad) => gamepad.index === selectedGamepadIndex)) {
      selectedGamepadIndex = gamepads[0].index;
      mapping.id = gamepads[0].id || "";
      mapping.index = gamepads[0].index;
    }
    for (const gamepad of gamepads) {
      padsEl.appendChild(renderGamepad(gamepad));
    }
  }

  const ageText = lastSeen > 0 ? `last seen ${(performance.now() - lastSeen).toFixed(0)} ms ago` : "not seen";
  statusEl.textContent = `${gamepads.length} gamepad(s), ${ageText}`;
  updateMappingOutput();
  requestAnimationFrame(render);
}

window.addEventListener("gamepadconnected", (event) => {
  lastSeen = performance.now();
  selectedGamepadIndex = event.gamepad.index;
  mapping.id = event.gamepad.id || "";
  mapping.index = event.gamepad.index;
  console.log("gamepadconnected", event.gamepad);
});

window.addEventListener("gamepaddisconnected", (event) => {
  console.log("gamepaddisconnected", event.gamepad);
});

padsEl.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button[data-field][data-index]");
  if (!button) {
    return;
  }
  event.preventDefault();
  assignInput(button.dataset.field, Number(button.dataset.index));
});

resetCalibrationEl.addEventListener("click", () => {
  resetCalibration();
});

copyMappingEl.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(mappingOutputEl.textContent);
    copyMappingEl.textContent = "Copied";
    setTimeout(() => {
      copyMappingEl.textContent = "Copy mapping";
    }, 900);
  } catch (error) {
    console.error("copy failed", error);
    copyMappingEl.textContent = "Copy failed";
    setTimeout(() => {
      copyMappingEl.textContent = "Copy mapping";
    }, 1200);
  }
});

saveMappingEl.addEventListener("click", () => {
  saveMapping();
});

clearMappingEl.addEventListener("click", () => {
  clearSavedMapping();
});

Object.values(optionInputs).forEach((input) => {
  input.addEventListener("input", updateMappingOutput);
});

captureButtons.forEach((button) => {
  button.dataset.originalText = button.textContent;
  button.addEventListener("click", () => {
    captureGamepad(button.dataset.label, button);
  });
});

loadSavedMapping();
syncOptionsFromMapping();
render();
