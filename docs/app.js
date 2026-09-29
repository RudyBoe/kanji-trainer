"use strict";

// Word format (see build/build.py):
//   {id, w, r, lv, m: [meanings],
//    s: [[text, reading, base, "on"|"kun", kanjiLevel] | [kana, kana]]}
// Deck: words at the chosen level and easier. Words one level harder are
// bridges, shown only when a tapped kanji has no other deck word.
// Kanji levels: 5..1 (N5..N1), from 5-level JLPT kanji lists.

const $ = (id) => document.getElementById(id);
const STORE = "kanji-trainer-v1";
const RECENT = 12; // avoid repeating the last N words when there's a choice

let words, byId;
const index = { core: { kr: new Map(), k: new Map() }, bridge: { kr: new Map(), k: new Map() } };

let state = {
  missed: [], seen: {}, showReadings: false, current: null, history: [],
  wordLevel: 3,      // deck = N5..N<wordLevel>, bridges = N<wordLevel-1>
  kanjiLevel: 1,     // kanji harder than this are...
  hardKanji: "hint", // ..."hint": shown with their reading, "hide": word left out
  exportList: [],
  game: true,        // points game
  days: {},          // "YYYY-MM-DD" -> points scored that day
  scored: {},        // word id -> day it last scored (a word scores once a day)
  rightKanji: {},    // kanji -> level, for every kanji you've gotten right
};
let cur = null;        // current word
let revealed = false;
let markedMissed = false;
let history = [];      // ids of previous words, for Back

// ---------------------------------------------------------------- storage

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s) state = { ...state, ...s };
  } catch {}
}
function save() {
  if (cur) state.current = cur.id;
  state.history = history.slice(-50);
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

const isHard = (seg) => seg[4] < state.kanjiLevel;
const tooHard = (w) => state.hardKanji === "hide" && w.s.some((s) => s.length > 2 && isHard(s));
const inDeck = (w) => w.lv >= state.wordLevel && !tooHard(w);
const isBridge = (w) => w.lv === state.wordLevel - 1 && !tooHard(w);

function buildIndex() {
  byId = new Map(words.map((w) => [w.id, w]));
  for (const ix of [index.core, index.bridge]) { ix.kr.clear(); ix.k.clear(); }
  for (const w of words) {
    const ix = inDeck(w) ? index.core : isBridge(w) ? index.bridge : null;
    if (!ix) continue;
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
    [index.bridge.kr.get(k + "|" + b), `N${state.wordLevel - 1} link`],
    [index.bridge.k.get(k), `N${state.wordLevel - 1} link, other reading`],
  ];
  for (const [set, tier] of tiers) {
    const ids = others(set, id).filter((x) => !recent.has(x));
    if (ids.length) return [ids, tier];
  }
  return [[], null];
}

// A fresh start after a dead end: avoid words sharing a kanji with the last
// few words, and take a missed word only some of the time, so a small missed
// pile doesn't restart every chain on the same kanji.
const MISSED_SHARE = 0.4;
function fallbackId(excludeId) {
  const recentIds = [...history.slice(-RECENT), excludeId].filter((id) => byId.has(id));
  const recent = new Set(recentIds);
  const recentK = new Set(recentIds.flatMap((id) => kanjiSegs(byId.get(id)).map((x) => x.k)));
  const deck = words.filter((w) => inDeck(w) && !recent.has(w.id));
  const fresh = deck.filter((w) => !kanjiSegs(w).some((x) => recentK.has(x.k)));
  const pool = (fresh.length ? fresh : deck).map((w) => w.id);
  const missed = pool.filter(isMissed);
  if (missed.length && Math.random() < MISSED_SHARE) return rand(missed);
  const unseen = pool.filter((id) => !state.seen[id]);
  return rand(unseen.length ? unseen : pool);
}

const missedInDeck = () => state.missed.filter((id) => byId.has(id) && inDeck(byId.get(id)));

// ---------------------------------------------------------------- render

function show(id, via, msg) {
  const gain = leave();
  if (cur) history.push(cur.id);
  cur = byId.get(id);
  revealed = false;
  markedMissed = isMissed(id);
  state.seen[id] = Date.now();
  save();
  render(via);
  const parts = [gain ? `+${gain}` : "", msg || ""].filter(Boolean);
  if (parts.length) toast(parts.join(" · "));
}

// Leaving a revealed word updates the missed pile (marked → on, not marked →
// off) and scores it if you got it right. Returns the points gained.
function leave() {
  if (!cur || !revealed) return 0;
  const i = state.missed.indexOf(cur.id);
  if (markedMissed && i < 0) state.missed.push(cur.id);
  if (!markedMissed && i >= 0) state.missed.splice(i, 1);
  const gain = markedMissed ? 0 : score(cur);
  save();
  renderScore();
  return gain;
}

// ---------------------------------------------------------------- points game

// N5 = 1 point ... N1 = 5 points per kanji; half when the reading was shown
// as a hint. A word scores once per day.
const kanjiPoints = (seg) => 6 - seg[4];
const hinted = (seg) => state.showReadings || (state.hardKanji === "hint" && isHard(seg));
const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD, local time

function wordPoints(w) {
  const segs = w.s.filter((s) => s.length > 2 && s[0] !== "々");
  const raw = segs.reduce((sum, s) => sum + kanjiPoints(s) * (hinted(s) ? 0.5 : 1), 0);
  return Math.max(1, Math.round(raw));
}

function score(w) {
  if (!state.game || state.scored[w.id] === today()) return 0;
  const gain = wordPoints(w);
  state.scored[w.id] = today();
  state.days[today()] = (state.days[today()] || 0) + gain;
  for (const s of w.s) if (s.length > 2 && s[0] !== "々" && !hinted(s)) state.rightKanji[s[0]] = s[4];
  return gain;
}

const dayNum = (d) => Math.round(Date.parse(d + "T12:00:00Z") / 864e5);

// Current streak: consecutive days with points, ending today (or yesterday,
// so the streak survives until you've had a chance to play today).
function streaks() {
  const days = Object.keys(state.days).filter((d) => state.days[d] > 0).map(dayNum).sort((a, b) => a - b);
  let longest = 0, run = 0;
  days.forEach((d, i) => {
    run = i && d === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const last = days[days.length - 1], now = dayNum(today());
  const current = last === now || last === now - 1 ? run : 0;
  return { current, longest };
}

const totalPoints = () => Object.values(state.days).reduce((a, b) => a + b, 0);

function renderScore() {
  $("score").hidden = !state.game;
  if (!state.game) return;
  $("streak").textContent = `🔥 ${streaks().current}`;
  $("pts").textContent = `${state.days[today()] || 0} today · ${totalPoints()}`;
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
      const pts = state.game && s[0] !== "々"
        ? `<span class="lvl" title="N${s[4]}">${"●".repeat(kanjiPoints(s))}</span>` : "";
      el.innerHTML =
        `<span class="note${isHard(s) ? " hard" : ""}">${base}${s[1]}</span>` +
        `<button class="k" aria-label="Next word with ${k}">${s[0]}</button>` +
        `<span class="count${tier ? "" : " dead"}">${count}</span>` + pts;
      el.querySelector("button").onclick = (e) => { e.stopPropagation(); tap(k, s[2]); };
    }
    box.append(el);
  }

  $("reading").textContent = cur.r;
  $("meanings").innerHTML = cur.m.map((m) => `<li>${esc(m)}</li>`).join("") +
    (cur.lv < state.wordLevel ? `<li><span class="tag">N${cur.lv} link</span></li>` : "");
  $("answer").hidden = !revealed;
  $("reveal").hidden = revealed;
  $("after").hidden = !revealed;
  $("mark").setAttribute("aria-pressed", markedMissed);
  $("add").setAttribute("aria-pressed", state.exportList.includes(cur.id));
  $("back").disabled = !history.length;
  $("missed-n").textContent = state.missed.length;
  renderScore();
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
    show(fallbackId(cur.id), `<b>${k}</b> · ${any ? "all seen just now" : "dead end"}, random word`,
      any ? `You just saw every word with ${k}` : `No other word with ${k}`);
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
// Marking takes effect at once, so it survives closing the app.
$("mark").onclick = () => {
  markedMissed = !markedMissed;
  const i = state.missed.indexOf(cur.id);
  if (markedMissed && i < 0) state.missed.push(cur.id);
  if (!markedMissed && i >= 0) state.missed.splice(i, 1);
  save();
  $("mark").setAttribute("aria-pressed", markedMissed);
  $("missed-n").textContent = state.missed.length;
  renderScore();
};
$("back").onclick = () => {
  if (!history.length) return;
  const gain = leave();
  if (gain) toast(`+${gain}`);
  cur = byId.get(history.pop());
  revealed = false;
  markedMissed = isMissed(cur.id);
  save();
  render("");
};
$("random").onclick = () => show(fallbackId(cur.id), "random word");
$("add").onclick = () => {
  const list = state.exportList, i = list.indexOf(cur.id);
  if (i < 0) list.push(cur.id); else list.splice(i, 1);
  save();
  $("add").setAttribute("aria-pressed", i < 0);
  toast(i < 0 ? `Added to Anki list (${list.length})` : "Removed from Anki list");
};
$("missed").onclick = () => {
  const ids = missedInDeck().filter((id) => id !== cur.id);
  if (!ids.length) {
    // Include the current word's pending mark in the message.
    toast(markedMissed && revealed ? "This is your only missed word" : "No missed words");
    return;
  }
  show(rand(ids), "from your missed pile");
};

function updateStats() {
  const deck = words.filter(inDeck).length;
  const seen = Object.keys(state.seen).filter((id) => byId.has(id) && inDeck(byId.get(id))).length;
  $("stats").textContent = `Deck: ${deck} words · seen ${seen} · ${missedInDeck().length} missed`;
  $("export-n").textContent = state.exportList.length;
  const { current, longest } = streaks();
  const best = Math.max(0, ...Object.values(state.days));
  const rare = Object.entries(state.rightKanji).sort((a, b) => a[1] - b[1]).slice(0, 12)
    .map(([k, lv]) => k).join("");
  $("game-stats").textContent = `Total ${totalPoints()} · today ${state.days[today()] || 0} · best day ${best} · ` +
    `streak ${current} (longest ${longest})` + (rare ? ` · rarest right: ${rare}` : "");
  $("game-stats").hidden = !state.game;
  $("export").disabled = $("clear-export").disabled = !state.exportList.length;
}

$("menu-btn").onclick = () => {
  $("opt-readings").checked = state.showReadings;
  $("opt-game").checked = state.game;
  $("opt-words").value = state.wordLevel;
  $("opt-kanji").value = state.kanjiLevel;
  $("opt-hard").value = state.hardKanji;
  $("opt-hard").disabled = state.kanjiLevel === 1;
  updateStats();
  $("menu").showModal();
};
$("opt-game").onchange = (e) => {
  state.game = e.target.checked;
  save();
  updateStats();
  render($("via").innerHTML);
};
$("opt-readings").onchange = (e) => {
  state.showReadings = e.target.checked;
  save();
  render($("via").innerHTML);
};
for (const id of ["opt-words", "opt-kanji", "opt-hard"]) {
  $(id).onchange = () => {
    state.wordLevel = +$("opt-words").value;
    state.kanjiLevel = +$("opt-kanji").value;
    state.hardKanji = $("opt-hard").value;
    $("opt-hard").disabled = state.kanjiLevel === 1;
    buildIndex();
    save();
    updateStats();
    if (inDeck(cur)) render($("via").innerHTML);
    else show(fallbackId(cur.id), "new deck");
  };
}
$("reset").onclick = () => {
  if (!confirm("Forget all seen and missed words, points and streaks?")) return;
  state.missed = [];
  state.seen = {};
  state.days = {};
  state.scored = {};
  state.rightKanji = {};
  markedMissed = false;
  save();
  $("menu").close();
  render($("via").innerHTML);
};

// ---------------------------------------------------------------- Anki export

// Tab-separated text for Anki's File → Import (Basic note type: Front, Back, tags).
function ankiText() {
  const q = (f) => `"${f.replace(/"/g, '""')}"`;
  const rows = state.exportList.map((id) => byId.get(id)).filter(Boolean).map((w) => {
    const ruby = w.s.map((s) => (s.length > 2 ? `<ruby>${s[0]}<rt>${s[1]}</rt></ruby>` : s[0])).join("");
    const notes = w.s.filter((s) => s.length > 2 && s[0] !== "々")
      .map((s) => `${s[0]} ${s[1]}${s[1] !== s[2] ? ` (${s[2]})` : ""}`).join(" · ");
    const back = `<div style="font-size:1.6em">${ruby}</div>${w.r}<br><br>` +
      w.m.map(esc).join("; ") + `<br><br><small>${notes}</small>`;
    return [q(w.w), q(back), q(`kanji-trainer N${w.lv}`)].join("\t");
  });
  return ["#separator:tab", "#html:true", "#notetype:Basic", "#deck:Kanji Trainer",
    "#tags column:3", ...rows].join("\n") + "\n";
}

$("export").onclick = async () => {
  const name = `kanji-trainer-anki-${new Date().toISOString().slice(0, 10)}.txt`;
  const file = new File([ankiText()], name, { type: "text/plain" });
  // On phones, the share sheet can hand the file straight to Anki or Files.
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("clear-export").onclick = () => {
  if (!confirm(`Clear the ${state.exportList.length} words on the Anki list?`)) return;
  state.exportList = [];
  save();
  updateStats();
  render($("via").innerHTML);
};

// ---------------------------------------------------------------- start

load();
// Ask the browser not to clear our storage when space runs low.
navigator.storage?.persist?.().catch(() => {});
fetch("words.json")
  .then((r) => r.json())
  .then((data) => {
    words = data;
    buildIndex();
    history = (state.history || []).filter((id) => byId.has(id));
    const last = byId.get(state.current);
    if (last && (inDeck(last) || isBridge(last))) {
      // Resume where you left off.
      cur = byId.get(state.current);
      markedMissed = isMissed(cur.id);
      render("welcome back");
    } else {
      show(fallbackId(null), "");
    }
  });
