# Publishing

InkNote keeps desktop releases and blog deployments independent.

## Blog deployment

Configure these fields in the desktop application's publishing settings:

- Repository: the Git remote used only for the deployed blog, such as `git@github.com:user/blog.git`.
- Branch: the generated deployment branch, normally `gh-pages`.
- Base path: `/` for a user site or custom domain, and `/repository/` for a project site.
- Pages URL: the final public address shown in the editor.

The installer contains a precompiled Web shell. Publishing generates `inknote-content.json` from the local content workspace, overlays local public images, creates a temporary Git worktree, mirrors the static output, preserves an existing `CNAME`, commits the result, and pushes with `--force-with-lease`. Publishing does not require Node.js or the editor source repository.

The deployment branch must be dedicated to generated files. `main` and `master` are rejected to prevent accidental replacement of source code.

Configure the target repository's GitHub Pages source as **Deploy from a branch**, select the configured branch, and use the repository root (`/`). Authentication is delegated to Git Credential Manager or SSH; credentials must not be embedded in `site.config.json`.

## Desktop releases

Desktop releases are created by `.github/workflows/release-desktop.yml` when a `v*` tag is pushed. Before tagging, keep these versions identical:

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/package.json`

Use the version script instead of editing these files manually:

```powershell
npm run desktop:version -- patch
```

Replace `patch` with `minor`, `major`, or an explicit version such as `0.2.0`. Run `npm run desktop:version -- --check` to verify that all desktop version files and lock files agree.

By default the script updates the version files, creates a release commit, creates the matching `v*` tag, and atomically pushes the current branch and tag to `origin`. It refuses to run when version files are already dirty or when the Git index contains staged work, preventing unrelated changes from entering the release commit. Use `--dry-run` to preview the release or `--no-git` to update version files without committing, tagging, or pushing.

For example, `npm run desktop:version -- 0.2.0` publishes the version commit and `v0.2.0` tag. The workflow then creates a public GitHub Release containing the Windows installer and updater metadata.

### Desktop auto-updates

The desktop updater uses Tauri's signed update flow. Generate an updater key once and keep the private key out of the repository:

```powershell
npm run desktop:tauri -- signer generate
```

Add these GitHub repository secrets before publishing an auto-updatable release:

- `TAURI_UPDATER_PUBKEY`: the public key printed by the signer command.
- `TAURI_SIGNING_PRIVATE_KEY`: the private key printed by the signer command.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the signer password, if one was configured. Leave it unset when the key has no password.

Copy only the key value itself. Do not include labels such as `Public key:` or `Private key:`, quotes, Markdown code fences, spaces, or line breaks. Keep any trailing `=` padding characters. If GitHub Actions reports `Invalid padding`, regenerate the key and replace `TAURI_SIGNING_PRIVATE_KEY` with the exact private key value.

During the release workflow, `scripts/configure-tauri-updater.mjs` injects the public key into the temporary CI copy of `tauri.conf.json` and enables updater artifact generation. The built application checks `https://github.com/Chty-syq/InkNote/releases/latest/download/latest.json`, downloads the signed NSIS update, installs it, and relaunches the app.

Only versions built after the updater integration can update themselves automatically. Older installed versions must be upgraded once manually from GitHub Releases.
