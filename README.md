# Suzerain – Database

A local, browser-based database viewer for **Suzerain** (Base Game + Rizia DLC), designed to inspect dialogue choices, conditions, effects, triggers, decisions, decrees, and other mechanical systems extracted from the game files.

This tool is aimed at **analysis, modding, planning, and research**, not at reproducing the in-game narrative experience.

---

## Features

- **Conversations / Player Choices**
  - Grouped by conversation
  - Conditions and effects merged into a single card per choice
  - Mutual exclusivity detection
  - Text export with optional conditions, effects, position, and mutual exclusivity details
  - Filters by speaker, DLC vs Base Game, consequential choices, narrator on/off, text search

- **Bills, Decisions, Decrees**
  - Mechanical effects and requirements
  - Base Game vs Rizia DLC filtering

- **Triggers / Events**
  - Conditional instruction logic
  - Periodic stat modifiers
  - Clear separation of conditions vs outcomes

- **Prologue & Global Panels**
  - Prologue origin choices
  - Budget, privatization, nationalization, and other global decision panels


---

## Run locally

Use Python 3 and a modern browser. Place the two game exports in the app's
`data/` directory, next to `index.html`:

- `data/Suzerain.txt.gz` or `data/Suzerain.txt` for Conversations (gzip is preferred when both exist)
- `data/Entity Text Asset.txt` for the other sections

The Git repository excludes the game exports. If your workspace has a separate
`data/` folder next to `Suzerain DB/`, the app does not read from that folder.

From inside `Suzerain DB`, run `./start.sh`. The launcher starts a local server
and opens the app in your default browser. Press Ctrl+C to stop the server.

To start the server manually, run this from inside `Suzerain DB`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the local app](http://127.0.0.1:8000/). Keep the server running while
you use the viewer. The Conversations page reads the dialogue export in the
background, and you can open the other sections while it loads.

---

## Legal / Disclaimer

Suzerain and all associated content are the property of their respective owners.

This project provides tools for inspecting and analyzing Suzerain game data.
For convenience, extracted text-based data files may be made available separately or within the repository with the rightfull owner's approval.

These files contain copyrighted material and are provided solely for
personal research, analysis, and educational purposes.

If you are the copyright holder and believe this distribution is inappropriate,
please contact the repository owner and the files will be removed.

This project is non-commercial and not affiliated with the developers or publishers of Suzerain.

---

## Status

This project is under active development and refactoring.  
Some sections may be incomplete or subject to redesign.

Expect rough edges.

