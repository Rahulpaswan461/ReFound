# ReFound MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 new-tab extension that resurfaces forgotten Chrome bookmarks, per the approved design.

**Architecture:** One-way `sync` mirror into IndexedDB, pure `recommend` logic, `core` operations that combine them, and a React `ui`. One HTML page with hash routes serves new tab, library, settings and welcome.

**Tech Stack:** TypeScript, Vite, React, Dexie, Vitest, fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-refound-design.md`

## Global Constraints

- Permissions exactly: `bookmarks`, `search`, `storage`, `unlimitedStorage`, `favicon`. No host permissions.
- Never call `chrome.bookmarks.create/update/move/remove` from product code.
- No network calls, analytics or remote code.
- Constants: minimum age 7 days, ignored cooldown 14 days, opened cooldown 90 days, age cap 365, default daily count 3 (range 1 to 5), default snooze 3 days, upload limit 10 MB.
- Score: `min(ageDays, 365) * 0.5 ** ignoredCount`.
- Commits happen only if the owner asks; the folder is not a Git repository.

## Review Focus

- Two tabs opening at once on a new day: exactly one selection and one ignored-count settle.
- A URL saved in both an excluded and an included folder: still eligible.
- A bookmark deleted or edited while it is a current pick: removed, or its history and slot follow it.
- A bookmark with an empty title: shows its domain.
- A tab left open past midnight, or Chrome unopened for days: refreshes to the new day, and only the last row settles, once.

---

### Task 1: Pure logic

**Files:** `src/shared/types.ts`, `src/shared/time.ts`, `src/sync/normalize.ts`, `src/recommend/select.ts`, `src/ui/parseInput.ts`, tests beside each; project config (`package.json`, `tsconfig.json`, `vite.config.ts`, `public/manifest.json`).

**Produces:**
- `normalizeUrl(url: string): string`, `isRecommendable(url: string): boolean`
- `dayKey(d: Date): string`, `savedAgo(dateAdded: number, now: number): string`
- `selectDaily(items: Candidate[], opts: {day, count, now, excludedFolderIds}): {urlKey, fallback}[]`
- `isEligible(c, opts)`, `scoreOf(c, now)`, `statusOf(history, now)`
- `parseInput(text): {kind:'url',url} | {kind:'search',text}`

- [ ] Write tests: normalization rules, every eligibility rule, score values, fallback oldest-first and age-only, deterministic ties, duplicate-folder inclusion.
- [ ] Run `npx vitest run`; expect failures.
- [ ] Implement; run; expect PASS.

### Task 2: Store, sync and core operations

**Files:** `src/store/db.ts`, `src/store/settings.ts`, `src/sync/reconcile.ts`, `src/sync/chromeSync.ts`, `src/core/daily.ts`, `src/core/actions.ts`, `src/core/stats.ts`, `src/background.ts`, tests.

**Consumes:** Task 1.

**Produces:**
- `reconcile(nodes): Promise<void>`; `fullReconcile()`; `listFolders()`
- `ensureToday(now?)`, `prepareToday(reconcile, now?)`
- `openBookmark`, `snooze`, `dismiss`, `undoDismiss`, `restore`, `clearReFoundData`
- `getStats()`

- [ ] Write tests: reconcile add/edit/move/delete, URL-edit history move, deleted-pick removal; stable picks, rollover settle, concurrent `ensureToday`, multi-day gap; each action's effect on history and slot; clear data.
- [ ] Run; expect failures.
- [ ] Implement. All Chrome events trigger a debounced full reconcile, paused during imports.
- [ ] Run; expect PASS.

### Task 3: User interface

**Files:** `newtab.html`, `src/ui/main.tsx`, `src/ui/App.tsx`, `src/ui/pages/{Home,Library,Settings,Welcome}.tsx`, `src/ui/components/*`, `src/ui/backgrounds.ts`, `src/ui/styles.css`, `public/wallpapers/*`, `public/icons/*`.

**Consumes:** Task 2.

- [ ] Build search first, wrapped so a storage failure cannot take it down.
- [ ] Build pick cards, library (paged rendering for 10,000 rows), settings, welcome, backgrounds and all empty and error states.
- [ ] Run `npm run build` and `npx tsc --noEmit`; expect no errors.

### Task 4: End-to-end verification

**Files:** `e2e/refound.spec.ts`, `playwright.config.ts`, `README.md`.

- [ ] Write Playwright flows from the spec's Testing section, including restart with the same profile and an unchanged Chrome bookmark tree.
- [ ] Run `npm run test:e2e`; expect PASS. Fix what fails.
- [ ] Inspect screenshots, then document load and test steps in `README.md`.
