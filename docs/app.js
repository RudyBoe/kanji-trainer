"use strict";

// Word format (see build/build.py):
//   {id, w, r, lv, m: [meanings], s: [[text, reading, base, "on"|"kun"] | [kana, kana]]}
// Core deck: N5–N3. N2 words are bridges, shown only when a tapped kanji
// has no other core word.

const $ = (id) => document.getElementById(id);
const STORE = "kanji-trainer-v1";
const RECENT = 12; // avoid repeating the last N words when there's a choice

let words, byId;
const index = { core: { kr: new Map(), k: new Map() }, bridge: { kr: new Map(), k: new Map() } };

let state = { missed: [], seen: {}, showReadings: false };
let cur = null;        // current word
let revealed = false;
let markedMissed = false;
const history = [];    // ids of previous words, for Back

// ---------------------------------------------------------------- storage

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s) state = { ...state, ...s };
  } catch {}
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
}
const isMissed = (id) => state.missed.includes(id);

// ---------------------------------------------------------------- index

// Kanji segments with the kanji to navigate by (々 repeats the previous kanji).
function kanjiSegs(w) {
  const out = [];
  let prev = null;
  for (const s of w.s) {
    if (s.length < 3) continue;
    const k = s[0] === "々" ? prev : s[0];
    out.push({ seg: s, k, b: s[2] });
    prev = k;
  }
  return out;
}

function add(map, key, id) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(id);
}

function buildIndex() {
  byId = new Map(words.map((w) => [w.id, w]));
  for (const w of words) {
    const ix = w.lv >= 3 ? index.core : index.bridge;
    for (const { seg, k, b } of kanjiSegs(w)) {
      if (seg[0] === "々") continue;
      add(ix.kr, k + "|" + b, w.id);
      add(ix.k, k, w.id);
    }
  }
}

const others = (set, id) => (set ? [...set].filter((x) => x !== id) : []);

// ---------------------------------------------------------------- choosing

// Prefer missed words, then unseen ones, then the least recently seen.
function pick(ids) {
  const missed = ids.filter(isMissed);
  if (missed.length) return rand(missed);
  const unseen = ids.filter((id) => !state.seen[id]);
  if (unseen.length) return rand(unseen);
  const oldest = [...ids].sort((a, b) => state.seen[a] - state.seen[b]);
  return rand(oldest.slice(0, 3));
}
const rand = (a) => a[Math.floor(Math.random() * a.length)];

// Where does tapping kanji k (read b in the current word) lead? With `fresh`,
// words from the recent history are skipped, so two-word kanji don't loop.
function candidates(k, b, id, fresh = false) {
  const recent = new Set(fresh ? history.slice(-RECENT) : []);
  const tiers = [
    [index.core.kr.get(k + "|" + b), "same reading"],
    [index.core.k.get(k), "other reading"],
    [index.bridge.kr.get(k + "|" + b), "N2 bridge"],
    [index.bridge.k.get(k), "N2 bridge, other reading"],
  ];
  for (const [set, tier] of tiers) {
    const ids = others(set, id).filter((x) => !recent.has(x));
    if (ids.length) return [ids, tier];
  }
  return [[], null];
}

function fallbackId(excludeId) {
  const recent = new Set([...history.slice(-RECENT), excludeId]);
  const missed = state.missed.filter((id) => !recent.has(id) && byId.has(id));
  if (missed.length) return rand(missed);
  const core = words.filter((w) => w.lv >= 3 && !recent.has(w.id)).map((w) => w.id);
  const unseen = core.filter((id) => !state.seen[id]);
  return rand(unseen.length ? unseen : core);
}

// ---------------------------------------------------------------- render

function show(id, via) {
  leave();
  if (cur) history.push(cur.id);
  cur = byId.get(id);
  revealed = false;
  markedMissed = isMissed(id);
  state.seen[id] = Date.now();
  save();
  render(via);
}

// Leaving a revealed word updates the missed pile: marked → on, not marked → off.
function leave() {
  if (!cur || !revealed) return;
  const i = state.missed.indexOf(cur.id);
  if (markedMissed && i < 0) state.missed.push(cur.id);
  if (!markedMissed && i >= 0) state.missed.splice(i, 1);
  save();
}

function render(via) {
  const card = $("card");
  card.classList.toggle("revealed", revealed);
  card.classList.toggle("show-readings", state.showReadings);
  $("via").innerHTML = via || "";

  const box = $("word");
  box.textContent = "";
  let prevK = null;
  for (const s of cur.s) {
    const el = document.createElement("div");
    el.className = "seg";
    if (s.length < 3) {
      el.innerHTML = `<span class="note"></span><span class="kana">${s[0]}</span><span class="count"></span>`;
    } else {
      const k = s[0] === "々" ? prevK : s[0];
      prevK = k;
      const [ids, tier] = candidates(k, s[2], cur.id);
      const base = s[1] !== s[2] ? `<small>${s[2]}</small>` : "";
      const count = tier === "same reading" ? `+${ids.length}` : tier ? `~${ids.length}` : "–";
      el.innerHTML =
        `<span class="note">${base}${s[1]}</span>` +
        `<button class="k" aria-label="Next word with ${k}">${s[0]}</button>` +
        `<span class="count${tier ? "" : " dead"}">${count}</span>`;
      el.querySelector("button").onclick = (e) => { e.stopPropagation(); tap(k, s[2]); };
    }
    box.append(el);
  }

  $("reading").textContent = cur.r;
  $("meanings").innerHTML = cur.m.map((m) => `<li>${esc(m)}</li>`).join("") +
    (cur.lv === 2 ? `<li><span class="tag">N2 bridge</span></li>` : "");
  $("answer").hidden = !revealed;
  $("reveal").hidden = revealed;
  $("after").hidden = !revealed;
  $("mark").setAttribute("aria-pressed", markedMissed);
  $("back").disabled = !history.length;
  $("missed-n").textContent = state.missed.length;
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
}

// ---------------------------------------------------------------- actions

function tap(k, b) {
  const [ids, tier] = candidates(k, b, cur.id, true);
  if (!ids.length) {
    const any = candidates(k, b, cur.id)[0].length;
    toast(any ? `You just saw every word with ${k}` : `No other word with ${k}`);
    show(fallbackId(cur.id), `<b>${k}</b> · ${any ? "all seen just now" : "dead end"}, random word`);
    return;
  }
  show(pick(ids), `<b>${k}</b> ${b} · ${tier}`);
}

function reveal() {
  if (revealed) return;
  revealed = true;
  render($("via").innerHTML);
}

$("reveal").onclick = reveal;
$("card").onclick = reveal;
$("mark").onclick = () => {
  markedMissed = !markedMissed;
  $("mark").setAttribute("aria-pressed", markedMissed);
};
$("back").onclick = () => {
  if (!history.length) return;
  leave();
  cur = byId.get(history.pop());
  revealed = false;
  markedMissed = isMissed(cur.id);
  render("");
};
$("random").onclick = () => show(fallbackId(cur.id), "random word");
$("missed").onclick = () => {
  const ids = state.missed.filter((id) => id !== cur.id);
  if (!ids.length) {
    // Include the current word's pending mark in the message.
    toast(markedMissed && revealed ? "This is your only missed word" : "No missed words");
    return;
  }
  show(rand(ids), "from your missed pile");
};

$("menu-btn").onclick = () => {
  const seen = Object.keys(state.seen).length;
  const core = words.filter((w) => w.lv >= 3).length;
  $("stats").textContent = `Seen ${seen} of ${core} words · ${state.missed.length} missed`;
  $("opt-readings").checked = state.showReadings;
  $("menu").showModal();
};
$("opt-readings").onchange = (e) => {
  state.showReadings = e.target.checked;
  save();
  render($("via").innerHTML);
};
$("reset").onclick = () => {
  if (!confirm("Forget all seen and missed words?")) return;
  state.missed = [];
  state.seen = {};
  markedMissed = false;
  save();
  $("menu").close();
  render($("via").innerHTML);
};

// ---------------------------------------------------------------- start

load();
fetch("words.json")
  .then((r) => r.json())
  .then((data) => {
    words = data;
    buildIndex();
    show(fallbackId(null), "");
  });
