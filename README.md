# Suzerain – Database

A local, browser-based database viewer for **Suzerain** (Base Game + Rizia DLC), designed to inspect dialogue choices, conditions, effects, triggers, decisions, decrees, and other mechanical systems extracted from the game files.

This tool is aimed at **analysis, modding, planning, and research**, not at reproducing the in-game narrative experience.

---

## Features

- **Conversations / Player Choices**
  - Grouped by conversation
  - Conditions and effects merged into a single card per choice
  - Mutual exclusivity detection
  - Filters by speaker (not yet implemented), DLC vs Base Game, consequential choices, narrator on/off, text search

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

## Requirements

This repository **does not include Suzerain.txt** as it is too big (560MB) for GitHub.

I will provide a way for the full file to be downloaded; or I'll split the file in 90MB chunks with a script provided to reconstruct it as a single file.

For legal reasons, I may also have to forgo this approach and instead opt to make a script which extracts the data directly from your game's folders.

Otherwise, once the project is complete I am opened to hosting a permanent web-site instead of the "local" format.

The file can be downloaded from here : https://fileport.io/k7vq6Y6MpLGV

And must be placed inside of /data.

---

## Legal / Disclaimer

Suzerain and all associated content are the property of their respective owners.

This project provides tools for inspecting and analyzing Suzerain game data.
For convenience, extracted text-based data files may be made available separately or within the repository.

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

