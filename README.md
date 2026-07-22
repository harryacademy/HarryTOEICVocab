# HarryTOEICVocab

Self-study TOEIC vocabulary practice app for Harry Academy. Pure client-side
HTML/CSS/JS — no backend, no build step, no API keys. Safe to open directly
in a browser or upload/link as a Moodle resource.

Designed with the official **Harry Academy Design System** (pulled live from
the design project — ink + sky-blue palette, Playfair Display + Be Vietnam Pro).

## Folder structure

```
HarryTOEICVocab/
├── index.html          # page shell — loads the CSS/JS files below
├── css/
│   └── styles.css      # design tokens + all component styling
├── js/
│   └── app.js           # app logic: state, flashcards, quiz engine, rendering
├── data/
│   └── vocab.js          # ALL vocabulary content lives here
└── assets/
    └── logo.png          # Harry Academy monogram
```

## Running it

Open `index.html` directly in a browser, or serve the folder locally:

```bash
cd HarryTOEICVocab
python3 -m http.server 8000
# then visit http://localhost:8000
```

## About the word bank

**420 words across 14 topic categories** (Office, Meetings, Contracts,
Marketing, HR, Purchasing, Shipping, Finance, Management, Travel, Hotels,
Dining, Health, Technology) — a standard topic breakdown used across TOEIC
prep material generally. All terms, part-of-speech tags, Vietnamese
translations, and example sentences in `data/vocab.js` were written fresh
for this app rather than transcribed from any textbook, so the app is safe
to host publicly (GitHub Pages, Moodle) without reproducing copyrighted
book content. Two source references Harry supplied (a "Word List" glossary
and Barron's *600 Essential Words for the TOEIC Test*) were used only to
inform which words and topic areas to cover — not copied from directly.

### To add or edit words

Each row in `RAW_WORDS` (`data/vocab.js`) is:

```js
["term", "pos", "vietnamese meaning", "categoryId"]
```

- `pos` is one of `n`, `v`, `adj`, `phrase` — used for the "odd one out" quiz
  type and to pick a fill-in-the-blank sentence template.
- `categoryId` must match an `id` in `VOCAB_CATEGORIES` at the top of the file.
- No other file needs to change — the app picks up new words automatically.

Run this quick duplicate check after editing (avoids two entries with the
identical term confusing the quiz's multiple-choice distractors):

```js
// paste in a JS console with vocab.js loaded
const seen = new Set(); RAW_WORDS.forEach(r => { if (seen.has(r[0])) console.log('dup:', r[0]); seen.add(r[0]); });
```

### To add a new category

Add `{ id: 'newid', title: 'Display Title' }` to `VOCAB_CATEGORIES`, then
tag words with that `categoryId`.

## Features

- **Flashcards** — two-sided cards with pronunciation (Web Speech API),
  category filter, and a "write the word to confirm" check before marking
  a word as known (recognizing ≠ recalling).
- **Quiz** — 30 randomized questions per attempt, six question types
  (meaning match, word match, odd-one-out, unscramble spelling, listening,
  fill-in-the-blank), 15-minute timer, review of wrong answers with
  Vietnamese explanations.
- **Progress tracking** — per-word known/unknown status and quiz history,
  stored in `localStorage` under `toeicVocabState_v1`. Wrapped in a
  storage-availability check, so the app still works (session-only, no
  persistence) if `localStorage` is blocked — e.g. a sandboxed Moodle
  iframe without `allow-same-origin`. For progress to actually persist
  across visits, embed it as a Moodle **URL resource opened in a new
  window/tab**, not a same-page iframe.

## Moodle setup

1. Host this folder somewhere reachable (e.g. GitHub Pages).
2. In Moodle, add an **URL** resource (not a File resource) pointing at the
   hosted `index.html`.
3. Under Appearance, set display to **"New window"** — this keeps the app
   as its own top-level page, so `localStorage` progress and the audio
   pronunciation feature both work reliably. An embedded/in-page iframe may
   restrict either depending on the Moodle theme's iframe sandbox settings.

## Testing changes

No test framework bundled. After editing `data/vocab.js`, open the app and
run through one quiz (should show 30 questions, no duplicate answer options,
each explanation should read naturally) and one flashcard session per
category you touched.
