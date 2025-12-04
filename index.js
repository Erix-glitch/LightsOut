const strips = Array.from(document.querySelectorAll(".light-strip"));
const startButton = document.querySelector("[data-start]");
const statusEl = document.querySelector("[data-status]");

const MIN_LIGHTS_OUT_MS = 200;
const MAX_LIGHTS_OUT_MS = 3000;
const ON_PHASE_MS = strips.length * 1000; // each column lights every second
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
let timeDeltaMs = 0; // adjustment applied to scheduled lights-out times (ms)

const scheduleTimes = [
  { h: 8, m: 25 },
  { h: 8, m: 30 },
  { h: 10, m: 20 },
  { h: 10, m: 25 },
  { h: 11, m: 35 },
  { h: 12, m: 15 },
  { h: 12, m: 20 },
  { h: 13, m: 30 },
  { h: 13, m: 35 },
  { h: 14, m: 43 },
];

let autoTimerId = null;
let isRunning = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomLightsOutDelay = (max = MAX_LIGHTS_OUT_MS) =>
  MIN_LIGHTS_OUT_MS + Math.random() * Math.max(MIN_LIGHTS_OUT_MS, max - MIN_LIGHTS_OUT_MS);

function resetLights() {
  strips.forEach((strip) => strip.classList.remove("on"));
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function getNextTargetTime(now = new Date()) {
  const deltaWithinMinute = timeDeltaMs % MINUTE_MS;
  const candidates = scheduleTimes.map(({ h, m }) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    const adjusted = new Date(d.getTime() + deltaWithinMinute);
    if (adjusted <= now) adjusted.setTime(adjusted.getTime() + DAY_MS);
    return adjusted;
  });
  return candidates.sort((a, b) => a - b)[0];
}

function scheduleNextAutoRun() {
  if (autoTimerId) {
    clearTimeout(autoTimerId);
    autoTimerId = null;
  }

  const now = new Date();
  const target = getNextTargetTime(now);
  const windowForDelay = target.getTime() - now.getTime() - ON_PHASE_MS;
  const effectiveMax = Math.min(MAX_LIGHTS_OUT_MS, Math.max(MIN_LIGHTS_OUT_MS, windowForDelay));
  const lightsOutDelay = randomLightsOutDelay(effectiveMax);

  let startDelay = target.getTime() - now.getTime() - ON_PHASE_MS - lightsOutDelay;
  if (startDelay < 0) startDelay = 0;

  if (statusEl) statusEl.textContent = `Next bell: ${formatTime(target)}`;

  autoTimerId = setTimeout(() => {
    runSequence({ lightsOutDelay, isAuto: true, targetTime: target });
  }, startDelay);
}

async function runSequence({ lightsOutDelay = randomLightsOutDelay(), isAuto = false, targetTime = null } = {}) {
  if (isRunning) return;
  isRunning = true;
  if (startButton) startButton.disabled = true;

  if (statusEl) {
    statusEl.textContent = isAuto
      ? `Auto sequence running (lights out at ${formatTime(targetTime || new Date())})`
      : "Lights on...";
  }

  resetLights();
  for (const strip of strips) {
    strip.classList.add("on");
    await delay(1000);
  }

  if (statusEl) statusEl.textContent = "Lights out...";
  await delay(lightsOutDelay);
  resetLights();

  if (statusEl) statusEl.textContent = "Ready";
  if (startButton) startButton.disabled = false;
  isRunning = false;

  scheduleNextAutoRun();
}

// Prevent manual runs if an auto run is imminent to avoid conflicts.
function safeManualStart() {
  const now = new Date();
  const nextTarget = getNextTargetTime(now);
  const timeUntilAuto = nextTarget.getTime() - now.getTime();
  const neededWindow = ON_PHASE_MS + MAX_LIGHTS_OUT_MS + 500;

  if (timeUntilAuto <= neededWindow) {
    if (statusEl) statusEl.textContent = "Auto run is imminent; manual start blocked.";
    return;
  }

  runSequence();
}

resetLights();

async function loadTimeDelta() {
  try {
    const res = await fetch("/timeDelta.txt", { cache: "no-cache" });
    if (!res.ok) return;
    const txt = (await res.text()).trim();
    const parsed = Number(txt);
    if (Number.isFinite(parsed)) {
      timeDeltaMs = parsed;
    }
  } catch (err) {
    console.warn("Could not load timeDelta.txt", err);
  }
}

async function init() {
  await loadTimeDelta();
  scheduleNextAutoRun();
}

init();
startButton?.addEventListener("click", safeManualStart);
