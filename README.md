# InkNote Monorepo

InkNote now uses a monorepo structure with two content types:

- `markdown`: regular notes, project writeups, and static pages
- `inknote`: blog entries linked to handwritten notebook projects

## Workspace Layout

- `apps/web`: static React blog frontend for GitHub Pages
- `apps/desktop`: Tauri desktop editor for markdown and inknote content
- `packages/content-schema`: shared content and site config types
- `packages/site-builder`: frontmatter parsing and shared site-building helpers
- `packages/inknote-core`: notebook rendering, export, and project helpers
- `content/markdown`: markdown entries
- `content/inknotes`: inknote entries linked to `notebook.inknote.json`

## Commands

```powershell
npm.cmd install
```

Start the web app:

```powershell
npm.cmd run web:dev
```

Start the desktop editor:

```powershell
npm.cmd run desktop:dev
```

Start the Tauri desktop shell:

```powershell
npm.cmd run desktop:tauri:dev
```

Build everything:

```powershell
npm.cmd run build
```
