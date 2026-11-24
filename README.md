# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/2274803498tong-web/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/2274803498tong-web/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (model radar-2) ranks the 40 pre-token protocols on the token-radar-01 watchlist plus the 160 strongest pre-token protocols below the $50M floor, by implied value — and gives each one a concrete six-step farm plan. The dashboard is a static page with no network: a sortable, filterable board, a detail view per protocol that recomputes the implied value from the snapshot's own figures, the live-token comparables the multiples are read from, and the method, stated in full.

## How it ranks

A protocol is pre-token when its snapshot record carries no token — no market cap, no CoinGecko id, no symbol. Live-token protocols are set aside as comparables, never ranked.

```
implied value  =  TVL  x  category multiple  x  growth  x  maturity
category multiple  =  median market-cap / TVL of the tokenized peers
                     in the same category, clamped to 0.05x – 3.0x
                     (fewer than 3 peers: the global median)
growth             =  1 + clamp(7-day change, -60%, 120%) / 100 x 0.5
maturity           =  0.6 + min(age, 1095 days) / 1095 x 0.4
                     (age unknown: 365 days)
```

Every multiple is read out of the snapshot itself, not typed in by hand. The board carries 200 rows — all 40 watchlist slugs plus 160 early rows — with ranks 1..200 and non-increasing implied values from $464.9M down to $886K. Each row's farm plan is derived from the protocol's own record (category, chains, TVL, age): a fresh wallet, one qualifying action with its cost and time, a weekly repeat, a hold of 30–60 days, a claim step that names only the protocol's own points page, and a farm log.

## Run it

Node 22+, standard library only. `snapshot.json` is the competition's sealed input (758 protocols, snapshot 2026-11-14).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

That writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), `out/dashboard/` and `out/screenshots/`, and `out/dossier.json` (built with the vendored make.fun library). The run is deterministic: the same snapshot always writes the same bytes.

## Layout

- `main.ts` — reads the snapshot, scores the board, writes the output.
- `lib/model.ts` — the radar-2 model: category comparables, implied value, farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the board, detail view, live-token comparables, method. No network, no framework.
- `screenshots/` — the board, a protocol detail view, and a filtered view, 1440×900.
- `vendor/makefun-board.ts` — the vendored make.fun dossier library, as the competition requires.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
