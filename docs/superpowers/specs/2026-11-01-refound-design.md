# ReFound MVP Design

Date: 2026-11-01
Status: awaiting approval

## Intent

ReFound is a Chrome extension that replaces the new-tab page and brings forgotten
Chrome bookmarks back into view. It is not a bookmark manager. The target reaction
is: "I completely forgot I saved this. I'm glad it showed up again."

Saving is easy; remembering to revisit is hard. Users keep bookmarking as they do
today, and ReFound handles the rest.

## Goals

- Work as a natural new-tab replacement, including search and URL navigation.
- Show a small, stable daily set of forgotten bookmarks.
- Support Read Now, Remind Later, Dismiss and Restore.
- Provide a searchable library, preferences and background personalization.
- Be reliable enough to use daily with real bookmarks.
- Keep all data local.

## Non-goals

No backend, accounts, cloud storage or sync, AI features, vector search, payments,
mobile apps, or private X / YouTube Watch Later integrations. Web Store listing
assets are deferred, but permissions and behavior must stay within Web Store rules.

## Anti-goals

The product has failed, even if it technically works, if it:

- changes or deletes a Chrome bookmark without an explicit user action
- reshuffles picks between tabs, or nags
- sends bookmark data off the device
- slows down opening a new tab
- treats opening a link as proof it was read

## Audience for this version

The owner first, loaded unpacked into their own Chrome. Store-ready later.

## Decisions by the product owner

- After an action, a daily slot stays empty and is not replaced until tomorrow.
- Bookmarks must be at least 7 days old, with a fallback when none qualify.
- First-run setup lists all folders ticked; users untick what they don't want.
- This version is for the owner first, with Store work later.

## Builder's calls (open to change)

- Stack: Manifest V3, TypeScript, Vite, React, Dexie over IndexedDB.
- Tests: Vitest for logic, Playwright with the extension loaded in Chromium for flows.
- Read Now opens in the current tab.
- Bookmark access is a manifest permission granted at install, not a runtime prompt.
- Image wallpapers ship inside the extension; no external image services.
- ReFound history is per-device and is not synced.
- Daily picks: default 3, configurable 1 to 5.
- Default snooze: 3 days.
- Cooldowns: 14 days after shown and ignored, 90 days after opened.
- Custom wallpaper upload limit: 10 MB per image.

## Architecture

Four separated parts:

- `sync`: one-way mirror of Chrome bookmarks. Never calls a bookmark write API.
- `recommend`: pure functions with no Chrome or storage imports.
- `store`: Dexie for bookmarks, history, daily picks and wallpapers;
  `chrome.storage.local` for settings.
- `ui`: new tab, library, settings and first-run setup.

A background service worker handles bookmark events. Permissions: `bookmarks`,
`search`, `storage`, `unlimitedStorage`, `favicon`. No host permissions.

## Bookmark sync

- Full import on install.
- Live handling of created, removed, changed and moved events.
- During bulk imports, ignore individual events and run one full reconcile at the end.
- Run a full reconcile on browser startup and on the first new tab of a day, to catch
  anything missed.
- Mirror rows are keyed by Chrome ID. History is keyed by normalized URL, so it
  survives deletion and re-adding, and a bookmark saved in two folders is one item.
- URL normalization: lowercase scheme and host, drop default ports and a trailing
  slash. Keep the query string and fragment.
- When a bookmark's URL is edited, its history follows it to the new URL.
- Only `http` and `https` bookmarks can be recommended. Others (such as `javascript:`
  or `chrome://`) appear in the library only.
- `dateAdded` comes from Chrome.

## Daily selection

Runs once per local calendar day, when the first new tab opens.

**Eligible** means all of:

- not dismissed
- snooze has expired or none is set
- in at least one included folder
- `http` or `https`
- outside any cooldown
- at least 7 days old

**Fallback:** if fewer items qualify than the daily count, fill the remainder from
items younger than 7 days, oldest first. The fallback relaxes age only, never any
other rule.

**Score:** `min(ageDays, 365) × 0.5^ignoredCount`, highest first. Ties are broken by
a hash of date plus URL. This is deterministic and easy to explain and test.

`ignoredCount` rises by one when a bookmark was shown on a day and received no action.
It resets when the user opens or snoozes the bookmark, or restores it.

The result is saved with the date. All tabs that day read the saved list, including
after a browser restart. Changing settings does not regenerate today's list, except:

- a pick whose bookmark is deleted from Chrome is removed
- turning recommendations off hides them

## Actions

| Action | Effect |
|---|---|
| Read Now | Opens in the current tab, records the open and start of the 90-day cooldown, empties the slot. Never marks it as read. |
| Remind Later | Tomorrow, 3 days, next week, or a custom date. Empties the slot. Eligible again at the first selection after that date. |
| Dismiss | Excluded from recommendations, stays in Chrome, restorable from the library. Empties the slot. |
| Restore | Clears dismissed status and ignored count. Eligible from the next daily selection. |

Dismiss offers a brief undo. A snooze expiring mid-day does not change today's list.

## New-tab page

- Search box focused on load. URL-like input navigates directly; everything else goes
  through `chrome.search.query`, which uses the user's default engine.
- Pick cards show title, domain, favicon, and how long ago it was saved, for example
  "You saved this three weeks ago."
- A short line shows why it was picked, or that it is a newer save (fallback).
- Links to library and settings.
- Text stays readable over any background.

## Library

Lists all bookmarks with title or URL search, folder and status filters, and sorting
by date saved, title, or last shown. Status filters: all, eligible, opened through
ReFound, snoozed, dismissed. Row actions: open, snooze, dismiss, restore. Must stay
responsive with 10,000 bookmarks.

Opening a bookmark from the library counts as opened through ReFound.

## Settings

- Daily count, show or hide recommendations, default snooze
- Included and excluded folders
- Backgrounds: solid, gradient, bundled image, uploaded image; fixed or daily random
- Local stats: resurfaced count, percent opened, snoozed, dismissed, days active
- Clear ReFound data, with confirmation. Never touches Chrome bookmarks.

New folders are included by default.

## First run

Opens once after install: a short explanation, then the folder list with all ticked.
Picks appear immediately after setup rather than waiting a day.

## Empty and error states

- No bookmarks: explain how to start, with search still working.
- All folders excluded: link to settings.
- Nothing eligible: a calm "nothing to resurface today."
- All picks acted on: a calm "done for today."
- Recommendations off: search-only page.
- Storage failure: search still works and picks show a recoverable message.
- Search and URL navigation must render even if everything else fails.

## Privacy

No analytics, network calls or remote code. Favicons come from Chrome's local cache
through the `favicon` permission. Wallpapers are bundled or user-uploaded and stored
locally. Stats stay on the device.

## Testing

- Unit: normalization, eligibility, scoring, fallback, ignored count, snooze expiry,
  cooldowns, day rollover, daily lock, and sync reconciliation.
- End-to-end (Playwright, Chromium with the extension loaded): first run, stable picks
  across tabs and restart, all four actions, bookmark add, edit, move and delete,
  library, settings, clear data, and confirming the Chrome bookmark tree is unchanged.
- Manual: load unpacked in Chrome with real bookmarks.

## Measuring success

Whether the owner keeps it and opens picks after a few weeks of use, and whether
resurfaced items feel useful. Numbers come from the local stats panel; open rate is a
signal, not proof of value.

## Left to the builder

File layout, component structure, visual design details (subject to owner review),
wallpaper selection, and the exact wording of copy.
