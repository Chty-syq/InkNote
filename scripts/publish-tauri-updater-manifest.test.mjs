import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUpdaterManifest,
  resolveUpdaterAssets,
} from './publish-tauri-updater-manifest.mjs';

function asset(name) {
  return {
    name,
    browser_download_url: `https://github.com/example/inknote/releases/download/v1.2.3/${encodeURIComponent(name)}`,
  };
}

test('creates a signed updater manifest for Windows and Linux', () => {
  const releaseAssets = [
    asset('逸仙笔记_1.2.3_x64-setup.exe'),
    asset('逸仙笔记_1.2.3_x64-setup.exe.sig'),
    asset('InkNote_1.2.3_amd64.AppImage'),
    asset('InkNote_1.2.3_amd64.AppImage.sig'),
    asset('InkNote_1.2.3_amd64.deb'),
  ];
  const assets = resolveUpdaterAssets(releaseAssets);
  const manifest = createUpdaterManifest({
    version: '1.2.3',
    notes: 'Release notes',
    pubDate: '2026-07-22T00:00:00Z',
    assets,
    signatures: { windows: 'windows-signature', linux: 'linux-signature' },
  });

  assert.equal(assets.windowsInstaller.name, '逸仙笔记_1.2.3_x64-setup.exe');
  assert.equal(assets.linuxAppImage.name, 'InkNote_1.2.3_amd64.AppImage');
  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64', 'linux-x86_64']);
  assert.equal(manifest.platforms['windows-x86_64'].signature, 'windows-signature');
  assert.equal(manifest.platforms['linux-x86_64'].signature, 'linux-signature');
  assert.match(manifest.platforms['linux-x86_64'].url, /\.AppImage$/);
});

test('rejects a release without a Linux AppImage', () => {
  assert.throws(
    () =>
      resolveUpdaterAssets([
        asset('逸仙笔记_1.2.3_x64-setup.exe'),
        asset('逸仙笔记_1.2.3_x64-setup.exe.sig'),
      ]),
    /No Linux AppImage/,
  );
});
