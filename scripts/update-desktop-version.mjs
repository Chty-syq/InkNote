import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const files = {
  desktopPackage: path.join(workspaceRoot, 'apps/desktop/package.json'),
  tauriConfig: path.join(workspaceRoot, 'apps/desktop/src-tauri/tauri.conf.json'),
  cargoManifest: path.join(workspaceRoot, 'apps/desktop/src-tauri/Cargo.toml'),
  cargoLock: path.join(workspaceRoot, 'apps/desktop/src-tauri/Cargo.lock'),
  packageLock: path.join(workspaceRoot, 'package-lock.json'),
};
const versionGitPaths = Object.values(files).map((filePath) =>
  path.relative(workspaceRoot, filePath).replaceAll('\\', '/'),
);

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function fail(message) {
  process.stderr.write(`Version update failed: ${message}\n`);
  process.exit(1);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`cannot read ${path.relative(workspaceRoot, filePath)}: ${error.message}`);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    fail(`cannot parse ${path.relative(workspaceRoot, filePath)}: ${error.message}`);
  }
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    fail(`cannot run git ${args.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || `exit code ${result.status}`).trim();
    fail(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result;
}

function prepareGitRelease(nextVersion) {
  const repositoryCheck = runGit(['rev-parse', '--is-inside-work-tree']);
  if (repositoryCheck.stdout.trim() !== 'true') {
    fail('the workspace is not a Git repository');
  }

  const branch = runGit(['branch', '--show-current']).stdout.trim();
  if (!branch) {
    fail('cannot release from a detached HEAD');
  }
  const stagedFiles = runGit(['diff', '--cached', '--name-only']).stdout.trim();
  if (stagedFiles) {
    fail(`the Git index already contains staged changes:\n${stagedFiles}`);
  }
  const dirtyVersionFiles = runGit(['status', '--porcelain', '--', ...versionGitPaths]).stdout.trim();
  if (dirtyVersionFiles) {
    fail(`version files already contain uncommitted changes:\n${dirtyVersionFiles}`);
  }

  runGit(['remote', 'get-url', 'origin']);
  const tag = `v${nextVersion}`;
  const localTag = runGit(['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`], { allowFailure: true });
  if (localTag.status === 0) {
    fail(`local tag ${tag} already exists`);
  }
  const remoteTag = runGit(
    ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`],
    { allowFailure: true },
  );
  if (remoteTag.status === 0) {
    fail(`remote tag ${tag} already exists`);
  }
  if (remoteTag.status !== 2) {
    const detail = (remoteTag.stderr || remoteTag.stdout || `exit code ${remoteTag.status}`).trim();
    fail(`cannot inspect remote tags: ${detail}`);
  }

  return { branch, tag };
}

function publishGitRelease({ branch, tag }, nextVersion) {
  runGit(['add', '--', ...versionGitPaths]);
  const stagedDiff = runGit(['diff', '--cached', '--quiet'], { allowFailure: true });
  if (stagedDiff.status === 0) {
    fail('version update produced no staged changes');
  }
  if (stagedDiff.status !== 1) {
    fail(`cannot inspect staged version changes (exit code ${stagedDiff.status})`);
  }

  runGit(['commit', '-m', `chore: release v${nextVersion}`]);
  runGit(['tag', '-a', tag, '-m', `InkNote ${tag}`]);
  runGit([
    'push',
    '--atomic',
    'origin',
    `HEAD:refs/heads/${branch}`,
    `refs/tags/${tag}:refs/tags/${tag}`,
  ]);
  process.stdout.write(`Published ${tag} to origin/${branch}.\n`);
}

function extractMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    fail(`cannot find ${label}`);
  }
  return match[1];
}

function readVersions() {
  const desktopPackage = readJson(files.desktopPackage);
  const tauriConfig = readJson(files.tauriConfig);
  const cargoManifest = readText(files.cargoManifest);
  const cargoLock = readText(files.cargoLock);
  const packageLock = readJson(files.packageLock);

  return {
    desktopPackage: desktopPackage.version,
    tauriConfig: tauriConfig.version,
    cargoManifest: extractMatch(
      cargoManifest,
      /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
      'the package version in apps/desktop/src-tauri/Cargo.toml',
    ),
    cargoLock: extractMatch(
      cargoLock,
      /\[\[package\]\]\r?\nname = "inknote-desktop"\r?\nversion = "([^"]+)"/,
      'the inknote-desktop version in apps/desktop/src-tauri/Cargo.lock',
    ),
    packageLock: packageLock.packages?.['apps/desktop']?.version,
  };
}

function assertVersionsMatch(versions) {
  const entries = Object.entries(versions);
  const missing = entries.filter(([, version]) => typeof version !== 'string' || !version);
  if (missing.length > 0) {
    fail(`missing version in: ${missing.map(([name]) => name).join(', ')}`);
  }

  const uniqueVersions = new Set(entries.map(([, version]) => version));
  if (uniqueVersions.size !== 1) {
    const details = entries.map(([name, version]) => `${name}=${version}`).join(', ');
    fail(`desktop versions are inconsistent (${details})`);
  }

  return entries[0][1];
}

function normalizeVersion(value) {
  const normalized = value.startsWith('v') ? value.slice(1) : value;
  if (!semverPattern.test(normalized)) {
    fail(`"${value}" is not a valid semantic version`);
  }
  return normalized;
}

function bumpVersion(currentVersion, releaseType) {
  const match = currentVersion.match(semverPattern);
  if (!match) {
    fail(`current version "${currentVersion}" is not valid semantic versioning`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (releaseType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (releaseType === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    fail(`cannot update ${label}`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function serializeJson(value, original) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  return `${JSON.stringify(value, null, 2).replaceAll('\n', newline)}${newline}`;
}

function buildUpdates(nextVersion) {
  const desktopPackageSource = readText(files.desktopPackage);
  const tauriConfigSource = readText(files.tauriConfig);
  const cargoManifestSource = readText(files.cargoManifest);
  const cargoLockSource = readText(files.cargoLock);
  const packageLockSource = readText(files.packageLock);

  const desktopPackage = JSON.parse(desktopPackageSource);
  desktopPackage.version = nextVersion;
  const tauriConfig = JSON.parse(tauriConfigSource);
  tauriConfig.version = nextVersion;
  const packageLock = JSON.parse(packageLockSource);
  if (!packageLock.packages?.['apps/desktop']) {
    fail('cannot find packages["apps/desktop"] in package-lock.json');
  }
  packageLock.packages['apps/desktop'].version = nextVersion;

  const cargoManifestPattern = /(^\[package\][\s\S]*?^version\s*=\s*")[^"]+("$)/m;
  const cargoLockPattern = /(\[\[package\]\]\r?\nname = "inknote-desktop"\r?\nversion = ")[^"]+(")/;

  return new Map([
    [files.desktopPackage, serializeJson(desktopPackage, desktopPackageSource)],
    [files.tauriConfig, serializeJson(tauriConfig, tauriConfigSource)],
    [
      files.cargoManifest,
      replaceRequired(
        cargoManifestSource,
        cargoManifestPattern,
        `$1${nextVersion}$2`,
        'apps/desktop/src-tauri/Cargo.toml',
      ),
    ],
    [
      files.cargoLock,
      replaceRequired(
        cargoLockSource,
        cargoLockPattern,
        `$1${nextVersion}$2`,
        'apps/desktop/src-tauri/Cargo.lock',
      ),
    ],
    [files.packageLock, serializeJson(packageLock, packageLockSource)],
  ]);
}

function printHelp() {
  process.stdout.write(`
Update every InkNote desktop version in one command.

Usage:
  npm run desktop:version -- patch
  npm run desktop:version -- minor
  npm run desktop:version -- major
  npm run desktop:version -- 0.2.0
  npm run desktop:version -- patch --dry-run
  npm run desktop:version -- patch --no-git
  npm run desktop:version -- --check

By default the script updates files, commits them, creates a version tag, and
atomically pushes the current branch and tag to origin. Use --no-git to update
version files only.
`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const versions = readVersions();
const currentVersion = assertVersionsMatch(versions);
if (args.includes('--check')) {
  process.stdout.write(`Desktop versions are consistent: ${currentVersion}\n`);
  process.exit(0);
}

const targetArgument = args.find((argument) => !argument.startsWith('--'));
if (!targetArgument) {
  printHelp();
  fail('provide major, minor, patch, or an explicit version');
}

const nextVersion = ['major', 'minor', 'patch'].includes(targetArgument)
  ? bumpVersion(currentVersion, targetArgument)
  : normalizeVersion(targetArgument);
if (nextVersion === currentVersion) {
  process.stdout.write(`Desktop version is already ${currentVersion}; no files changed.\n`);
  process.exit(0);
}

const updates = buildUpdates(nextVersion);
const dryRun = args.includes('--dry-run');
const noGit = args.includes('--no-git');
const gitRelease = !dryRun && !noGit ? prepareGitRelease(nextVersion) : null;
for (const [filePath, contents] of updates) {
  const relativePath = path.relative(workspaceRoot, filePath).replaceAll('\\', '/');
  process.stdout.write(`${dryRun ? 'Would update' : 'Updated'} ${relativePath}\n`);
  if (!dryRun) {
    fs.writeFileSync(filePath, contents, 'utf8');
  }
}

process.stdout.write(`\nDesktop version: ${currentVersion} -> ${nextVersion}\n`);
if (dryRun) {
  process.stdout.write(
    noGit
      ? 'Dry run complete; Git operations are disabled.\n'
      : `Would commit, create tag v${nextVersion}, and atomically push both the current branch and tag to origin.\n`,
  );
} else if (gitRelease) {
  publishGitRelease(gitRelease, nextVersion);
} else {
  process.stdout.write('Version files updated; Git operations were skipped.\n');
}
