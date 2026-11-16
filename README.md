# Suzerain – Database

A local browser-based viewer for the **Suzerain** base game and **Kingdom of Rizia** DLC. Browse game dialogue and inspect the conditions and effects behind player choices, decisions, and events.

## Run locally

Install Python 3 and use a modern browser with gzip decompression support.
The repository includes the exports needed to run the viewer:

| File | Used by |
| --- | --- |
| `data/Suzerain.txt.gz` | Conversations |
| `data/Entity Text Asset.txt` | The other seven sections |

The viewer also accepts a local `data/Suzerain.txt` when the gzip file is
absent.

Run the bundled launcher from the repository folder:

```sh
./start.sh
```

On Windows, run this from PowerShell in the repository folder:

```powershell
.\start.ps1
```

The launcher starts a server on an available local port and opens the app.
If the browser doesn't open, use the URL printed in the terminal. Keep the
terminal open while using the viewer and press Ctrl+C to stop the server.

You can also start the server manually:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [the local app](http://127.0.0.1:8000/). Conversations loads in the
background while you browse other sections.

## Features

- **Conversations** groups alternatives under a nearby dialogue prompt when available. Each card shows its conditions and effects. Expand a group to see alternatives hidden by filters. Filter by speaker, game, consequential choices, narration, and text. Export matching dialogue with optional conditions, effects, node positions, and alternative IDs.
- **Bills, Decisions, and Decrees** show requirements and mechanical effects. Decision options are grouped under their decision.
- **Triggers and Events** show when conditional instructions are checked and what they can do.
- **News and Reports** show articles and reports with their conditions.
- **Situations and Policies** show the conditions and effects attached to policy and situation entries.
- **Prologue and Global Panels** show origin choices and options for panels such as budget, privatization, and nationalization.

## Legal / Disclaimer

Suzerain and all associated content are the property of their respective owners.

This project provides tools for inspecting and analyzing Suzerain game data.
The included game exports contain copyrighted material and are provided for
personal research, analysis, and educational purposes.

If you are the copyright holder and believe this distribution is inappropriate,
please contact the repository owner and the files will be removed.

This project is non-commercial and not affiliated with the developers or publishers of Suzerain.

---

## Status

This project is under active development and refactoring.  
Some sections may be incomplete or subject to redesign.

Expect rough edges.

