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

## Data sources (planned)

| Source | Used for | License |
|---|---|---|
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Meanings, readings, "usually kana" flags | CC-BY-SA 4.0 |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji readings, levels | CC-BY-SA 4.0 |
| [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) | Per-kanji reading alignment | CC-BY-SA |
| [Jonathan Waller's JLPT lists](http://www.tanos.co.uk/jlpt/) | JLPT vocab/kanji levels | CC-BY |

## Plan

1. **Data build**: script that merges the sources into one JSON word list with per-kanji base readings, plus a connectivity report (how many dead ends does kanji navigation hit?).
2. **App**: word card, tappable kanji with reading notes, reveal, reschedule, kanji-based navigation.

## Open questions

- Target device: phone, desktop, or both?
- Is kanji-tap navigation the whole app, or is there also a separate "review due" mode?
- Allow N2/N1 words purely as navigation bridges for kanji that appear in only one N3 word?
