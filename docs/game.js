"use strict";

// Kanji collection (mastery levels) and milestones. Uses the globals from app.js.

const LEVEL_NAME = ["", "bronze", "silver", "gold"];
const LEVEL_BONUS = [0, 2, 5, 10];

// Readings (base forms) a kanji has across the current deck.
function deckReadings(k) {
  const out = new Set();
  for (const id of index.core.k.get(k) || []) {
    for (const x of kanjiSegs(byId.get(id))) if (x.k === k) out.add(x.b);
  }
  return out;
}

// 0 none · 1 bronze: right in a word · 2 silver: right in 3 words (or all of
// its deck words if it has fewer) · 3 gold: silver + right in every reading
// it has in the deck.
function mastery(k) {
  const st = state.kstat[k];
  if (!st || !st.w.length) return state.rightKanji[k] ? 1 : 0;
  const n = (index.core.k.get(k) || new Set()).size;
  if (st.w.length < Math.min(3, Math.max(n, 1))) return 1;
  const r = new Set(st.r);
  return [...deckReadings(k)].every((b) => r.has(b)) ? 3 : 2;
}

const kstat = (k) => (state.kstat[k] ||= { w: [], r: [], m: 0 });

// Returns [[kanji, newLevel]] for kanji that moved up.
function recordRight(w) {
  const ups = [];
  for (const { seg, k, b } of kanjiSegs(w)) {
    if (seg[0] === "々" || hinted(seg)) continue;
    const before = mastery(k);
    const st = kstat(k);
    if (!st.w.includes(w.id)) st.w.push(w.id);
    if (!st.r.includes(b)) st.r.push(b);
    const after = mastery(k);
    if (after > before) ups.push([k, after]);
  }
  return ups;
}

function recordMiss(w) {
  for (const { seg, k } of kanjiSegs(w)) if (seg[0] !== "々") kstat(k).m++;
}

// Kanji in the current deck, by JLPT level.
function deckKanji(level) {
  return [...index.core.k.keys()].filter((k) => kanjiLevel.get(k) === level);
}

function collected(min) {
  const ks = new Set([...Object.keys(state.kstat), ...Object.keys(state.rightKanji)]);
  return [...ks].filter((k) => mastery(k) >= min).length;
}

// ---------------------------------------------------------------- milestones

const allAt = (level, min) => {
  const ks = deckKanji(level);
  return ks.length > 0 && ks.every((k) => mastery(k) >= min);
};

const BADGES = [
  ...[100, 1000, 5000, 10000].map((n) => ({
    id: `pts${n}`, name: `${n.toLocaleString("en")} points`, test: () => totalPoints() >= n })),
  ...[3, 7, 30, 100].map((n) => ({
    id: `streak${n}`, name: `${n}-day streak`, test: () => streaks().longest >= n })),
  ...[10, 50, 100, 250, 500, 1000].map((n) => ({
    id: `kanji${n}`, name: `${n} kanji collected`, test: () => collected(1) >= n })),
  ...[10, 50, 100, 250].map((n) => ({
    id: `gold${n}`, name: `${n} gold kanji`, test: () => collected(3) >= n })),
  ...[10, 50].map((n) => ({
    id: `comeback${n}`, name: `${n} comebacks`, test: () => state.comebacks >= n })),
  ...[5, 4, 3, 2, 1].flatMap((l) => [
    { id: `n${l}bronze`, name: `All N${l} kanji collected`, test: () => allAt(l, 1) },
    { id: `n${l}gold`, name: `All N${l} kanji gold`, test: () => allAt(l, 3) },
  ]),
];

// Newly earned badges.
function checkBadges() {
  const earned = BADGES.filter((b) => !state.badges[b.id] && b.test());
  for (const b of earned) state.badges[b.id] = today();
  return earned;
}

// ---------------------------------------------------------------- collection screen

function openCollection() {
  const counts = [1, 2, 3].map((m) => collected(m));
  let html = `<p class="sum">Collected <b>${counts[0]}</b> · ` +
    `<span class="m3">gold ${counts[2]}</span> · <span class="m2">silver ${counts[1] - counts[2]}</span> · ` +
    `<span class="m1">bronze ${counts[0] - counts[1]}</span></p>`;
  for (const l of [5, 4, 3, 2, 1]) {
    const ks = deckKanji(l);
    if (!ks.length) continue;
    const ms = ks.map((k) => [k, mastery(k)]).sort((a, b) => b[1] - a[1]);
    const got = ms.filter(([, m]) => m).length, gold = ms.filter(([, m]) => m === 3).length;
    html += `<h3>N${l} <small>${got}/${ks.length} · ${gold} gold</small></h3><div class="grid" lang="ja">` +
      ms.map(([k, m]) => `<button type="button" class="cell m${m}" data-k="${k}">${k}</button>`).join("") +
      `</div>`;
  }
  const earned = BADGES.filter((b) => state.badges[b.id]), locked = BADGES.filter((b) => !state.badges[b.id]);
  html += `<h3>Badges <small>${earned.length}/${BADGES.length}</small></h3><ul class="badges">` +
    earned.map((b) => `<li>🏅 ${b.name} <small>${state.badges[b.id]}</small></li>`).join("") +
    locked.map((b) => `<li class="locked">${b.name}</li>`).join("") + `</ul>`;
  $("coll-body").innerHTML = html;
  $("collection").showModal();
}

$("coll-body").onclick = (e) => {
  const k = e.target.dataset?.k;
  if (k) openDetails(k);
};
$("score").onclick = openCollection;
$("open-collection").onclick = () => { $("menu").close(); openCollection(); };
