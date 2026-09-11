# Pisay Reviewer

**Live at <https://rjfabella.github.io/pisay-reviewer/>**

A practice-exam web app for incoming high school students, built from two scanned reviewers:

- **PSHS NCE Reviewer (2024)** — 90 questions across 4 subtests
- **MSA Proficiency Test 1 for Incoming High School Students** — 265 questions across 9 sections

**355 questions total.** Every answer was transcribed from the scans and **checked against the
official printed answer keys**, and every question has a short written explanation.

## Running it

It's a static site — no build step, no server, no API keys.

**Easiest:** open `app/index.html` in a browser.

**Or serve it locally** (nicer for testing on a phone on the same Wi-Fi):

```bash
node serve.js
```

Then open <http://localhost:8123>.

## Deploying to GitHub Pages

This repo ships a workflow at `.github/workflows/deploy.yml` that publishes the `app/` folder
to GitHub Pages on every push to `main`. There is no build step — it just uploads the static files.

**One-time setup:**

1. Go to **Settings → Pages** in the repository.
2. Under **Source**, choose **GitHub Actions**.
3. Push to `main` (or run the workflow by hand from the **Actions** tab).

The site then goes live at:

```
https://rjfabella.github.io/pisay-reviewer/
```

Every later push to `main` redeploys it automatically. You can watch progress in the **Actions** tab.

> **Source must be "GitHub Actions", not "Deploy from a branch."** With the branch setting, Jekyll
> builds the repo root and serves `README.md` as the homepage instead of the app. The workflow token
> is also not allowed to turn Pages on by itself, so this setting has to be made once by hand.

> **Note on private repositories.** GitHub Pages only works on a private repo with a paid plan
> (Pro, Team or Enterprise). On the free plan the repository has to be **public** for Pages
> to publish.

**Other hosts:** the same `app/` folder drops straight into Netlify, Vercel, Cloudflare Pages, or
any static host. Nothing else is required.

## The repository is public

Pages on a free account requires it. That means the two source PDFs in the repository root — the
complete scanned reviewers — are publicly downloadable, and the app reproduces all 355 questions.
Fine as a personal study aid; worth a thought as a public mirror of someone's copyrighted reviewer.

If you want the PDFs out of the repo (the app does not use them at all — the questions and figures
are already extracted):

```bash
git rm --cached "MSA Proficiency Test 1 for Incoming High School Students.pdf" "NCE-Sample_Test_Questions-(2024).pdf"
echo "*.pdf" >> .gitignore
git commit -m "Remove source PDFs from the repository"
git push
```

That keeps the files on your own machine but stops tracking them. They would still be reachable in
the earlier commit, so to purge them from history entirely you would need `git filter-repo` or a
fresh repo.

## What it does

| Feature | Notes |
| --- | --- |
| Sign in with a name | No password. Each name gets its own saved progress on that device. |
| Full exam or pick subjects | Whole reviewer, chosen subjects, or a 10-question quick practice. |
| Question count | 10 / 20 / 30 / 50 / all, and the app favours questions you haven't seen yet. |
| Time limit | Off, or 90s / 60s / 40s per item (shown as one countdown for the whole session). |
| Feedback style | **Practice** checks each answer immediately; **Exam** reveals everything at the end. |
| Automatic scoring | Percentage, per-subject breakdown, best streak, time used, average per item. |
| Answer review | Every question with the correct answer and an explanation; filter to just the ones you missed. |
| Gamification | XP, 10 levels with Filipino titles, streak combos, 10 badges, day streak, per-subject mastery bars, on-device leaderboard. |
| Records & export | Every session with every answer given, per student; two CSV exports. See below. |
| Light / dark | Follows the system setting, with a manual toggle. |
| Keyboard | `A`–`E` or `1`–`5` to answer, `Enter` for next. |

Progress is stored in the browser's `localStorage`, so it stays on that device and is never
uploaded anywhere.

## Checking a student's records

Every finished session is saved in full — not just the score, but each question, the answer the
student picked, the correct answer, and how long each one took.

**Records screen.** Open it from the **📋 Records & export** button on the home screen, or from
**View records on this device** at the bottom of the sign-in screen (no need to pick a student
first). Filter by student, tap a session to expand the per-question breakdown.

**CSV export.** Two buttons on the Records screen, honouring the current student filter:

| File | One row per… | Columns |
| --- | --- | --- |
| `…-sessions-….csv` | session | student, date, time, session, mode, questions, correct, score %, XP, time used, seconds per item, best streak, time limit, feedback style |
| `…-answers-….csv` | answer | student, date, time, session, question number, source, subject, section, item number in the reviewer, question text, your answer (letter + text), correct answer (letter + text), result (`correct` / `wrong` / `skipped`), seconds |

Both open straight in Excel or Google Sheets (UTF-8 with BOM, so `₱` and accents survive).

**The one limitation.** There is no server, so records live in the browser on whichever device
the student used. The Records screen shows everything on *that* device. To check from a different
device, the student exports a CSV there and sends it over. The last 60 sessions per student are kept.

## Explanations

Explanations are **pre-written and shipped in the data files** rather than generated live. That
means they work offline, cost nothing to run, need no API key, and appear instantly. They explain
*why* the answer is right — and, where useful, why the tempting wrong answer is wrong.

### Where the printed key is questionable

Five questions carry a ⚠️ caveat note because the reviewer's official key is debatable or is a
clear misprint. In each case the app **marks the official key as correct** (that's what a student
will be graded against) but tells the student what's going on:

| Item | Issue |
| --- | --- |
| MSA Science 8 | Key says "directly killing them"; modern biology says habitat destruction. |
| MSA Identifying Errors 3 | Key says "No error", but "the number of freedom" is a usage error. |
| NCE Verbal 1 | Choices A and D are the same word — a printing error. Key says A. |
| NCE Verbal 5 | "rich ivory" → "pleasant" is a stretch; no choice fits well. |
| NCE Verbal 16 | Key says (D), but the actual grammatical error is at (C), "did not wanted". |

## Figures

62 questions depend on a diagram, graph, table or figure that can't be written as text — all of
Abstract Reasoning plus assorted Math and Science items. Those were cropped out of the original
page scans and ship as PNGs in `app/figures/`. They render on a white card so they stay readable
in dark mode.

Figures that were purely decorative in the original (a stock photo of a tin can, for instance)
were left out, since the question text is self-contained without them.

## Project layout

```
pisay-reviewer/
├─ app/
│  ├─ index.html          entry point
│  ├─ css/style.css
│  ├─ js/qb.js            question-bank registry
│  ├─ js/app.js           all application logic
│  ├─ data/*.js           13 files, 355 questions (plain JS, loaded via <script>)
│  └─ figures/*.png       62 cropped figures
├─ serve.js               tiny local dev server
└─ *.pdf                  the original scanned reviewers
```

Data files are plain `<script>` files rather than JSON so the app works from `file://` without
tripping over CORS.

### Question format

```js
QB.add({
  id: "msa-math",
  source: "MSA Proficiency Test I",
  subject: "Mathematics",
  section: "Test I — Quantitative Ability",   // optional
  directions: "…",                            // optional, applies to the whole set
  passages: { key: {title, text, credit} },   // optional, for reading comprehension
  questions: [
    { n: 1,                    // number in the original reviewer
      q: "Question text",      // *word* renders as emphasis; \n is preserved
      c: ["choice A", "…"],    // 2–5 choices
      a: 2,                    // index of the correct choice
      e: "Why that's right",
      img: "figures/…png",     // optional
      p: "key",                // optional, links to a passage
      dir: "…",                // optional, overrides the set directions
      note: "…"                // optional ⚠️ caveat about the printed key
    }
  ]
});
```

To add questions, drop a new file in `app/data/` and add one `<script>` tag to `index.html`.

## Not built yet — phase 2

The **quiz bee** (up to 4 students answering in real time) is not in this build. Real-time play
across separate devices needs something the students' browsers can share state through. Two
sensible options:

1. **Firebase Realtime Database** — free tier is plenty for this, still no server to run, and
   the app stays a static site. Roughly a day of work.
2. **A small WebSocket server** (Node + `ws`) on Render/Fly/Railway — more control, but now
   there's a service to keep alive.

A third, much cheaper option if the students are in the same room: a **pass-and-play mode** on a
single device, where up to 4 players take turns or buzz in on one screen. No network at all.

## Credits

Questions are from the *PSHS NCE Reviewer (2024)* and *MSA Proficiency Test 1 for Incoming High
School Students*. The reading passage in NCE Verbal items 24–26 is excerpted from
"Doll Eyes" by Eline Santos. This app is a personal study aid built from those materials.
