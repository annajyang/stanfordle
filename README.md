# Stanfordle

A daily word game embedded in WordPress posts via a one-line iframe.
Game files are hosted on GitHub Pages at `https://thestanforddaily.github.io/stanfordle/`.

---

## Files

```
index.html      — the game page
style.css       — styles
game.js         — game logic
words.js        — word lists (answer pool + valid guesses), can be updated with custom words
generate.html   — puzzle generator UI
```

---

## Daily Operation

### 1. Generate the embed code

Open `https://thestanforddaily.github.io/stanfordle/generate.html` in any browser. Enter:

- **Word** — today's 5-letter answer
- **Puzzle #** — increment by one each day

Click **Generate Embed Code**. Copy the iframe snippet.

### 2. Paste into WordPress

In your post, add a **Custom HTML** block and paste the iframe.
