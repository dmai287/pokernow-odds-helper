# PokerNow Odds Helper

A Chrome extension that shows **pot odds** and **Monte Carlo hand equity** for
[PokerNow](https://www.pokernow.club) tables. Built as a study and review tool for
poker math — see the [disclaimer](#disclaimer).

## Features

- **Live equity** — estimates your win/tie/lose % vs. N random opponent hands using
  Monte Carlo simulation, updated as the board develops.
- **Action + sizing** — a single recommendation (Fold / Check / Call / Bet / Raise);
  when it's Bet or Raise it suggests an amount in chips, scaled to the pot and your
  hand strength (e.g. "Raise → 420 (pot-sized)", "Bet → 158 (≈⅔ pot)").
- **Preflop advisor** — before the flop, advice is based on position and starting-hand
  strength (open-raise / call / 3-bet / fold) rather than raw equity, using
  position-aware opening ranges and a tighter range vs. a raise.
- **Semi-bluffs & fold equity** — with a strong draw (≈8+ outs) and nothing to call, the
  advice is "Bet (semi-bluff)" instead of a passive check, and shows the fold equity a
  bluff needs to profit — so you're not winning by value-betting alone.
- **Pot odds** — enter pot size and amount to call; the panel shows the breakeven
  equity and whether a call is +EV or −EV.
- **Expected value** — the chips a call is worth on average, `equity × (pot + call) −
  call`, alongside the pot you stand to win. Green when +EV, red when −EV.
- **Outs & draws** — on the flop/turn, labels your flush draws, open-enders, and
  gutshots, counts deduped outs, and estimates the chance to hit by the river.
- **Opponent ranges** — model villains as holding a "top X%" range instead of any two
  cards (Chen-formula ranking), for more realistic equity when facing bets.
- **Auto range** — derives that range from the action: a big bet/raise implies a tight
  range, a small bet or a limped/checked pot a wide one (on by default). Or set the
  tightness manually with the popup slider.
- **Per-villain ranges** — multiway, the raiser is modeled with a tight range and the
  callers with a wider one, instead of one range for the whole field.
- **Implied odds** — a draw that's −EV on immediate pot odds can still be a call when
  the stack behind justifies it; the advice becomes "Call (implied)" and shows how much
  more you need to win on later streets.
- **Advise only on your turn** — gates the Fold/Call/Raise call to when it's actually
  your action (PokerNow's acting-seat marker); equity/draws/EV still show as info. On by
  default; toggle in the popup.
- **Position** — detects your seat relative to the button (blinds / early / late /
  button) and whether you're in position (act last). The advice tightens slightly when
  you're out of position and loosens in position (an equity-realization adjustment).
- **Auto-detect** — reads your hole cards and the board from the table when possible,
  with manual entry as a fallback (type cards like `As`, `Td`, `9c`).
- **Hand history** — logs each completed hand (cards, board, street, position,
  opponents, pot/call, equity, the suggested action, EV, and a best-effort net result)
  to local storage. Review them in a sortable table, export to CSV, or clear — opened
  from the popup. Great for post-session study.
- **Leak report** — turns the logged hands into a study report: net by position,
  in-position vs out-of-position win rate, aggression %, showdown frequency, −EV calls,
  your biggest losses, and prioritized, actionable tips on where you're spilling chips.
- **Live coaching** — learns your tendencies from that report and, during play, surfaces
  a nudge relevant to the current spot (e.g. "you over-call rivers — make sure this beats
  a bluff", "you lose most out of position — lean toward folding"). It coaches *you* on
  *your* leaks — it does not profile opponents. On by default; toggle in the popup.
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
