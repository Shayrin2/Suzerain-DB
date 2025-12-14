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

