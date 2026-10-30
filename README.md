# Σιγά σιγά: Greek practice

A small study app for Greek at A2–B1: spaced-repetition flashcards, graded texts with a tap-to-look-up dictionary, and short games.

It is plain HTML and JavaScript with no server. Open `index.html` in a browser, or use the hosted copy on GitHub Pages. Progress is saved in the browser.

## Daily routine (about 15 minutes)
1. **Review**: flashcards for the words that are due.
2. **Read**: one text. Tap a word to see its meaning and save it to your words.
3. **Play**: one short game (articles, stress, listening, verb forms, word order).

## Texts
- **Ελληνικοί μύθοι**: six Greek myths, A2 to A2+.
- **Γιατί;**: six science and nature texts written like a children's book, A2 to A2+.
- **Αληθινές ιστορίες**: six true stories from Greek and Cypriot history, A2+ to B1.
- **Μικρά κείμενα**: six short articles about Greek life, A2+ to B1.
- **Ένας χρόνος στη Θεσσαλονίκη**: a story in ten chapters, A2 to B1.

Each text has English for every sentence, notes for tricky forms, and questions. You can also paste in any Greek text (**Read → Add a text**).

To add a text to the app itself, add a JSON file to `texts/` and run `python3 tools/build_texts.py`. Copy the format of any existing file.

## Your words
- With no word list, the app offers the 300 most common Greek words (`data/starter.js`) to start with.
- In the **Words** tab, **Connect words.csv** links a CSV file with the columns `greek, english, part_of_speech, lesson_date`. Words you add while reading are appended to it, and edits to the English are written back. This works in Chrome and Edge; other browsers can download the updated file instead.
- `data/my-words.js` is an optional local snapshot of your own CSV, made with `python3 tools/snapshot_words.py`. It is in `.gitignore`, so it is not published.

## Progress on more than one device
Progress is saved per browser. To use the app on several devices, go to **Words → Your progress** and connect a GitHub token that can only use gists (`gist` scope). The app keeps a copy of your progress in a secret gist in your account and merges the changes from each device. The token stays in the browser where you enter it.

**Export progress** and **Import progress** save and load the same data as a file, as a backup or to move between browsers without GitHub.

## Data and credits
- `data/dict.js`: a Greek–English dictionary with inflected forms, built from [Wiktionary](https://en.wiktionary.org/) data extracted by [kaikki.org](https://kaikki.org/). Wiktionary content is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and so is this derived file. Rebuild it with `python3 tools/build_dict.py`; it downloads its sources (about 26 MB) to `~/.cache/sigasiga`.
- Word frequencies come from the OpenSubtitles 2018 list in [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY-SA 4.0).
- `data/texts.js`: the texts, bundled from `texts/*.json`.
