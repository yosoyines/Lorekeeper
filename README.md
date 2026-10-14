# Lorekeeper

A Windows desktop app for building and organising AI companion characters — worlds, lorebooks, collections, personas, timelines and a posting schedule, all stored as plain files on your own machine.

Built around the Saucepan platform's export format, but the data is yours in plain JSON and markdown either way.

**No account, no server, no telemetry.** It reads and writes one folder and talks to nothing unless you set up a backup or plug in your own AI key.

---

## Install

Download the latest `Lorekeeper Setup x.y.z.exe` from [Releases](../../releases) and run it.

Two things to know on first run:

- **Windows SmartScreen will warn you.** The installer isn't code-signed, so Windows shows "Windows protected your PC". Click **More info → Run anyway**. If you'd rather not, build it yourself — see Development below.
- **Pick the install folder deliberately.** Your data is stored *next to the executable*, not in AppData. That is on purpose: a `Documents` or `AppData` default gets wiped by a Windows reinstall, and this app is meant to hold work you cannot re-download. Put it on a drive with room — images add up.

Windows only. There is no macOS or Linux build and no plan for one.

---

## What it does

**Worlds** hold everything else. Each has characters, lorebooks, collections, an image gallery, a timeline and its own notes.

**Characters** get a full sheet across eleven tabs — identity, description, the platform card, formatting instructions, scenarios, portraits, linked lorebooks and collections, settings, schedule, and a lorebook entry of their own. A token meter counts the card against the platform's real limits.

**Lorebooks** are organised into chapters, with export to the platform's format.

**Collections** group characters, with drag-to-reorder.

**Personas** are player characters, independent of any world.

**Timeline** places dated events on parallel strands, so a world with several running threads stays legible. Events can be ordered by real dates or by anything else — `Game 12`, `Summer, Year Two` — and it sorts sensibly either way.

**Dashboard** is a calendar of what is scheduled, what is drafted, what is ready to post, and what is still missing from each.

**Templates** are reusable character skeletons, global or per world.

**Tools panel** holds a name generator, dice, a colour picker that samples an image, a palette generator, and a handful of other small generators.

**Relationship map** draws the links between characters in a world.

**Notes** sit in a panel on the right, per world or global, and auto-save.

**AI assistant** is optional and brings your own key — Anthropic, OpenAI, Google, OpenRouter, or a local LM Studio server, which needs no key at all. Nothing leaves your machine unless you entered a key yourself and asked it to.

---

## Your data

Everything lives in the folder you installed into:

```
<install folder>\
  lorekeeper-data.json     the main file
  Companions\  Lorebooks\  Collections\
  Worlds\  Personas\  Templates\  Notes\
```

Per-item JSON and markdown files are written alongside the main file, so your work is readable and recoverable without this app. **Images are stored as file paths, not embedded**, which keeps the data file small enough to back up constantly.

The exact path is shown in **Settings**.

### Backup

Optional, and **None by default** — unconfigured, the app writes nothing outside its own folder. Three destinations in Settings → Backup:

- **GitHub** — text only, straight to a private repository over the API. No git install, no terminal. Needs a fine-grained token with `Contents: read and write` on that one repository and nothing else.
- **Google Drive, OneDrive or Dropbox** — through a bundled copy of [rclone](https://rclone.org), which owns the sign-in; the app never holds a cloud credential.
- **A folder** — another drive, a network share, or a folder some other sync client already watches.

Text only in every case. Images are excluded deliberately: they are re-downloadable, and including them turns a continuous backup into an occasional one. There is also a full export-to-ZIP, images and all, for when you want everything in one piece.

Credentials are encrypted by Windows and never written into the data file.

---

## Development

```
npm install
npm start
```

In development the data folder is hardcoded to `I:\Lorekeeper` in `src/main.js` — change `DATA_DIR` if you clone this. Packaged builds use the install folder instead.

```
npm run build
```

produces an NSIS installer in `dist\`. Requires an **Administrator** shell: the code-signing package contains macOS symlinks that Windows refuses to create otherwise.

The renderer is a single `src/index.html` — React and Babel from a CDN, no bundler, no build step for the UI. **The CDN versions are pinned on purpose**; a newer Tabler Icons breaks under Electron. Three source files in total: `main.js`, `preload.js`, `index.html`.

To bundle the cloud backup, place a Windows `rclone.exe` from [rclone.org/downloads](https://rclone.org/downloads/) at `vendor\rclone\rclone.exe` before building. Without it the app runs fine and the cloud option says it is unavailable.

---

## Scope, honestly

This is one person's tool, built for one person's workflow, shared because it may be useful to someone with the same problem. It is not a product. There is no support, no roadmap promises, and no guarantee the next version keeps anything you relied on.

It does not delete anything outside its own folders, it keeps a last-known-good copy of your data, and it has never lost any of mine. Keep your own backups anyway.
