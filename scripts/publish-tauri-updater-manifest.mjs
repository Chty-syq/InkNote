import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(scriptPath), '..');

function releaseAssetNames(assets) {
  return assets.map((asset) => asset.name).filter(Boolean).join(', ');
}

function findSignatureAsset(assets, bundle, fallbackPattern) {
  return (
    assets.find((asset) => asset.name === `${bundle.name}.sig`) ??
    assets.filter((asset) => fallbackPattern.test(asset.name ?? '')).sort((left, right) =>
      left.name.localeCompare(right.name),
    )[0]
  );
}

export function resolveUpdaterAssets(releaseAssets) {
  const assets = releaseAssets.filter(
    (asset) =>
      asset &&
      typeof asset.name === 'string' &&
      typeof asset.browser_download_url === 'string' &&
      asset.browser_download_url,
  );
  const windowsCandidates = assets
    .filter((asset) => /\.exe$/i.test(asset.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const windowsInstaller =
    windowsCandidates.find((asset) => /(setup|installer|x64|x86_64)/i.test(asset.name)) ??
    windowsCandidates[0];
  const linuxAppImage = assets
    .filter((asset) => /\.AppImage$/i.test(asset.name))
    .sort((left, right) => left.name.localeCompare(right.name))[0];

  if (!windowsInstaller) {
    throw new Error(`No Windows NSIS installer was found. Assets: ${releaseAssetNames(assets)}`);
  }
  if (!linuxAppImage) {
    throw new Error(`No Linux AppImage was found. Assets: ${releaseAssetNames(assets)}`);
  }

  const windowsSignature = findSignatureAsset(assets, windowsInstaller, /\.exe\.sig$/i);
  const linuxSignature = findSignatureAsset(assets, linuxAppImage, /\.AppImage\.sig$/i);
  if (!windowsSignature) {
    throw new Error(
      `No signature matching ${windowsInstaller.name} was found. Assets: ${releaseAssetNames(assets)}`,
    );
  }
  if (!linuxSignature) {
    throw new Error(
      `No signature matching ${linuxAppImage.name} was found. Assets: ${releaseAssetNames(assets)}`,
    );
  }

  return { windowsInstaller, windowsSignature, linuxAppImage, linuxSignature };
}

export function createUpdaterManifest({ version, notes, pubDate, assets, signatures }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      'windows-x86_64': {
        signature: signatures.windows,
        url: assets.windowsInstaller.browser_download_url,
      },
      'linux-x86_64': {
        signature: signatures.linux,
        url: assets.linuxAppImage.browser_download_url,
      },
    },
  };
}

function parseArguments(argv) {
  const options = {
    repository: process.env.GITHUB_REPOSITORY ?? '',
    token: process.env.GITHUB_TOKEN ?? '',
    configPath: 'apps/desktop/src-tauri/tauri.conf.json',
    releaseNotes: 'Download the Windows NSIS installer or Linux AppImage/deb package below.',
  };
  const mappings = {
    '--repository': 'repository',
    '--config': 'configPath',
    '--release-notes': 'releaseNotes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [name, inlineValue] = argument.split('=', 2);
    const option = mappings[name];
    if (!option) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = inlineValue ?? argv[++index];
    if (!value) {
      throw new Error(`Missing value for ${name}`);
    }
    options[option] = value;
  }

  return options;
}

async function request(url, { method = 'GET', token, body, contentType } = {}) {
  const response = await fetch(url, {
    method,
    redirect: 'follow',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'InkNote release workflow',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body,
  });
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 500);
    throw new Error(`${method} ${url} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response;
}

async function downloadSignature(asset, token) {
  const response = await request(asset.browser_download_url, { token });
  const signature = (await response.text()).trim();
  if (!signature) {
    throw new Error(`Signature asset is empty: ${asset.name}`);
  }
  return signature;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!/^[^/]+\/[^/]+$/.test(options.repository)) {
    throw new Error('Missing or invalid GitHub repository. Set GITHUB_REPOSITORY to owner/name.');
  }
  if (!options.token) {
    throw new Error('Missing GitHub token. Set GITHUB_TOKEN.');
  }

  const configPath = path.resolve(workspaceRoot, options.configPath);
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const version = String(config.version ?? '').trim();
  if (!version) {
    throw new Error(`Tauri version is missing in ${options.configPath}`);
  }

  const apiBase = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const tagName = `v${version}`;
  const releaseUrl = `${apiBase}/repos/${options.repository}/releases/tags/${encodeURIComponent(tagName)}`;
  process.stdout.write(`Preparing updater manifest for ${options.repository}@${tagName}\n`);
  const release = await (await request(releaseUrl, { token: options.token })).json();
  const releaseAssets = Array.isArray(release.assets) ? release.assets : [];
  const assets = resolveUpdaterAssets(releaseAssets);
  const [windowsSignature, linuxSignature] = await Promise.all([
    downloadSignature(assets.windowsSignature, options.token),
    downloadSignature(assets.linuxSignature, options.token),
  ]);
  const pubDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifest = createUpdaterManifest({
    version,
    notes: options.releaseNotes,
    pubDate,
    assets,
    signatures: { windows: windowsSignature, linux: linuxSignature },
  });
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  for (const asset of releaseAssets.filter((candidate) => candidate.name === 'latest.json')) {
    const assetUrl =
      asset.url ?? `${apiBase}/repos/${options.repository}/releases/assets/${encodeURIComponent(asset.id)}`;
    process.stdout.write(`Replacing existing latest.json asset: ${asset.id}\n`);
    await request(assetUrl, { method: 'DELETE', token: options.token });
  }

  const uploadBase = String(release.upload_url ?? '').replace(/\{\?name,label\}$/, '');
  if (!uploadBase) {
    throw new Error(`Release ${tagName} does not provide an upload URL.`);
  }
  await request(`${uploadBase}?name=latest.json`, {
    method: 'POST',
    token: options.token,
    contentType: 'application/json',
    body: manifestBytes,
  });

  process.stdout.write(`Published latest.json for ${tagName}\n`);
  process.stdout.write(`Windows updater: ${assets.windowsInstaller.name}\n`);
  process.stdout.write(`Linux updater: ${assets.linuxAppImage.name}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
