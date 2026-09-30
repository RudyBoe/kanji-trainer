"use strict";

// Kanji details panel: meanings, readings, stroke order, tracing, your record,
// all words with this kanji, practice. Uses the globals from app.js/game.js.

let kanjiData = null;
const loadKanji = () => (kanjiData ||= fetch("kanji.json?v=8").then((r) => r.json()));

let detailK = null;
let animTimer = null;

async function openDetails(k) {
  // Opening details for a kanji of the unrevealed word gives the answer away.
  if (cur && !revealed && !peeked && kanjiSegs(cur).some((x) => x.k === k)) {
    peeked = true;
    toast("Peeked: this word won't score");
  }
  detailK = k;
  $("det-body").innerHTML = `<p class="loading">Loading…</p>`;
  if (!$("details").open) $("details").showModal();
  const data = await loadKanji();
  if (detailK !== k) return;
  renderDetails(k, data[k]);
}

const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Words with kanji k you can reach (deck + links), grouped by base reading.
function wordsByReading(k) {
  const ids = new Set([...(index.core.k.get(k) || []), ...(index.bridge.k.get(k) || [])]);
  const groups = new Map();
  for (const id of ids) {
    const w = byId.get(id);
    for (const x of kanjiSegs(w)) {
      if (x.k !== k) continue;
      if (!groups.has(x.b)) groups.set(x.b, []);
      if (!groups.get(x.b).includes(w)) groups.get(x.b).push(w);
    }
  }
  return groups;
}

function wordStatus(k, w) {
  if (isMissed(w.id)) return ["✗", "missed"];
  if (state.kstat[k]?.w.includes(w.id)) return ["✓", "right"];
  if (state.seen[w.id]) return ["•", "seen"];
  return ["○", "new"];
}

function renderDetails(k, d) {
  const groups = wordsByReading(k);
  // Readings you've met: bases of words with this kanji that you've seen.
  const met = new Set();
  for (const [b, ws] of groups) if (ws.some((w) => state.seen[w.id])) met.add(b);
  const chip = (label, bases) =>
    `<span class="chip${bases.some((b) => met.has(b)) ? " met" : ""}">${label}</span>`;
  const on = d.on.map((r) => chip(r, [kataToHira(r)])).join("");
  const kun = d.kun.map((r) => {
    const [stem, oku = ""] = r.replace(/-/g, "").split(".");
    return chip(oku ? `${stem}<small>${oku}</small>` : stem, [stem, stem + oku]);
  }).join("");

  const st = state.kstat[k] || { w: [], m: 0 };
  const m = mastery(k);
  const record = `Right in ${st.w.length} word${st.w.length === 1 ? "" : "s"} · missed ${st.m}×` +
    (state.game ? ` · <span class="badge m${m}">${m ? LEVEL_NAME[m] : "not collected"}</span>` : "");

  const list = [...groups].sort((a, b) => b[1].length - a[1].length).map(([b, ws]) =>
    `<h3 lang="ja">${b}${met.has(b) ? "" : ' <small>not met yet</small>'}</h3><ul class="words" lang="ja">` +
    ws.map((w) => {
      const [icon, cls] = wordStatus(k, w);
      const link = inDeck(w) ? "" : ` <span class="tag">N${w.lv} link</span>`;
      return `<li><button type="button" data-id="${w.id}"><span class="st ${cls}">${icon}</span>` +
        `<b>${w.w}</b> <span class="r">${w.r}</span>${link}<span class="mn" lang="en">${esc(w.m[0])}</span></button></li>`;
    }).join("") + `</ul>`).join("");

  $("det-body").innerHTML = `
    <div class="det-top">
      <div class="det-k" lang="ja">${k}</div>
      <div>
        <p class="det-meta">N${d.lv} · ${d.n} strokes</p>
        <p class="det-m">${d.m.map(esc).join(", ")}</p>
      </div>
    </div>
    <div class="readings" lang="ja">
      ${on ? `<p><span class="lab" lang="en">on</span>${on}</p>` : ""}
      ${kun ? `<p><span class="lab" lang="en">kun</span>${kun}</p>` : ""}
    </div>
    <div class="strokes">
      <div class="pad">
        <svg id="stroke-svg" viewBox="0 0 109 109" aria-label="Stroke order">
          <g class="ghost">${d.st.map((p) => `<path d="${p}"/>`).join("")}</g>
          <g class="ink">${d.st.map((p) => `<path d="${p}"/>`).join("")}</g>
        </svg>
        <canvas id="trace" hidden></canvas>
      </div>
      <div class="row">
        <button type="button" id="play">▶ Play strokes</button>
        <button type="button" id="trace-btn" aria-pressed="false">✎ Trace</button>
        <button type="button" id="trace-clear" hidden>Clear</button>
      </div>
    </div>
    <p class="record">${record}</p>
    <div class="row">
      <button type="button" id="practice">Practice ${k}</button>
      <button type="button" id="anki-all">+ Anki (all)</button>
    </div>
    ${list}`;

  $("play").onclick = playStrokes;
  $("trace-btn").onclick = toggleTrace;
  $("trace-clear").onclick = clearTrace;
  $("practice").onclick = () => startPractice(k, groups);
  $("anki-all").onclick = () => {
    const ids = [...new Set([...groups.values()].flat().map((w) => w.id))];
    const added = ids.filter((id) => !state.exportList.includes(id));
    state.exportList.push(...added);
    save();
    toast(added.length ? `Added ${added.length} words to Anki list (${state.exportList.length})` : "All already on the Anki list");
  };
  playStrokes();
}

// ---------------------------------------------------------------- stroke order

function playStrokes() {
  clearTimeout(animTimer);
  const paths = [...document.querySelectorAll("#stroke-svg .ink path")];
  for (const p of paths) {
    const len = p.getTotalLength();
    p.style.transition = "none";
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
  }
  let i = 0;
  const step = () => {
    const p = paths[i++];
    if (!p) return;
    const len = p.getTotalLength();
    const ms = Math.max(250, len * 7);
    p.getBoundingClientRect(); // restart the transition
    p.style.transition = `stroke-dashoffset ${ms}ms linear`;
    p.style.strokeDashoffset = 0;
    animTimer = setTimeout(step, ms + 120);
  };
  animTimer = setTimeout(step, 200);
}

// ---------------------------------------------------------------- tracing

function toggleTrace() {
  const on = $("trace-btn").getAttribute("aria-pressed") !== "true";
  $("trace-btn").setAttribute("aria-pressed", on);
  $("trace").hidden = $("trace-clear").hidden = !on;
  $("stroke-svg").classList.toggle("tracing", on);
  if (on) {
    clearTimeout(animTimer);
    for (const p of document.querySelectorAll("#stroke-svg .ink path")) {
      p.style.transition = "none";
      p.style.strokeDashoffset = p.getTotalLength();
    }
    setupCanvas();
  }
}

function setupCanvas() {
  const c = $("trace");
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = r.width * dpr;
  c.height = r.height * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, r.width / 28);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg");
  let drawing = false;
  c.onpointerdown = (e) => {
    drawing = true;
    c.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  };
  c.onpointermove = (e) => {
    if (!drawing) return;
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  };
  c.onpointerup = c.onpointercancel = () => { drawing = false; };
}

function clearTrace() {
  const c = $("trace");
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

// ---------------------------------------------------------------- word list & practice

$("det-body").addEventListener("click", (e) => {
  const id = e.target.closest("button[data-id]")?.dataset.id;
  if (!id) return;
  closeDetails();
  practice = null;
  show(id, `<b>${detailK}</b> · from details`);
});

// All words with this kanji: missed first, then new, then the rest.
function startPractice(k, groups) {
  const ws = [...new Set([...groups.values()].flat())];
  const rank = (w) => (isMissed(w.id) ? 0 : !state.seen[w.id] ? 1 : 2);
  ws.sort((a, b) => rank(a) - rank(b));
  practice = { k, ids: ws.map((w) => w.id), i: 0 };
  closeDetails();
  practiceNext();
}

function practiceNext() {
  if (practice.i >= practice.ids.length) {
    const k = practice.k;
    practice = null;
    show(fallbackId(cur.id), `<b>${k}</b> · practice done, random word`, `Done practicing ${k}`);
    return;
  }
  practice.i++;
  show(practice.ids[practice.i - 1]);
}

function closeDetails() {
  clearTimeout(animTimer);
  if ($("details").open) $("details").close();
  if ($("collection").open) $("collection").close();
}

$("details").addEventListener("close", () => clearTimeout(animTimer));
