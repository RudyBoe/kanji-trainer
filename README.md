# Kanji Trainer

**▶ Open the app: https://rudyboe.github.io/kanji-trainer/**

A phone-first web app for **kanji retention through vocabulary**. Words are the vehicle, kanji are the goal. It's a light aid next to Anki, not a replacement: no due dates, no daily quota, no streaks. Open it, tap around, close it.

## How to use it

1. A word appears, written in kanji. Read it and think of its reading and meaning.
2. Tap **Show**. You get each kanji's reading *in this word* (with the base reading under it when the sound changed, e.g. 学校: がっ, base がく), the whole reading and the English meanings.
3. Got it wrong? Tap **✗ Missed**. The word goes on your missed pile and comes back naturally while you browse. Get it right next time and it leaves the pile.
4. Want it in Anki? Tap **+ Anki** to put it on your export list.
5. Got it right? Just move on: you score points (see *Points game*).
6. **Tap any kanji** to move on. The next word uses that kanji:
   - preferably with the **same reading**,
   - otherwise with **another reading**,
   - otherwise a **link word** one JLPT level up,
   - otherwise a random word (missed words first, then unseen ones).

Under each revealed kanji: `+n` = n words share this reading, `~n` = only other readings, `–` = dead end, `●●●` = points it's worth.

Top bar: **←** back · **✗ n** jump to a missed word · **🔥 streak** with today's and total points · **⤮** random word · **⋯** settings.

**Tip:** add it to your home screen (iPhone: Share → *Add to Home Screen*; Android: ⋮ → *Add to Home screen*) so it opens like an app.

## Settings (⋯)

| Setting | Options |
|---|---|
| **Words** | N5 · N5–N4 · N5–N3 (default). Words one level harder appear only as **links**, when a tapped kanji has no other word in your deck. |
| **Kanji up to** | N5 · N4 · N3 · N2 · N1 (all). |
| **Harder kanji** | *Show with reading* (reading always visible, underlined) or *Leave word out*. |
| **Show readings before reveal** | Show the kanji readings right away instead of after **Show**. |
| **Points & streak** | Turn the points game on (default) or off. |

The settings screen shows how many words your current choice gives.

## Points game

- A word counts as **right** when you tap Show and move on without marking ✗ Missed.
- Each kanji in it earns points by JLPT level: **N5 = 1, N4 = 2, N3 = 3, N2 = 4, N1 = 5**. Kanji whose reading was shown as a hint (harder-kanji hint, or *Show readings before reveal*) count half.
- A word scores **once per day**. Missed words score nothing, with no penalty.
- **Streak** 🔥: consecutive days with at least one point. It stays alive until the end of the next day.
- Settings shows total points, today, best day, current and longest streak, and the rarest kanji you've gotten right.

It's self-graded and stored on your device only: for motivation, not a leaderboard.

## Anki export

1. Collect words with **+ Anki**.
2. Settings → **Anki list** → **Export**. On a phone this opens the share sheet (send to Anki or save to Files); on a computer it downloads a `.txt` file.
3. In Anki: **File → Import** and pick the file. It creates Basic cards in a deck called *Kanji Trainer*:
   - front: the word,
   - back: furigana, reading, meanings, per-kanji readings,
   - tags: `kanji-trainer` and the word's level (e.g. `N3`).
4. The list stays until you tap **Clear**.

Works with desktop Anki and AnkiDroid. AnkiMobile (iPhone) support for text imports is untested.

## Your progress

Seen words, missed pile, points, Anki list and settings are saved **in your browser on that device only**. Nothing is sent anywhere, so sharing the link with others is fine: everyone has their own progress. The app reopens at the word you left.

You can lose progress if you use a private/incognito tab, clear your browser data, or open the link inside another app's built-in browser (WhatsApp, Messenger, …). On iPhone, the home-screen icon and Safari keep separate progress.

---

## How the word list is made

- **Kanji-only words.** Words usually written in kana (沢山 → たくさん), jukujikun (今日, 大人, 時計) and words whose reading can't be split kanji by kanji are left out.
- **Per-kanji readings** are matched against KANJIDIC on/kun readings, allowing rendaku (小包 づつみ), handakuten (散歩 ぽ) and gemination (学校 がっ, 切手 きっ). In-word readings are grouped under their base reading (がく) for navigation.
- **Levels.** Words: JLPT N5–N2 (N2 is used only for links). Kanji: 5-level JLPT kanji lists (N5–N2; unlisted kanji count as N1). There are no official lists since 2010, so these, like all JLPT lists, are community estimates.

Result: 2,691 words at N5–N3 plus 1,215 N2 link words. `build/report.md` has the numbers (how often a tap leads somewhere, dead-end kanji, what was dropped and why).

## Data sources

| Source | Used for | License |
|---|---|---|
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Meanings, readings, "usually kana" flags | CC-BY-SA 4.0 |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji readings, levels | CC-BY-SA 4.0 |
| [Jonathan Waller's JLPT lists](http://www.tanos.co.uk/jlpt/) (via [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks)) | JLPT word levels | CC-BY |
| [`jlpt`](https://www.npmjs.com/package/jlpt) npm package | JLPT kanji levels (N5–N2) | MIT |

The first three come bundled in the [`kotobako-data`](https://www.npmjs.com/package/kotobako-data) npm package (CC-BY-SA 4.0). The word list `docs/words.json` is licensed CC-BY-SA 4.0.

## Development

- The app is the static site in `docs/` (plain HTML/CSS/JS, no build step), served by GitHub Pages from `main` → `/docs`.
- Run locally: `cd docs && python3 -m http.server`, then open http://localhost:8000.
- Rebuild the word list: `python3 build/build.py` (downloads the data, writes `docs/words.json` and `build/report.md`).
