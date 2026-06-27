# InkNote

InkNote is a personal writing system built around a static blog and a local desktop editor. It keeps the public site deployable on GitHub Pages while letting the editor manage the content library, Markdown posts, InkNote handwritten notebooks, media assets, publishing, and desktop releases from one workspace.

## What It Includes

- A Tauri + React desktop editor for daily writing and site management.
- A static React blog frontend that can be deployed to GitHub Pages.
- Two first-class note types: `markdown` and `inknote`.
- InkNote notebook rendering for handwritten-style pages.
- Markdown preview with KaTeX math, code blocks, raw HTML, images, and slides/PDF embeds.
- Local content storage under `content/`, with publish/pull workflows for a remote deployment repository.
- Site settings for categories, friend links, comments, read statistics, gallery images, and publishing.
- Giscus comments and GoatCounter tracking support.
- Desktop release automation with Tauri updater artifacts.

## Workspace Layout

```text
apps/
  desktop/          Tauri desktop editor
  web/              Static React blog frontend
content/
  markdown/         Markdown posts and pages
  inknotes/         InkNote blog entries and notebook projects
  site/             Site config, navigation, and categories
packages/
  content-schema/   Shared content and site config types
  inknote-core/     Notebook rendering and project helpers
  site-builder/     Markdown/frontmatter parsing helpers
scripts/            Release, gallery, and build helper scripts
docs/               Design and publishing notes
```

## Content Model

InkNote currently uses two content types.

`markdown` entries are regular blog posts, pages, and technical notes. They live under:

```text
content/markdown/<slug>/index.md
```

`inknote` entries are blog entries linked to a notebook project. They live under:

```text
content/inknotes/<slug>/index.md
content/inknotes/<slug>/notebook.inknote.json
```

During site publishing, the desktop editor packages the content library into `inknote-content.json`. The deployment repository does not need to contain the raw `content/` directory.

## Setup

Install dependencies:

```powershell
npm.cmd install
```

Start the web app:

```powershell
npm.cmd run web:dev
```

Start the desktop editor frontend:

```powershell
npm.cmd run desktop:dev
```

Start the Tauri desktop shell:

```powershell
npm.cmd run desktop:tauri:dev
```

Build the web app:

```powershell
npm.cmd run web:build
```

Build the desktop frontend:

```powershell
npm.cmd run desktop:build
```

Build everything:

```powershell
npm.cmd run build
```

## Desktop Editor

The desktop editor is the main authoring surface. It supports:

- Category management with ordering.
- Markdown and InkNote creation.
- Markdown editing with live preview.
- InkNote editing with notebook-style preview.
- Metadata editing for title, tags, publish state, and create date.
- Local image paste/import and external image localization.
- Gallery management for blog card covers.
- Site settings, comment settings, statistics settings, and publishing settings.
- Pulling remote content back into the local library with conflict strategy selection.

## Web Blog

The web app is a static SPA. It renders:

- Category listing pages.
- Article detail pages.
- InkNote handwritten notebook pages.
- Archive and search pages.
- Table of contents on article pages.
- Tag cloud, search, and friend links.
- Giscus comments when configured.
- GoatCounter pageview tracking when configured.

For GitHub Pages project sites, the publishing flow automatically derives the base path from the configured remote repository.

## Publishing The Site

Configure the deployment repository and branch in the desktop editor settings, then use the editor's publish button.

The publish flow:

1. Saves the current note and site settings.
2. Rebuilds the web shell when running from a source workspace.
3. Packages `content/` into `inknote-content.json`.
4. Copies public assets such as images, gallery files, slides, and generated resources.
5. Commits the static artifact to the configured deployment branch.
6. Pushes the branch to the configured remote.

The deployment branch is intended to be served directly by GitHub Pages.

See [docs/publishing.md](docs/publishing.md) for more details.

## Comments And Statistics

Comments are powered by Giscus. Configure the repo, category, and IDs in the desktop editor settings.

Pageview tracking is powered by GoatCounter. The site loads GoatCounter's tracking script for counting visits. Direct browser-side reads from GoatCounter's counter API are not reliable on GitHub Pages because of CORS, so long-term read-count display should be handled through a published stats snapshot or another same-origin source.

## Images And Gallery

The editor can track internal and external images referenced by notes. External images can be downloaded into local public assets and references can be rewritten automatically.

The gallery is stored under the web public assets and can be used to assign non-repeating cover images to article cards. If there are fewer gallery images than posts, unmatched posts simply render without a cover.

## Desktop Releases

Version files are kept in sync by:

```powershell
npm.cmd run desktop:version -- patch
```

You can also pass `minor`, `major`, or an explicit version such as `0.2.0`.

By default, the version script updates version files, creates a commit and tag, and pushes both to `origin`. The GitHub release workflow builds the Windows installer and updater metadata from the tag.

Updater signing requires the GitHub secrets used by Tauri:

- `TAURI_UPDATER_PUBKEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The desktop editor checks Tauri updater metadata first, then falls back to GitHub Releases so manual updates are still discoverable when automatic update metadata is unavailable.

## Useful Commands

```powershell
npm.cmd run web:dev
npm.cmd run web:build
npm.cmd run desktop:dev
npm.cmd run desktop:build
npm.cmd run desktop:tauri:dev
npm.cmd run desktop:version -- patch
```

## Notes

- The repository is private workspace code, but the generated web output is designed for static hosting.
- Published web content is generated from `content/`; the raw source content does not have to be pushed to the deployment branch.
- If frontend source code changes, rebuild the web shell before publishing. The desktop publishing flow does this automatically when it is running from the source workspace.
