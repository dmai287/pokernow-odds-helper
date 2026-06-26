# PokerNow Odds Helper

A Chrome extension that shows **pot odds** and **Monte Carlo hand equity** for
[PokerNow](https://www.pokernow.club) tables. Built as a study and review tool for
poker math — see the [disclaimer](#disclaimer).

## Features

- **Live equity** — estimates your win/tie/lose % vs. N random opponent hands using
  Monte Carlo simulation, updated as the board develops.
- **Pot odds** — enter pot size and amount to call; the panel shows the breakeven
  equity and whether a call is +EV or −EV.
- **Outs & draws** — on the flop/turn, labels your flush draws, open-enders, and
  gutshots, counts deduped outs, and estimates the chance to hit by the river.
- **Auto-detect** — reads your hole cards and the board from the table when possible,
  with manual entry as a fallback (type cards like `As`, `Td`, `9c`).
- **Draggable overlay** — a compact panel you can move and collapse.
- **Configurable** — toggle the overlay, auto-detect, and simulation count from the
  extension popup.

## Project structure

```
manifest.json              Manifest V3 config
icons/                     Extension icons (16/48/128)
src/
  poker/
    cards.js               Card parsing, constants, dedup
    evaluator.js           7-card best-hand evaluator
    equity.js              Monte Carlo equity + pot-odds math
  content/
    scraper.js             Reads hole/board cards from the PokerNow DOM
    overlay.js             Builds the draggable on-table panel
    overlay.css            Overlay styling
    content.js             Wires scraper + overlay + engine together
  popup/
    popup.html/.css/.js    Settings popup
```

## Install (developer / unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Open a table at `https://www.pokernow.club/games/...` — the panel appears top-right.

## How the math works

- **Equity** — for each simulated trial the remaining board and each opponent's two
  cards are dealt at random from the live deck (your cards and the visible board
  removed). The best 5-card hand is scored for you and each opponent; ties split the
  pot. Equity is the average share you win over all trials. More simulations =
  steadier numbers (default 2,000; configurable up to 10,000).
- **Pot odds** — breakeven equity = `call / (pot + call)`. Calling is +EV when your
  equity exceeds the breakeven.

## Card detection

The scraper reads PokerNow's `.card-container` elements, decoding the card from its
CSS classes (`card-<suit>` + `card-s-<rank>`) with the value/suit spans as a fallback.
Verified live against a real table (both `pokernow.club` and `pokernow.com`).

If PokerNow's markup changes and auto-detect misses, adjust the `SELECTORS` object at
the top of [`src/content/scraper.js`](src/content/scraper.js). Manual card entry always
works regardless.

## Disclaimer

This tool is intended for **studying poker math and reviewing your own play**
(e.g. on play-money tables). Using real-time strategic assistance in live games may
violate a site's terms of service. Use it responsibly and at your own risk.
