"use strict";

/**
 * All tunable film + page-behavior values live here.
 * Page copy outside the scroll callouts is edited in index.html.
 *
 * Frame files are 1-based:
 *   framePath(1)   → ezgif-frame-001.jpg
 *   framePath(240) → ezgif-frame-240.jpg
 * Scroll progress 0 maps to frame 1. Progress 1 maps to frame 240.
 */
const CONFIG = {
  /** Total frames. Scroll math uses (frameCount - 1) so the last file is reachable. */
  frameCount: 240,

  /** Folder and filename pattern. i runs from 1 through frameCount. */
  framePath: (i) =>
    `ezgif-6b3d64072876ebe2-jpg/ezgif-frame-${String(i).padStart(3, "0")}.jpg`,

  /** Height of the sticky scroll film on desktop. */
  scrollHeightVh: 500,

  /** Slightly shorter film on viewports up to 768px. */
  scrollHeightMobileVh: 400,

  /** "contain" shows the whole frame. "cover" fills the viewport and crops. */
  fitMode: "contain",

  /**
   * How much of the remaining scroll distance to close each 60fps frame.
   * 1 snaps to the scrollbar. Lower values ease playback so it feels less jumpy.
   */
  easing: 0.12,

  /** How many frames to request at once while preloading. */
  batchSize: 12,

  /** 1-based frame held still when the visitor prefers reduced motion. */
  reducedMotionFrame: 1,

  /**
   * Text that fades and slides across the film.
   * Progress 0 is the start of the sticky section; 1 is the end.
   */
  callouts: [
    {
      startProgress: 0,
      endProgress: 0.25,
      title: "Twenty liters",
      description:
        "One jar, a full 20 L of clean drinking water. Enough to keep a whole household going."
    },
    {
      startProgress: 0.25,
      endProgress: 0.5,
      title: "Clean, and clearly so",
      description:
        "A clear, food-grade jar lets you see exactly what you are getting: water that looks as clean as it should."
    },
    {
      startProgress: 0.5,
      endProgress: 0.75,
      title: "Twenty-five years",
      description:
        "For 25 years, Nepali families across the Valley have counted on us for their daily water."
    },
    {
      startProgress: 0.75,
      endProgress: 1,
      title: "Priced for everyone",
      description:
        "Our aim has always been simple: good water at a fair price, within reach of the general public."
    }
  ]
};

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileQuery = window.matchMedia("(max-width: 768px)");
let reducedMotion = reducedMotionQuery.matches;

if (reducedMotion) {
  document.documentElement.classList.add("reduced-motion");
}

const sequence = document.getElementById("sequence");
const canvas = document.getElementById("frames");
const calloutRoot = document.getElementById("callouts");
const loader = document.getElementById("loader");
const loaderBar = document.getElementById("loader-bar");
const loaderProgress = document.getElementById("loader-progress");
const loaderPct = document.getElementById("loader-pct");
const railBar = document.getElementById("rail-bar");
const nav = document.querySelector(".nav");
const form = document.getElementById("order-form");
const formStatus = document.getElementById("form-status");

const ctx = canvas.getContext("2d", { alpha: false });

const state = {
  frames: new Array(CONFIG.frameCount).fill(null),
  loaded: 0,
  cssW: 0,
  cssH: 0,
  dpr: 1,
  bg: "#0b1316",
  scrollable: 1,
  target: 0,
  current: 0,
  scrollDirty: true,
  paintDirty: false,
  drawnIndex: -1,
  drawnImage: null,
  vh: window.innerHeight,
  lastTime: performance.now()
};

const calloutEls = buildCallouts();

applySequenceHeight();
measure();
syncCanvasSize();
bindUi();
preload().then(reveal).catch(reveal);

if (!reducedMotion) {
  requestAnimationFrame(tick);
} else {
  state.paintDirty = true;
  renderCurrent(true);
}

function buildCallouts() {
  calloutRoot.replaceChildren();
  return CONFIG.callouts.map((item, index) => {
    const article = document.createElement("article");
    article.className = "callout";

    const panel = document.createElement("div");
    panel.className = "callout__panel";

    const kicker = document.createElement("p");
    kicker.className = "callout__kicker";
    kicker.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("h2");
    title.className = "callout__title";
    title.textContent = item.title;

    const text = document.createElement("p");
    text.className = "callout__text";
    text.textContent = item.description;

    panel.append(kicker, title, text);
    article.append(panel);
    calloutRoot.append(article);

    if (reducedMotion) {
      panel.style.opacity = "1";
      panel.style.transform = "none";
    }

    return panel;
  });
}

function applySequenceHeight() {
  if (reducedMotion) {
    sequence.style.height = "auto";
    return;
  }
  const vh = mobileQuery.matches ? CONFIG.scrollHeightMobileVh : CONFIG.scrollHeightVh;
  sequence.style.height = `${vh}vh`;
}

function measure() {
  state.vh = window.innerHeight;
  state.scrollable = Math.max(1, sequence.offsetHeight - state.vh);
}

function readBackground() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--frame-bg")
    .trim();
  return value || "#0b1316";
}

function syncCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap keeps retina sharp without a 3x buffer
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  state.cssW = rect.width;
  state.cssH = rect.height;
  state.dpr = dpr;
  state.bg = readBackground();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    state.drawnImage = null;
  }
}

function loadFrame(frameNumber) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    if ("fetchPriority" in image) {
      image.fetchPriority = frameNumber === 1 ? "high" : "low";
    }
    image.onload = () => {
      if (typeof image.decode === "function") {
        image.decode().then(() => resolve(image)).catch(() => resolve(image));
        return;
      }
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = CONFIG.framePath(frameNumber);
  });
}

function noteLoaded() {
  state.loaded += 1;
  const fraction = state.loaded / CONFIG.frameCount;
  const percent = Math.round(fraction * 100);
  loaderBar.style.transform = `scaleX(${fraction})`;
  loaderProgress.setAttribute("aria-valuenow", String(percent));
  loaderPct.textContent = `${percent}%`;
}

async function preload() {
  const first = await loadFrame(1);
  state.frames[0] = first;
  noteLoaded();
  state.paintDirty = true;
  renderCurrent(true);

  const batchSize = Math.max(1, CONFIG.batchSize);
  for (let start = 2; start <= CONFIG.frameCount; start += batchSize) {
    const end = Math.min(CONFIG.frameCount, start + batchSize - 1);
    const jobs = [];
    for (let n = start; n <= end; n += 1) {
      jobs.push(
        loadFrame(n).then((image) => {
          state.frames[n - 1] = image;
          noteLoaded();
          state.paintDirty = true;
        })
      );
    }
    await Promise.all(jobs);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

function reveal() {
  renderCurrent(true);
  loader.classList.add("is-hidden");
  const finish = () => {
    loader.hidden = true;
  };
  if (reducedMotion) {
    finish();
    return;
  }
  loader.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 900);
}

function imageFor(index) {
  if (state.frames[index]) return state.frames[index];
  for (let i = index - 1; i >= 0; i -= 1) {
    if (state.frames[i]) return state.frames[i];
  }
  return null;
}

function paint(image) {
  if (!ctx || !image || !state.cssW || !state.cssH) return;
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  if (!iw || !ih) return;

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, state.cssW, state.cssH);

  const cover = CONFIG.fitMode === "cover";
  const scale = cover
    ? Math.max(state.cssW / iw, state.cssH / ih)
    : Math.min(state.cssW / iw, state.cssH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (state.cssW - dw) / 2;
  const dy = (state.cssH - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function frameIndexFor(progress) {
  const max = CONFIG.frameCount - 1;
  return clamp(Math.round(progress * max), 0, max);
}

function renderCurrent(force) {
  const progress = reducedMotion ? 0 : state.current;
  const index = reducedMotion
    ? clamp(CONFIG.reducedMotionFrame, 1, CONFIG.frameCount) - 1
    : frameIndexFor(progress);
  const image = imageFor(index);
  if (!image) return;

  const same =
    index === state.drawnIndex && image === state.drawnImage && !force;
  if (same) return;

  const needsPaint = force || image !== state.drawnImage;
  state.drawnIndex = index;
  state.drawnImage = image;
  canvas.dataset.frame = String(index + 1);
  if (needsPaint) paint(image);
}

function readProgress() {
  const top = sequence.getBoundingClientRect().top;
  return clamp(-top / state.scrollable, 0, 1);
}

function calloutOpacity(progress, start, end, index) {
  const last = CONFIG.callouts.length - 1;
  const feather = 0.045;
  const inStart = index === 0 ? start : start - feather;
  const outEnd = index === last ? end : end + feather;
  if (progress < inStart || progress > outEnd) return 0;

  const fadeIn = index === 0 ? 0 : feather * 2;
  const fadeOut = index === last ? 0 : feather * 2;
  let opacity = 1;
  if (fadeIn > 0 && progress < inStart + fadeIn) opacity = (progress - inStart) / fadeIn;
  if (fadeOut > 0 && progress > outEnd - fadeOut) {
    opacity = Math.min(opacity, (outEnd - progress) / fadeOut);
  }
  return clamp(opacity, 0, 1);
}

function updateCallouts(progress) {
  if (reducedMotion) return;
  for (let i = 0; i < calloutEls.length; i += 1) {
    const item = CONFIG.callouts[i];
    const opacity = calloutOpacity(progress, item.startProgress, item.endProgress, i);
    const next = opacity.toFixed(3);
    const el = calloutEls[i];
    if (el._o === next) continue;
    el._o = next;
    el.style.opacity = next;
    const y = (1 - opacity) * 18;
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  }
}

function updateRail(progress) {
  if (!railBar || reducedMotion) return;
  const next = progress.toFixed(4);
  if (railBar._p === next) return;
  railBar._p = next;
  railBar.style.transform = `scaleY(${progress})`;
}

function tick(now) {
  const delta = Math.min(48, now - state.lastTime);
  state.lastTime = now;

  if (window.innerHeight !== state.vh) {
    measure();
    syncCanvasSize();
    state.scrollDirty = true;
  }

  if (state.scrollDirty) {
    state.target = readProgress();
    state.scrollDirty = false;
  }

  const ease = 1 - Math.pow(1 - clamp(CONFIG.easing, 0.01, 1), delta / 16.67);
  const deltaProgress = state.target - state.current;
  if (Math.abs(deltaProgress) < 0.0004) state.current = state.target;
  else state.current += deltaProgress * ease;

  renderCurrent(false);
  if (state.paintDirty) {
    state.paintDirty = false;
    renderCurrent(false);
  }
  updateCallouts(state.current);
  updateRail(state.current);
  requestAnimationFrame(tick);
}

function onResize() {
  applySequenceHeight();
  measure();
  syncCanvasSize();
  state.scrollDirty = true;
  state.paintDirty = true;
  if (reducedMotion) renderCurrent(true);
}

function bindUi() {
  window.addEventListener("scroll", () => {
    state.scrollDirty = true;
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });

  window.addEventListener("resize", onResize, { passive: true });

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
  }

  mobileQuery.addEventListener("change", onResize);
  reducedMotionQuery.addEventListener("change", () => {
    window.location.reload();
  });

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      formStatus.textContent =
        "Thank you. This preview keeps your note in the browser only — connect a form endpoint when you are ready to take orders.";
      form.reset();
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
