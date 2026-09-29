# Kanji Trainer

A web app for **kanji retention through vocabulary**. It is not a complete vocab course: words are the vehicle, kanji are the goal.

## How it works

1. The app shows a Japanese word written in kanji (vocab around JLPT N3, kanji of any level up to N1).
2. Each kanji carries a small note with its reading *in this word*.
3. You read, write and translate the word in your head, then reveal the meaning.
4. Got it wrong? Reschedule the word.
5. Tap one of the kanji to move on. The next word uses that kanji:
   - preferably with the **same reading**,
   - otherwise the **same kanji with a different reading**,
   - otherwise a fallback (due or unseen word).

## Design decisions

- **Kanji-only words.** Words usually written in kana, jukujikun (今日, 大人) and ateji are excluded. Every kanji in every word has its own clean reading.
- **Sound changes are kept** (学校 がっ, 人々 びと) but grouped under their base reading (がく, ひと) for navigation.
- **Core unit is kanji + reading** (e.g. 学/がく). Progress is tracked at that level; rescheduling a word marks its kanji-readings as weak.
- **English** UI and meanings.
- **Static app**, no backend. Progress lives in the browser. Hosted on GitHub Pages.

## Data sources

| Source | Used for | License |
|---|---|---|
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Meanings, readings, "usually kana" flags | CC-BY-SA 4.0 |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji readings, levels | CC-BY-SA 4.0 |
| [Jonathan Waller's JLPT lists](http://www.tanos.co.uk/jlpt/) (via [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks)) | JLPT vocab/kanji levels | CC-BY |

All three arrive bundled in the [`kotobako-data`](https://www.npmjs.com/package/kotobako-data) npm package (CC-BY-SA 4.0), which `build/build.py` downloads. Per-kanji readings are aligned by the build script itself against KANJIDIC on/kun readings, allowing rendaku (が), handakuten (ぽ) and gemination (っ). Words that don't align (jukujikun like 今日, 大人, 時計) are dropped. See `build/report.md`.

The word list `docs/words.json` is licensed CC-BY-SA 4.0.

## Running it

The app is the static site in `docs/` (served by GitHub Pages from `main` → `/docs`). Locally: `cd docs && python3 -m http.server`, then open http://localhost:8000.

To rebuild the word list: `python3 build/build.py` (writes `docs/words.json` and `build/report.md`).

Settings (⋯):
- **Words:** N5, N5–N4 or N5–N3 (default). Words one level harder are **links**: they appear only when a tapped kanji has no other word in the deck.
- **Kanji up to:** N4, N2 (incl. N3) or N1. KANJIDIC uses the old 4-level scale, so N3 and N2 kanji can't be told apart. Harder kanji are either shown with their reading or the word is left out.
- **Anki list:** `+ Anki` on a revealed card adds it. Export writes a tab-separated file for Anki's File → Import (Basic cards, deck "Kanji Trainer", tags `kanji-trainer N3`). The list stays until you clear it.

Under each revealed kanji: `+n` words share this reading, `~n` only other readings, `–` dead end (random word).

## Plan

1. **Data build**: script that merges the sources into one JSON word list with per-kanji base readings, plus a connectivity report (how many dead ends does kanji navigation hit?).
2. **App**: word card, tappable kanji with reading notes, reveal, reschedule, kanji-based navigation.

## Scope: a light, non-committal aid

This is **not** an SRS and not an Anki replacement. No due dates, no daily quota, no streaks. Open it, tap around, close it.

- **Phone first.** Big kanji, big tap targets, one-handed use.
- **Kanji tapping is the whole app.** There's no separate review mode.
- **"Reschedule" is lightweight.** A missed word goes onto a small "missed" pile. When a tap has several candidate words, missed ones are preferred, so they come back naturally while you browse. Getting one right takes it off the pile.
- **Seen words** are remembered only so navigation prefers fresh ones. Everything is stored in the browser.

## Open questions

- Allow N2/N1 words purely as navigation bridges for kanji that appear in only one N3 word? (Decide after the connectivity report.)
