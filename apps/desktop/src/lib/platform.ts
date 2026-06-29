import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getVersion as getTauriAppVersion } from '@tauri-apps/api/app';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface ContentFileDescriptor {
  path: string;
  kind: string;
}

export interface ContentIndexResponse {
  root: string;
  files: ContentFileDescriptor[];
}

export interface GitCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export interface PublishStatusResponse {
  remote: string;
  branch: string;
  branchExists: boolean;
  remoteCommit: string;
  shortStatus: string;
  latencyMs: number;
  proxySummary: string;
}

export interface PublishSiteRequest {
  taskId: string;
  remote: string;
  branch: string;
  basePath: string;
  sshKeyPath: string;
  message: string;
}

export interface PullRemoteContentRequest {
  taskId: string;
  remote: string;
  branch: string;
  sshKeyPath: string;
  conflictStrategy: 'remote' | 'local';
}

export type PublishProgressLevel = 'info' | 'success' | 'warning' | 'error';

export interface PublishProgressEvent {
  taskId: string;
  progress: number;
  stage: string;
  message: string;
  detail: string;
  level: PublishProgressLevel;
}

export interface BlogPreviewServerResponse {
  origin: string;
  port: number;
  running: boolean;
  started: boolean;
  ready: boolean;
  message: string;
}

export interface FriendLinkIconResponse {
  iconPath: string;
  sourceUrl: string;
  resolvedPageUrl: string;
}

export interface CachedExternalImageResponse {
  publicPath: string;
  sourceUrl: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function ensureExtension(path: string, extension: string): string {
  return path.toLowerCase().endsWith(extension.toLowerCase()) ? path : `${path}${extension}`;
}

export async function getDesktopAppVersion(fallback: string): Promise<string> {
  if (!isTauri()) return fallback;
  return getTauriAppVersion();
}

export async function chooseFileToSave(defaultPath: string): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await save({ defaultPath });
  if (!result) return null;
  return result;
}

export async function chooseSlidesFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Slides', extensions: ['ppt', 'pptx', 'pdf'] }],
  });
  if (!result) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

export async function chooseGalleryImageFiles(): Promise<string[]> {
  if (!isTauri()) return [];
  const result = await open({
    multiple: true,
    directory: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function chooseSshPrivateKey(): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await open({ multiple: false, directory: false });
  if (!result) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

export async function readTextFile(path: string): Promise<string> {
  return invoke('read_text_file', { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke('write_text_file', { path, contents });
}

export async function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke('write_binary_file', { path, bytes: Array.from(bytes) });
}

export async function copyFileToPath(source: string, destination: string): Promise<void> {
  await invoke('copy_file_to_path', { source, destination });
}

export async function compressGalleryImageFile(source: string, destination: string): Promise<number> {
  return invoke('compress_gallery_image_file', { source, destination });
}

export async function convertSlidesToPdf(source: string, destination: string): Promise<void> {
  await invoke('convert_slides_to_pdf', { source, destination });
}

export async function getContentIndex(): Promise<ContentIndexResponse> {
  return invoke('get_content_index');
}

export async function readContentFile(path: string): Promise<string> {
  return invoke('read_content_file', { path });
}

export async function writeContentFile(path: string, contents: string): Promise<void> {
  await invoke('write_content_file', { path, contents });
}

export async function deleteContentFile(path: string): Promise<void> {
  await invoke('delete_content_path', { path });
}

export async function deleteGalleryImageFile(publicPath: string): Promise<void> {
  await invoke('delete_gallery_image_file', { publicPath });
}

export async function fetchFriendLinkIcon(pageUrl: string): Promise<FriendLinkIconResponse> {
  return invoke('fetch_friend_link_icon', { pageUrl });
}

export async function cacheExternalImage(imageUrl: string): Promise<CachedExternalImageResponse> {
  const result = await invoke<FriendLinkIconResponse>('cache_external_image', { imageUrl });
  return {
    publicPath: result.iconPath,
    sourceUrl: result.sourceUrl,
  };
}

export async function getPublishStatus(
  remote: string,
  branch: string,
  sshKeyPath = '',
): Promise<PublishStatusResponse> {
  return invoke('get_publish_status', { remote, branch, sshKeyPath });
}

export async function publishContentChanges(request: PublishSiteRequest): Promise<GitCommandResult> {
  return invoke('publish_content_changes', { request });
}

export async function pullRemoteContent(request: PullRemoteContentRequest): Promise<GitCommandResult> {
  return invoke('pull_remote_content', { request });
}

export async function listenToPublishProgress(
  handler: (event: PublishProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<PublishProgressEvent>('publish-progress', (event) => handler(event.payload));
}

export async function listenToContentSyncProgress(
  handler: (event: PublishProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<PublishProgressEvent>('content-sync-progress', (event) => handler(event.payload));
}

export async function listenToDesktopUpdateProgress(
  handler: (event: PublishProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<PublishProgressEvent>('desktop-update-progress', (event) => handler(event.payload));
}

export async function ensureBlogPreviewServer(): Promise<BlogPreviewServerResponse> {
  if (!isTauri()) {
    return {
      origin: 'http://localhost:4321',
      port: 4321,
      running: true,
      started: false,
      ready: true,
      message: 'Browser preview mode.',
    };
  }

  return invoke('ensure_blog_preview_server');
}

export async function downloadAndRunDesktopInstaller(url: string): Promise<string> {
  if (!isTauri()) {
    throw new Error('Desktop installer updates require the Tauri desktop app.');
  }

  return invoke('download_and_run_desktop_installer', { url });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await invoke('open_external_url', { url });
    return;
  }

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!openedWindow) {
    throw new Error(`Unable to open ${url}`);
  }
}
