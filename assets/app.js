// Wedding gallery: carousel of every photo, chapter grid, full-screen viewer with
// slideshow, Colour / Black & white and Framed switches, downloads, three languages.
// Photos come from photos.json (made by tools/build_photos.py); text from i18n.js.

const CHAPTERS = [
  { key: "ceremony", number: "i." },
  { key: "garden", number: "ii." },
];
const OPENER_ID = "20";  // the carousel starts with the two of us, then runs in order
const PREVIEW_ID = "30"; // the photo on the "Download all" card
const SLIDESHOW_MS = 3000;
const EASE = "cubic-bezier(.2, .7, .2, 1)";
const ZIP_BASE = "https://github.com/morvaybalazs/wedding-gallery/releases/download/photos/";
const ZIP_LABELS = { "colour": "zipColour", "bw": "zipBw", "framed-colour": "zipFramedColour", "framed-bw": "zipFramedBw" };
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>';
const ICON_TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>';

const $ = (id) => document.getElementById(id);
const touch = matchMedia("(pointer: coarse)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const moving = () => !reduceMotion.matches;
// iPhone/iPad: the share sheet's "Save Image" is the way into the Photos app.
// Everywhere else (Android, computers) a normal download is better.
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const shareToSave = isIOS && typeof navigator.canShare === "function";
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

let photos = [];   // in order, as numbered 1-42
let deck = [];     // carousel order
let byId = {};
let zipInfo = null;
let loadFailed = false;

/* ---------- Language ---------- */

// Always English, unless the link asks for Polish or Hungarian (?lang=pl / ?lang=hu).
// A tap on a flag changes the language for this visit only.
const codes = LANGUAGES.map((l) => l.code);
const linkLang = new URLSearchParams(location.search).get("lang");
let lang = codes.includes(linkLang) ? linkLang : "en";
try { localStorage.removeItem("gallery-lang"); } catch {} // forget picks saved by older versions

function t(key, ...args) {
  const value = STRINGS[lang][key] ?? STRINGS.en[key];
  return typeof value === "function" ? value(...args) : value;
}

function renderLanguages() {
  $("langs").innerHTML = LANGUAGES.map((l) => `
    <button type="button" data-lang="${l.code}" lang="${l.code}">
      <img src="${l.flag}" alt="" width="20" height="20"><span>${l.name}</span>
    </button>`).join("");
  $("langs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (b) setLanguage(b.dataset.lang);
  });
}

function setLanguage(code) {
  lang = code;
  // Only adjust a ?lang= the link already had, so a reload keeps the pick.
  // Never add one: a link copied from the address bar should open in English.
  const url = new URL(location.href);
  if (url.searchParams.has("lang")) {
    if (code === "en") url.searchParams.delete("lang"); else url.searchParams.set("lang", code);
    history.replaceState(history.state, "", url);
  }
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  $("hint").textContent = loadFailed ? t("loadError") : t(touch ? "hintTouch" : "hintMouse");

  renderControls();
  document.querySelectorAll("[data-chapter]").forEach((head) => {
    head.querySelector("h2").textContent = t(head.dataset.chapter);
    head.querySelector(".n").textContent = t("photos", Number(head.dataset.count));
  });
  slides.forEach((s, i) => {
    s.querySelector(".slide-open").setAttribute("aria-label", t("open", i + 1, slides.length));
    s.querySelector(".card-dl span").textContent = t("download");
    s.querySelector(".card-dl").setAttribute("aria-label", t("downloadOne", number(deck[i])));
  });
  document.querySelectorAll(".tile").forEach((b) => b.setAttribute("aria-label", t("open", number(byId[b.dataset.id]), photos.length)));
  document.querySelectorAll("img[data-id]").forEach((el) => { el.alt = t("alt", number(byId[el.dataset.id])); });
  buildZips();
  markCurrent();
  updatePlay();
  if (viewer.open && viewerList.length) {
    $("viewer-count").textContent = t("count", viewerIndex + 1, viewerList.length);
    stage.querySelectorAll("img").forEach((el) => { el.alt = t("alt", number(viewerList[viewerIndex])); });
  }
}

/* ---------- Colour / Black & white and Framed ---------- */

// First-time visitors see colour without the frame: true to the day, and the full-size files
// (the framed copies are much smaller). Anyone who changes it keeps their choice.
const state = { tone: "colour", framed: false };
const savedView = store.get("gallery-view");
if (savedView) {
  state.tone = savedView.tone === "bw" ? "bw" : "colour";
  state.framed = savedView.framed === true;
}

const version = () => (state.framed ? "framed-" : "") + state.tone;
const src = (p, size, v = version()) => `photos/${v}/${size}/${p.id}.jpg`;
const ratio = (p) => { const [w, h] = p.v[version()]; return w / h; };
const number = (p) => photos.indexOf(p) + 1;

// A soft wash of the photo's own tones, shown while it loads.
function placeholder(box, p) {
  const g = p.g && p.g[version()];
  box.style.backgroundImage = g ? `linear-gradient(${g.split(" ").join(", ")})` : "";
  box.style.backgroundSize = "";
  box.style.backgroundPosition = "";
}

function renderControls() {
  document.querySelectorAll("[data-controls]").forEach((box) => {
    box.innerHTML = `
      <div class="seg" role="radiogroup" aria-label="${t("toneGroup")}">
        <button type="button" role="radio" data-tone="colour">${t("colour")}</button>
        <button type="button" role="radio" data-tone="bw">${t("bw")}</button>
      </div>
      <button type="button" class="chip" role="switch" data-toggle="framed">
        <span class="tick">${ICON_TICK}</span><span>${t("framed")}</span>
      </button>`;
  });
  syncSwitches();
}

function syncSwitches() {
  document.querySelectorAll("[data-tone]").forEach((b) => b.setAttribute("aria-checked", b.dataset.tone === state.tone));
  document.querySelectorAll("[data-toggle=framed]").forEach((b) => b.setAttribute("aria-checked", state.framed));
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tone], [data-toggle]");
  if (!b) return;
  if (b.dataset.tone) {
    if (b.dataset.tone === state.tone) return;
    state.tone = b.dataset.tone;
  } else {
    state.framed = !state.framed;
  }
  store.set("gallery-view", state);
  applyVersion();
});

const onScreen = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
};

function applyVersion() {
  // Keep the photos someone is looking at in place while frames and row heights change.
  const barBottom = document.querySelector(".bar").getBoundingClientRect().bottom;
  const anchor = [...document.querySelectorAll(".tile")].find((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > barBottom && r.top < innerHeight;
  });
  const before = anchor ? anchor.getBoundingClientRect().top : 0;

  syncSwitches();
  document.body.classList.toggle("is-framed", state.framed);

  let order = 0;
  document.querySelectorAll("img[data-id]").forEach((el) => {
    const p = byId[el.dataset.id];
    const box = el.closest("[data-r]");
    const next = src(p, el.dataset.size);
    el.dataset.want = next; // the latest choice wins, even if an older copy is still loading
    box.style.setProperty("--r", ratio(p));
    if (el.getAttribute("src") === next) return;
    if (!el.classList.contains("loaded")) { el.src = next; placeholder(box, p); return; }
    const k = onScreen(el) ? order++ : -1;
    // Load the other version first, then let it develop over the old one.
    const pre = new Image();
    pre.src = next;
    pre.decode().catch(() => {}).then(() => { if (el.dataset.want === next) develop(el, box, p, next, k); });
  });

  if (viewer.open) showInViewer(viewerIndex, "develop");
  else if (shareToSave && deck[current]) blob(src(deck[current], "large"));
  buildZips();
  layoutRows();
  if (anchor) {
    const shift = anchor.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 1) scrollBy({ top: shift, behavior: "instant" });
  }
  requestAnimationFrame(centreEnds);
}

// The new version fades in over the old one, one photo after another across the screen.
function develop(el, box, p, next, k) {
  if (k < 0 || !moving()) { el.src = next; placeholder(box, p); return; }
  const delay = Math.min(k, 8) * 40;
  box.style.backgroundImage = `url("${el.currentSrc || el.getAttribute("src")}")`;
  box.style.backgroundSize = "cover";
  box.style.backgroundPosition = "center";
  el.style.transition = "none";
  el.style.opacity = "0";
  el.src = next;
  void el.offsetWidth;
  el.style.transition = "";
  el.style.transitionDelay = `${delay}ms`;
  el.style.opacity = "";
  setTimeout(() => {
    el.style.transitionDelay = "";
    if (el.dataset.want === next) placeholder(box, p);
  }, 750 + delay);
}

function img(p, size, eager) {
  const el = document.createElement("img");
  el.alt = t("alt", number(p));
  el.decoding = "async";
  if (eager) el.fetchPriority = "high"; else el.loading = "lazy";
  el.dataset.id = p.id;
  el.dataset.size = size;
  el.addEventListener("load", () => el.classList.add("loaded"));
  el.src = src(p, size);
  return el;
}

/* ---------- Carousel of every photo ---------- */

const carousel = $("carousel");
let slides = [];
let current = 0;

function buildCarousel() {
  slides = deck.map((p, i) => {
    const card = document.createElement("div");
    card.className = "slide";
    card.dataset.r = "";
    card.style.setProperty("--r", ratio(p));
    placeholder(card, p);

    const open = document.createElement("button");
    open.className = "slide-open";
    open.type = "button";
    const picture = img(p, "large", i < 2);
    open.append(picture);
    open.addEventListener("click", () => {
      if (i === current) openViewer(deck, i, picture);
      else goTo(i); // a tap on a peeking photo brings it to the centre first
    });

    const dl = document.createElement("button");
    dl.className = "card-dl";
    dl.type = "button";
    dl.innerHTML = `${ICON_DOWNLOAD}<span></span>`;
    dl.addEventListener("click", () => downloadPhoto(p));

    card.append(open, dl);
    carousel.append(card);
    return card;
  });

  carousel.addEventListener("scroll", () => {
    cancelAnimationFrame(carousel._raf);
    carousel._raf = requestAnimationFrame(markCurrent);
  }, { passive: true });

  $("prev").addEventListener("click", () => goTo(current - 1));
  $("next").addEventListener("click", () => goTo(current + 1));
  carousel.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { goTo(current + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { goTo(current - 1); e.preventDefault(); }
  });
  document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => {
    const from = b.dataset.play === "start" ? 0 : current;
    openViewer(deck, from, slides[from] && slides[from].querySelector("img"));
    play();
  }));
  addEventListener("resize", centreEnds);
  centreEnds();
}

// Pad the strip so the first and last photos can sit in the centre.
// Measure the section, not the strip: the strip's own width includes the old padding.
function centreEnds() {
  if (!slides.length) return;
  const w = carousel.parentElement.clientWidth;
  carousel.style.paddingLeft = `${Math.max(16, (w - slides[0].offsetWidth) / 2)}px`;
  carousel.style.paddingRight = `${Math.max(16, (w - slides[slides.length - 1].offsetWidth) / 2)}px`;
  goTo(current, true);
}

function markCurrent() {
  if (!slides.length) return;
  const mid = carousel.scrollLeft + carousel.clientWidth / 2;
  let best = 0, dist = Infinity;
  slides.forEach((s, i) => {
    const d = Math.abs(s.offsetLeft - carousel.offsetLeft + s.offsetWidth / 2 - mid);
    if (d < dist) { dist = d; best = i; }
  });
  current = best;
  slides.forEach((s, i) => s.classList.toggle("current", i === best));
  $("carousel-count").textContent = t("count", best + 1, slides.length);
  $("progress").style.width = `${((best + 1) / slides.length) * 100}%`;
  $("prev").disabled = best === 0;
  $("next").disabled = best === slides.length - 1;
  if (shareToSave) blob(src(deck[best], "large")); // ready for an instant "Save Image"
}

function goTo(i, instant) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  const s = slides[i];
  carousel.scrollTo({
    left: s.offsetLeft - carousel.offsetLeft + s.offsetWidth / 2 - carousel.clientWidth / 2,
    behavior: instant ? "instant" : "smooth",
  });
}

/* ---------- Gallery grid ---------- */

function buildGallery() {
  const main = $("gallery");
  CHAPTERS.forEach((c) => {
    const list = photos.filter((p) => p.chapter === c.key);
    if (!list.length) return;
    const sec = document.createElement("section");
    sec.className = "chapter";
    sec.id = c.key;
    sec.innerHTML = `<div class="chapter-head" data-chapter="${c.key}" data-count="${list.length}"><span class="num">${c.number}</span><h2></h2><span class="n"></span></div>`;
    const rows = document.createElement("div");
    rows.className = "rows";
    list.forEach((p) => {
      const b = document.createElement("button");
      b.className = "tile";
      b.type = "button";
      b.dataset.r = "";
      b.dataset.id = p.id;
      b.style.setProperty("--r", ratio(p));
      placeholder(b, p);
      const picture = img(p, "thumb");
      b.append(picture);
      b.addEventListener("click", () => openViewer(photos, photos.indexOf(p), picture));
      rows.append(b);
    });
    sec.append(rows);
    main.append(sec);
  });
  let lastWidth = 0;
  addEventListener("resize", () => {
    if (main.clientWidth !== lastWidth) { lastWidth = main.clientWidth; layoutRows(); }
  });
}

// Group tiles into rows near the target height so every row runs edge to edge.
// A short final row (under 70% full) keeps the target height instead of stretching.
function layoutRows() {
  document.querySelectorAll(".rows").forEach((box) => {
    const tiles = [...box.querySelectorAll(".tile")];
    const style = getComputedStyle(box);
    const gap = parseFloat(style.getPropertyValue("--gap-now")) || 0;
    const target = parseFloat(style.getPropertyValue("--row")) || 260;
    const width = box.clientWidth;
    const sumR = (group) => group.reduce((s, tile) => s + tile._r, 0);
    const heightFor = (group) => (width - gap * (group.length - 1)) / sumR(group);

    tiles.forEach((tile) => { tile._r = parseFloat(tile.style.getPropertyValue("--r")); });
    const rows = [];
    let group = [];
    tiles.forEach((tile) => {
      group.push(tile);
      const h = heightFor(group);
      if (h <= target) {
        const without = group.length > 1 ? heightFor(group.slice(0, -1)) : Infinity;
        if (Math.abs(without - target) < Math.abs(h - target)) {
          rows.push(group.slice(0, -1));
          group = [tile];
        } else {
          rows.push(group);
          group = [];
        }
      }
    });
    if (group.length) rows.push(group);

    box.replaceChildren(...rows.map((g, i) => {
      const row = document.createElement("div");
      const short = i === rows.length - 1 && sumR(g) * target + gap * (g.length - 1) < width * 0.7;
      row.className = short ? "row last" : "row";
      row.style.height = `${short ? target : heightFor(g)}px`;
      g.forEach((tile) => { tile.style.width = short ? `${tile._r * target}px` : ""; });
      row.append(...g);
      return row;
    }));
  });
}

/* ---------- Download all ---------- */

// The main button offers the version on screen; the other three are listed beside it.
// On phones the links open in a new tab, which is what makes Safari offer the download.
function buildZips() {
  const main = version();
  if (!zipInfo || !zipInfo[main] || !photos.length) return;
  const newTab = touch ? ' target="_blank" rel="noopener"' : "";
  $("zip-main").href = ZIP_BASE + zipInfo[main].file;
  if (touch) { $("zip-main").target = "_blank"; $("zip-main").rel = "noopener"; }
  $("zip-main-img").src = src(byId[PREVIEW_ID] || photos[0], "thumb", main);
  $("download-lede").textContent = t("downloadLede", photos.length);
  $("zip-main-meta").textContent = t("zipMainMeta", t(ZIP_LABELS[main]), zipInfo[main].mb);
  $("zip-list").innerHTML = Object.entries(ZIP_LABELS).filter(([key]) => key !== main && zipInfo[key]).map(([key, label]) => `
    <a class="zip-link" href="${ZIP_BASE}${zipInfo[key].file}"${newTab}>
      ${ICON_DOWNLOAD}<span class="zip-link-name">${t(label)}</span><span class="zip-link-size">${zipInfo[key].mb} MB</span>
    </a>`).join("");
  $("download-all").hidden = false;
}

/* ---------- Viewer and slideshow ---------- */

const viewer = $("viewer");
const stage = $("stage");
const blobs = new Map(); // url -> Promise<Blob>, so "Save Image" on iPhone can open straight away
let viewerList = [];
let viewerIndex = 0;
let showSeq = 0;
let playing = null;
let wake = null;
let opened = Promise.resolve(); // settles when the opening zoom has finished
let closing = false;

function openViewer(list, i, fromImg) {
  if (viewer.open) return;
  viewerList = list;
  stage.replaceChildren(); // don't flash the last photo while the new one loads
  document.documentElement.style.overflow = "hidden";
  const zoom = moving() && fromImg && fromImg.complete && fromImg.naturalWidth > 0 && onScreen(fromImg);
  viewer.classList.toggle("opening", Boolean(zoom));
  if (typeof viewer.showModal === "function") viewer.showModal();
  else viewer.setAttribute("open", ""); // very old browsers without <dialog>
  history.pushState({ viewer: true }, ""); // the phone's Back gesture closes the photo instead of leaving
  if (fromImg && fromImg.complete && fromImg.naturalWidth > 0) opened = growFrom(fromImg, zoom);
  else { opened = Promise.resolve(); showWash(list[i]); }
  showInViewer(i);
  if (!touch) $("close").focus();
}

// Show the copy that is already on screen at once, growing out of its spot like the
// phone's own Photos app; the sharp full-size copy then fades in over it.
function growFrom(fromImg, zoom) {
  const first = new Image();
  first.alt = "";
  first.className = "shown";
  first.style.transition = "none";
  first.style.opacity = "0";
  first.src = fromImg.currentSrc || fromImg.src;
  stage.append(first);
  return first.decode().catch(() => {}).then(() => {
    first.style.opacity = "";
    viewer.classList.remove("opening");
    if (!zoom || !first.animate) return;
    const a = fromImg.getBoundingClientRect();
    const b = first.getBoundingClientRect();
    if (!b.width) return;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    viewer.animate([{ backgroundColor: "rgba(250, 250, 248, 0)" }, { backgroundColor: "rgba(250, 250, 248, 1)" }], { duration: 320, easing: "ease-out" });
    viewer.querySelectorAll(".viewer-top, .viewer-controls, .viewer-bottom")
      .forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 160, fill: "backwards" }));
    return first.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width})` }, { transform: "none" }],
      { duration: 450, easing: EASE },
    ).finished.catch(() => {});
  });
}

// Photo not downloaded yet (a quick tap on a slow connection): show its colour wash
// at the right size until the photo itself fades in over it.
function showWash(p) {
  const r = stage.getBoundingClientRect();
  const fit = Math.min((r.width - 32) / ratio(p), r.height - 12);
  if (!(fit > 0)) return;
  const wash = document.createElement("div");
  wash.className = "wash shown";
  wash.style.width = `${fit * ratio(p)}px`;
  wash.style.height = `${fit}px`;
  placeholder(wash, p);
  stage.append(wash);
}

function closeViewer() {
  if (!viewer.open || closing) return;
  pause();
  if (viewerList === deck && slides.length) goTo(viewerIndex, true); // land the strip on the last photo seen
  const done = () => {
    closing = false;
    if (typeof viewer.close === "function") viewer.close();
    else { viewer.removeAttribute("open"); onViewerClosed(); }
  };
  if (!moving() || !viewer.animate) return done();
  closing = true;
  viewer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease" }).finished.then(done, done);
}

function onViewerClosed() {
  pause();
  viewer.classList.remove("opening");
  document.documentElement.style.overflow = "";
  if (history.state && history.state.viewer) history.back();
}

// Each photo is a new layer that fades in over the last one.
// how: "next"/"prev" slide in slightly from that side, "auto" is the slideshow
// (slower crossfade with a gentle zoom), "develop" is a slow fade between versions.
function showInViewer(i, how) {
  if (!viewerList.length) return;
  viewerIndex = (i + viewerList.length) % viewerList.length;
  const p = viewerList[viewerIndex];
  const url = src(p, "large");
  const seq = ++showSeq;

  const incoming = new Image();
  incoming.alt = t("alt", number(p));
  incoming.draggable = false;
  if (how === "next") incoming.classList.add("from-right");
  if (how === "prev") incoming.classList.add("from-left");
  if (how === "auto") incoming.classList.add("drift");
  if (how === "develop") incoming.classList.add("slow");
  incoming.src = url;

  const reveal = () => {
    if (seq !== showSeq) return; // a newer photo was asked for meanwhile
    stage.querySelectorAll(":scope > :not(.leaving)").forEach((old) => {
      old.classList.add("leaving");
      if (how === "next") old.classList.add("to-left");
      if (how === "prev") old.classList.add("to-right");
      if (how === "auto" || how === "develop") old.classList.add("slow");
      setTimeout(() => old.remove(), 1200);
    });
    stage.append(incoming);
    requestAnimationFrame(() => requestAnimationFrame(() => incoming.classList.add("shown")));
  };
  Promise.all([incoming.decode().catch(() => {}), opened]).then(reveal);

  $("viewer-count").textContent = t("count", viewerIndex + 1, viewerList.length);
  if (shareToSave) blob(url);
  // Warm up the neighbours so the next photo appears instantly.
  [1, -1].forEach((d) => { new Image().src = src(viewerList[(viewerIndex + d + viewerList.length) % viewerList.length], "large"); });
}

function step(d) { pause(); showInViewer(viewerIndex + d, d > 0 ? "next" : "prev"); }

function play() {
  if (playing) return;
  playing = setInterval(() => { if (!document.hidden) showInViewer(viewerIndex + 1, "auto"); }, SLIDESHOW_MS);
  keepAwake();
  updatePlay();
}

function pause() {
  clearInterval(playing);
  playing = null;
  if (wake) { wake.release().catch(() => {}); wake = null; }
  updatePlay();
}

// Stop the phone dimming and locking halfway through a slideshow.
function keepAwake() {
  if (!playing || wake || document.hidden || !navigator.wakeLock) return;
  navigator.wakeLock.request("screen").then((lock) => {
    wake = lock;
    lock.addEventListener("release", () => { if (wake === lock) wake = null; });
  }).catch(() => {});
}
document.addEventListener("visibilitychange", keepAwake);

function updatePlay() {
  const b = $("play");
  b.setAttribute("aria-pressed", Boolean(playing));
  b.classList.toggle("is-playing", Boolean(playing));
  viewer.classList.toggle("playing", Boolean(playing));
  $("play-label").textContent = t(playing ? "pause" : "slideshow");
}

function blob(url) {
  if (!blobs.has(url)) {
    const pending = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); });
    pending.catch(() => blobs.delete(url)); // try again next time instead of remembering a failure
    blobs.set(url, pending);
    while (blobs.size > 6) blobs.delete(blobs.keys().next().value);
  }
  return blobs.get(url);
}

let toastTimer;
function showToast(text, stay) {
  const el = $("toast");
  // An open viewer sits above the page, so the tip has to live inside it to be seen.
  const host = viewer.open ? viewer : document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  if (!stay) toastTimer = setTimeout(hideToast, 6000);
}
function hideToast() { $("toast").classList.remove("show"); }

async function downloadPhoto(p) {
  pause();
  const url = src(p, "large");
  const n = String(number(p)).padStart(2, "0");
  const name = `Niki-and-Balazs-${n}${state.tone === "bw" ? "-bw" : ""}${state.framed ? "-framed" : ""}.jpg`;

  if (shareToSave) {
    try {
      const file = new File([await blob(url)], name, { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        showToast(t("saveTip"), true); // stays until the share menu closes
        try { await navigator.share({ files: [file] }); } finally { hideToast(); }
        return;
      }
    } catch (err) {
      if (err.name === "AbortError") return; // they closed the share menu
    }
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  if (touch) showToast(t("savedTip")); // phones give no sign of a finished download
}

function setupViewer() {
  $("close").addEventListener("click", closeViewer);
  viewer.addEventListener("cancel", (e) => { e.preventDefault(); closeViewer(); }); // Escape key
  viewer.addEventListener("close", onViewerClosed);
  addEventListener("popstate", () => { if (viewer.open) closeViewer(); });
  $("viewer-prev").addEventListener("click", () => step(-1));
  $("viewer-next").addEventListener("click", () => step(1));
  $("play").addEventListener("click", () => (playing ? pause() : play()));
  $("download").addEventListener("click", () => downloadPhoto(viewerList[viewerIndex]));
  viewer.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "Escape" && typeof viewer.showModal !== "function") closeViewer();
  });

  // One-finger horizontal swipe changes photo; pinch-zoom is left to the browser.
  let start = null;
  stage.addEventListener("touchstart", (e) => {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!start || (window.visualViewport && visualViewport.scale > 1.05)) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
}

// The switch bar steps aside once the goodbye at the bottom comes into view.
function watchEnding() {
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver(([entry]) => document.body.classList.toggle("at-end", entry.isIntersecting))
    .observe(document.querySelector(".outro"));
}

/* ---------- Start ---------- */

document.addEventListener("touchstart", () => {}, { passive: true }); // lets iPhones show the pressed look on buttons
renderLanguages();
setupViewer();
watchEnding();
applyLanguage(); // text appears in the chosen language straight away

fetch("photos.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    photos = data.photos;
    byId = Object.fromEntries(photos.map((p) => [p.id, p]));
    deck = byId[OPENER_ID] ? [byId[OPENER_ID], ...photos.filter((p) => p.id !== OPENER_ID)] : photos.slice();
    zipInfo = data.zips || null;
    document.body.classList.toggle("is-framed", state.framed);
    buildGallery();
    buildCarousel();
    applyLanguage();
    applyVersion();
  })
  .catch((err) => {
    console.error(err);
    loadFailed = true;
    document.body.classList.add("load-failed");
    applyLanguage();
  });
