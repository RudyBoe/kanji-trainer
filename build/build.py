#!/usr/bin/env python3
"""Build the kanji-trainer word list.

Source: the `kotobako-data` npm package (CC-BY-SA 4.0), which bundles
jmdict-simplified (JMdict + KANJIDIC2) and JLPT tags from open-anki-jlpt-decks
(Jonathan Waller's lists).

Steps:
  1. keep words whose written form is kanji (+ okurigana) and that are not
     "usually kana" (those arrive with a kana headword),
  2. align the reading to the kanji one by one using KANJIDIC on/kun readings,
     allowing rendaku, handakuten and gemination (drops jukujikun like 今日),
  3. write app/words.json and build/report.md.

Usage: python3 build/build.py
"""
import json
import os
import re
import tarfile
import urllib.request
from collections import Counter, defaultdict

PKG = "kotobako-data"
PKG_VERSION = "26.7.19"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "build", ".cache")
LEVELS = ["N5", "N4", "N3"]   # the core deck
BRIDGE_LEVELS = ["N2"]        # candidates for navigation bridges

# ---------------------------------------------------------------- download

def load_source():
    path = os.path.join(CACHE, f"{PKG}-{PKG_VERSION}.json")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        url = f"https://registry.npmjs.org/{PKG}/-/{PKG}-{PKG_VERSION}.tgz"
        tgz = path + ".tgz"
        urllib.request.urlretrieve(url, tgz)
        with tarfile.open(tgz) as t:
            data = t.extractfile("package/kotobako-static.json").read()
        with open(path, "wb") as f:
            f.write(data)
        os.remove(tgz)
    with open(path, encoding="utf-8") as f:
        return json.load(f)

# ---------------------------------------------------------------- kana helpers

def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)

def is_kanji(c):
    return "一" <= c <= "鿿" or c == "々"

def is_hira(c):
    return "ぁ" <= c <= "ゟ" or c == "ー"

VOICED = dict(zip("かきくけこさしすせそたちつてとはひふへほ",
                  "がぎぐげござじずぜぞだぢづでどばびぶべぼ"))
SEMI = dict(zip("はひふへほ", "ぱぴぷぺぽ"))
# ぢ/づ are usually written じ/ず in words
VOICED_ALT = {"ち": "じ", "つ": "ず"}
GEMINABLE = set("つくちき")
I_ROW = dict(zip("うくぐすつぬぶむる", "いきぎしちにびみり"))

def kanji_readings(k):
    """Base readings of one kanji: {reading: 'on'|'kun'}."""
    out = {}
    for r in k["onyomi"]:
        out.setdefault(hira(r).strip("-"), "on")
    for r in k["kunyomi"]:
        r = r.strip("-")
        stem, _, oku = r.partition(".")
        out.setdefault(stem, "kun")
        if oku:
            out.setdefault(stem + oku, "kun")
            # masu-stem noun: 話す -> 話(はなし), 光る -> 光(ひかり)
            if len(oku) == 1 and oku in I_ROW:
                out.setdefault(stem + I_ROW[oku], "kun")
    out.pop("", None)
    return out

def variants(base, first, typ):
    """In-word forms of a base reading -> number of sound changes."""
    forms = {base: 0}
    heads = {base: 0}
    if not first:
        c = base[0]
        for v in (VOICED.get(c), SEMI.get(c), VOICED_ALT.get(c)):
            if v:
                heads[v + base[1:]] = 1
    for h, cost in heads.items():
        forms.setdefault(h, cost)
        if len(h) > 1 and h[-1] in GEMINABLE:
            forms.setdefault(h[:-1] + "っ", cost + 1)
        if typ == "kun":
            forms.setdefault(h + "っ", cost + 1)  # 切手 きって
    if base == "じゅう":
        forms.update({"じっ": 1, "じゅっ": 1})
    return forms

# ---------------------------------------------------------------- alignment

def tokenize(word):
    """Split into kanji chars and runs of kana: ['加', 'わる']."""
    toks = []
    for c in word:
        if is_kanji(c) or not toks or is_kanji(toks[-1][-1]):
            toks.append(c)
        else:
            toks[-1] += c
    return toks

def align(word, reading, kdic):
    """Return the cheapest list of segments, or None if it doesn't align.

    Segment: {"t": text, "r": reading in word} plus, for kanji,
    "b": base reading, "y": 'on'/'kun'.
    """
    toks = tokenize(word)
    best = None

    def go(i, pos, prev, segs, cost):
        nonlocal best
        if best and cost >= best[0]:
            return
        if i == len(toks):
            if pos == len(reading):
                best = (cost, list(segs))
            return
        t = toks[i]
        if not is_kanji(t[0]):
            if reading.startswith(t, pos):
                segs.append({"t": t, "r": t})
                go(i + 1, pos + len(t), None, segs, cost)
                segs.pop()
            return
        if t == "々":
            if prev is None:
                return
            cands = {prev[0]: prev[1]}
        else:
            if t not in kdic:
                return
            cands = kdic[t]
        for base, typ in cands.items():
            for form, c in variants(base, i == 0, typ).items():
                if reading.startswith(form, pos):
                    segs.append({"t": t, "r": form, "b": base, "y": typ})
                    go(i + 1, pos + len(form), (base, typ), segs, cost + c)
                    segs.pop()

    go(0, 0, None, [], 0)
    return best[1] if best else None

# ---------------------------------------------------------------- build

def main():
    src = load_source()["datasets"]
    kdic = {k["char"]: kanji_readings(k) for k in src["kanji"]}
    klevel = {k["char"]: k["jlpt"] for k in src["kanji"]}

    stats = Counter()
    dropped = defaultdict(list)
    words = []
    for e in src["vocab"]:
        lvl = e["jlpt"]
        if lvl not in LEVELS + BRIDGE_LEVELS:
            continue
        w, r = e["word"], hira(e["reading"])
        stats[lvl, "total"] += 1
        if not any(is_kanji(c) for c in w):
            why = "usually kana" if e.get("altWord") else "no kanji"
        elif not all(is_kanji(c) or is_hira(c) for c in w):
            why = "katakana/other script"
        elif not is_kanji(w.removeprefix("お").removeprefix("ご")[0]):
            why = "starts with kana"
        else:
            segs = align(w, r, kdic)
            why = None if segs else "irregular reading"
        if why:
            stats[lvl, why] += 1
            dropped[why].append(f"{w}【{r}】")
            continue
        stats[lvl, "kept"] += 1
        words.append({
            "id": e["id"].split("_")[-1],
            "w": w,
            "r": r,
            "lv": int(lvl[1]),
            "m": e["meanings"][:4],
            "s": [[s["t"], s["r"]] + ([s["b"], s["y"]] if "b" in s else [])
                  for s in segs],
        })

    os.makedirs(os.path.join(ROOT, "app"), exist_ok=True)
    with open(os.path.join(ROOT, "app", "words.json"), "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, separators=(",", ":"))

    write_report(words, stats, dropped, klevel)


def connectivity(words):
    by_kr, by_k = defaultdict(set), defaultdict(set)
    for w in words:
        for s in w["s"]:
            if len(s) > 2 and s[0] != "々":
                by_kr[s[0], s[2]].add(w["id"])
                by_k[s[0]].add(w["id"])
    return by_kr, by_k


def dist(counter_values):
    buckets = Counter()
    for n in counter_values:
        buckets["1" if n == 1 else "2" if n == 2 else "3-5" if n <= 5 else "6+"] += 1
    return buckets


def write_report(words, stats, dropped, klevel):
    L = []
    p = L.append
    p("# Data build report\n")
    p("| Level | Total | Kept | Usually kana | Irregular reading | Other |")
    p("|---|---|---|---|---|---|")
    for lvl in LEVELS + BRIDGE_LEVELS:
        other = stats[lvl, "total"] - stats[lvl, "kept"] - stats[lvl, "usually kana"] - stats[lvl, "irregular reading"]
        p(f"| {lvl} | {stats[lvl,'total']} | {stats[lvl,'kept']} | {stats[lvl,'usually kana']} | {stats[lvl,'irregular reading']} | {other} |")
    p("")

    def section(title, pool):
        by_kr, by_k = connectivity(pool)
        taps = [(w, s) for w in pool for s in w["s"] if len(s) > 2 and s[0] != "々"]
        same = sum(1 for w, s in taps if len(by_kr[s[0], s[2]]) > 1)
        other = sum(1 for w, s in taps if len(by_kr[s[0], s[2]]) == 1 and len(by_k[s[0]]) > 1)
        dead = len(taps) - same - other
        p(f"## {title}\n")
        p(f"- Words: **{len(pool)}**, distinct kanji: **{len(by_k)}**, kanji+reading pairs: **{len(by_kr)}**")
        p(f"- Every kanji on every card is a possible tap: **{len(taps)}** taps in total. Where do they lead?")
        p(f"  - same kanji, same reading: **{same}** ({same*100//len(taps)}%)")
        p(f"  - same kanji, other reading only: **{other}** ({other*100//len(taps)}%)")
        p(f"  - dead end (kanji in no other word): **{dead}** ({dead*100//len(taps)}%)")
        d = dist(len(v) for v in by_k.values())
        p(f"- Words per kanji: 1 → {d['1']}, 2 → {d['2']}, 3–5 → {d['3-5']}, 6+ → {d['6+']}")
        d = dist(len(v) for v in by_kr.values())
        p(f"- Words per kanji+reading: 1 → {d['1']}, 2 → {d['2']}, 3–5 → {d['3-5']}, 6+ → {d['6+']}")
        p("")
        return by_k

    core = [w for w in words if w["lv"] >= 3]
    n3 = [w for w in words if w["lv"] == 3]
    section("N3 only", n3)
    by_k = section("N5–N3 (core deck)", core)
    section("N5–N2 (core + N2 as bridges)", words)

    dead_k = sorted(k for k, v in by_k.items() if len(v) == 1)
    bridge = [w for w in words if w["lv"] == 2]
    rescued = [k for k in dead_k if any(s[0] == k for w in bridge for s in w["s"])]
    p(f"Dead-end kanji in the core deck: **{len(dead_k)}**; N2 words would rescue **{len(rescued)}** of them.\n")
    p("Dead-end kanji: " + " ".join(dead_k) + "\n")

    p("## Samples\n")
    for w in core[:0] or [w for w in core if w["w"] in ("学校", "人々", "出発", "話", "加わる", "一緒", "十分", "散歩", "小包")]:
        p(f"- {w['w']}【{w['r']}】 " + " · ".join(
            f"{s[0]}={s[1]}" + (f" (base {s[2]}, {s[3]})" if len(s) > 2 and s[1] != s[2] else f" ({s[3]})" if len(s) > 2 else "")
            for s in w["s"]))
    p("")
    for why, items in dropped.items():
        p(f"### Dropped: {why} ({len(items)})\n")
        p(" ".join(items[:60]) + (" …" if len(items) > 60 else "") + "\n")

    with open(os.path.join(ROOT, "build", "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
