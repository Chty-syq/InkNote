#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod favicon;

use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, GenericImageView};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU8, Ordering},
        mpsc,
        Mutex, OnceLock,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const BLOG_PREVIEW_PORT: u16 = 4321;
const BLOG_PREVIEW_ORIGIN: &str = "http://localhost:4321";
const BLOG_PREVIEW_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
const BLOG_PREVIEW_WAIT_STEP: Duration = Duration::from_millis(100);
const BLOG_PREVIEW_HTTP_TIMEOUT: Duration = Duration::from_millis(800);

static WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();
static CONTENT_ROOT: OnceLock<PathBuf> = OnceLock::new();
static WEB_SHELL_ROOT: OnceLock<PathBuf> = OnceLock::new();

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
struct ContentFileDescriptor {
    path: String,
    kind: String,
}

#[derive(Serialize)]
struct ContentIndex {
    root: String,
    files: Vec<ContentFileDescriptor>,
}

#[derive(Serialize)]
struct GitCommandResult {
    success: bool,
    stdout: String,
    stderr: String,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Debug, Default)]
struct GitProxyEnv {
    http_proxy: Option<String>,
    https_proxy: Option<String>,
    all_proxy: Option<String>,
    no_proxy: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishSiteRequest {
    task_id: String,
    remote: String,
    branch: String,
    base_path: String,
    ssh_key_path: String,
    message: String,
    known_remote_commit: Option<String>,
    verify_after_push: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRemoteContentRequest {
    task_id: String,
    remote: String,
    branch: String,
    ssh_key_path: String,
    conflict_strategy: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncSiteRequest {
    task_id: String,
    remote: String,
    branch: String,
    base_path: String,
    ssh_key_path: String,
    message: String,
    conflict_strategy: String,
    known_remote_commit: Option<String>,
    verify_after_push: Option<bool>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ContentSyncConflictStrategy {
    Remote,
    Local,
}

impl ContentSyncConflictStrategy {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim() {
            "" | "remote" => Ok(Self::Remote),
            "local" => Ok(Self::Local),
            other => Err(format!(
                "unsupported content sync conflict strategy: {other}"
            )),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Remote => "远端优先",
            Self::Local => "本地优先",
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishProgressEvent {
    task_id: String,
    progress: u8,
    stage: String,
    message: String,
    detail: String,
    level: String,
}

struct PublishProgressReporter {
    app: Option<tauri::AppHandle>,
    task_id: String,
    event_name: &'static str,
    progress: AtomicU8,
}

impl PublishProgressReporter {
    fn emit(
        &self,
        progress: u8,
        stage: &str,
        message: &str,
        detail: impl Into<String>,
        level: &str,
    ) {
        self.progress.store(progress, Ordering::Relaxed);
        if let Some(app) = &self.app {
            let _ = app.emit(
                self.event_name,
                PublishProgressEvent {
                    task_id: self.task_id.clone(),
                    progress,
                    stage: stage.to_string(),
                    message: message.to_string(),
                    detail: detail.into(),
                    level: level.to_string(),
                },
            );
        }
    }

    fn current_progress(&self) -> u8 {
        self.progress.load(Ordering::Relaxed)
    }

    #[cfg(test)]
    fn silent() -> Self {
        Self {
            app: None,
            task_id: "test-publish".to_string(),
            event_name: "publish-progress",
            progress: AtomicU8::new(0),
        }
    }
}

fn emit_desktop_update_progress(
    app: &tauri::AppHandle,
    progress: u8,
    stage: &str,
    message: &str,
    detail: impl Into<String>,
    level: &str,
) {
    let _ = app.emit(
        "desktop-update-progress",
        PublishProgressEvent {
            task_id: "desktop-update".to_string(),
            progress,
            stage: stage.to_string(),
            message: message.to_string(),
            detail: detail.into(),
            level: level.to_string(),
        },
    );
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeContentPayload {
    navigation: serde_json::Value,
    site_config: serde_json::Value,
    categories: serde_json::Value,
    #[serde(default)]
    markdown: BTreeMap<String, String>,
    #[serde(default)]
    inknotes: BTreeMap<String, String>,
    #[serde(default)]
    inknote_projects: BTreeMap<String, String>,
}

struct RuntimeFeedDocument {
    title: String,
    href: String,
    date: String,
    updated_at: String,
    summary: String,
    body: String,
    tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishStatus {
    remote: String,
    branch: String,
    branch_exists: bool,
    remote_commit: String,
    short_status: String,
    latency_ms: u64,
    proxy_summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BlogPreviewServerStatus {
    origin: String,
    port: u16,
    running: bool,
    started: bool,
    ready: bool,
    message: String,
}

#[derive(Default)]
struct BlogPreviewServer {
    child: Mutex<Option<Child>>,
    static_server: Mutex<Option<JoinHandle<()>>>,
}

impl BlogPreviewServer {
    fn stop(&self) {
        if let Ok(mut child_guard) = self.child.lock() {
            if let Some(child) = child_guard.take() {
                terminate_blog_preview_child(child);
            }
        }
    }

    fn has_static_server(&self) -> bool {
        self.static_server
            .lock()
            .ok()
            .is_some_and(|server| server.is_some())
    }
}

fn terminate_blog_preview_child(mut child: Child) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    let _ = child.kill();

    let _ = child.wait();
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("读取文件失败：{error}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    ensure_parent_directory(&path)?;
    fs::write(&path, contents).map_err(|error| format!("写入文本失败：{error}"))
}

#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    ensure_parent_directory(&path)?;
    fs::write(&path, bytes).map_err(|error| format!("写入二进制文件失败：{error}"))
}

#[tauri::command]
fn copy_file_to_path(source: String, destination: String) -> Result<(), String> {
    let source_path = PathBuf::from(&source);
    if !source_path.is_file() {
        return Err(format!("source file does not exist: {source}"));
    }

    copy_file_overwriting(&source_path, &PathBuf::from(&destination))
}

#[tauri::command]
fn compress_gallery_image_file(source: String, destination: String) -> Result<u64, String> {
    const TARGET_WIDTH: u32 = 480;
    const TARGET_HEIGHT: u32 = 330;
    const JPEG_QUALITY: u8 = 82;

    let source_path = PathBuf::from(&source);
    if !source_path.is_file() {
        return Err(format!("source image does not exist: {source}"));
    }

    let decoded = image::open(&source_path)
        .map_err(|error| format!("failed to decode gallery image: {error}"))?;
    let (width, height) = decoded.dimensions();
    if width == 0 || height == 0 {
        return Err("gallery image has invalid dimensions".to_string());
    }

    let target_ratio = TARGET_WIDTH as f64 / TARGET_HEIGHT as f64;
    let source_ratio = width as f64 / height as f64;
    let (crop_x, crop_y, crop_width, crop_height) = if source_ratio > target_ratio {
        let crop_width = ((height as f64 * target_ratio).round() as u32).clamp(1, width);
        ((width - crop_width) / 2, 0, crop_width, height)
    } else {
        let crop_height = ((width as f64 / target_ratio).round() as u32).clamp(1, height);
        (0, (height - crop_height) / 2, width, crop_height)
    };

    let resized = decoded
        .crop_imm(crop_x, crop_y, crop_width, crop_height)
        .resize_exact(TARGET_WIDTH, TARGET_HEIGHT, FilterType::Lanczos3)
        .to_rgba8();

    let mut flattened = image::RgbImage::new(TARGET_WIDTH, TARGET_HEIGHT);
    for (x, y, pixel) in resized.enumerate_pixels() {
        let [red, green, blue, alpha] = pixel.0;
        let alpha = alpha as f32 / 255.0;
        let background = [248.0_f32, 245.0_f32, 238.0_f32];
        flattened.put_pixel(
            x,
            y,
            image::Rgb([
                (red as f32 * alpha + background[0] * (1.0 - alpha)).round() as u8,
                (green as f32 * alpha + background[1] * (1.0 - alpha)).round() as u8,
                (blue as f32 * alpha + background[2] * (1.0 - alpha)).round() as u8,
            ]),
        );
    }

    let destination_path = PathBuf::from(&destination);
    ensure_parent_directory(&destination)?;
    if destination_path.exists() {
        clear_path(&destination_path)?;
    }

    let mut output = fs::File::create(&destination_path)
        .map_err(|error| format!("failed to create compressed gallery image: {error}"))?;
    let mut encoder = JpegEncoder::new_with_quality(&mut output, JPEG_QUALITY);
    encoder
        .encode_image(&image::DynamicImage::ImageRgb8(flattened))
        .map_err(|error| format!("failed to encode compressed gallery image: {error}"))?;
    make_path_writable(&destination_path)?;
    fs::metadata(&destination_path)
        .map(|metadata| metadata.len())
        .map_err(|error| format!("failed to inspect compressed gallery image: {error}"))
}

#[tauri::command]
fn delete_gallery_image_file(public_path: String) -> Result<(), String> {
    const GALLERY_UPLOAD_PREFIX: &str = "/card-images/gallery/uploads/";

    let normalized_path = public_path.trim().replace('\\', "/");
    let file_name = normalized_path
        .strip_prefix(GALLERY_UPLOAD_PREFIX)
        .ok_or_else(|| "only uploaded gallery images can be deleted".to_string())?;

    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("invalid gallery image file name".to_string());
    }

    let gallery_root = get_workspace_root()?
        .join("apps")
        .join("web")
        .join("public")
        .join("card-images")
        .join("gallery")
        .join("uploads");

    if !gallery_root.exists() {
        return Ok(());
    }

    let gallery_root = gallery_root
        .canonicalize()
        .map_err(|error| format!("failed to resolve gallery upload directory: {error}"))?;
    let target = gallery_root.join(file_name);
    let resolved_target = target.canonicalize().unwrap_or(target);

    if !resolved_target.starts_with(&gallery_root) {
        return Err("gallery image path escapes upload directory".to_string());
    }

    if !resolved_target.exists() {
        return Ok(());
    }

    if resolved_target.is_dir() {
        return Err("gallery image path is a directory, expected a file".to_string());
    }

    fs::remove_file(&resolved_target)
        .map_err(|error| format!("failed to delete gallery image: {error}"))
}

#[tauri::command]
fn convert_slides_to_pdf(source: String, destination: String) -> Result<(), String> {
    let source_path = PathBuf::from(&source);
    if !source_path.is_file() {
        return Err(format!("slides file does not exist: {source}"));
    }

    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "ppt" | "pptx") {
        return Err("only PPT and PPTX files need conversion".to_string());
    }

    let destination_path = PathBuf::from(&destination);
    ensure_parent_directory(&destination)?;
    if destination_path.exists() {
        fs::remove_file(&destination_path)
            .map_err(|error| format!("failed to replace existing PDF: {error}"))?;
    }

    let outdir = destination_path
        .parent()
        .ok_or_else(|| "invalid PDF destination path".to_string())?;
    let expected_output = outdir.join(format!(
        "{}.pdf",
        source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "invalid slides file name".to_string())?
    ));
    if expected_output.exists() {
        fs::remove_file(&expected_output)
            .map_err(|error| format!("failed to clear existing converted PDF: {error}"))?;
    }

    let mut errors = Vec::new();
    for candidate in libreoffice_candidates() {
        if candidate.is_absolute() && !candidate.is_file() {
            continue;
        }

        let mut command = Command::new(&candidate);
        command
            .args(["--headless", "--convert-to", "pdf", "--outdir"])
            .arg(outdir)
            .arg(&source_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        match command.output() {
            Ok(output) if output.status.success() => {
                if !expected_output.is_file() {
                    errors.push(format!(
                        "{} finished but did not create {}",
                        candidate.display(),
                        expected_output.display()
                    ));
                    continue;
                }

                if expected_output != destination_path {
                    fs::rename(&expected_output, &destination_path).map_err(|error| {
                        format!("failed to move converted PDF into place: {error}")
                    })?;
                }
                return Ok(());
            }
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                errors.push(format!(
                    "{} exited with {}{}{}",
                    candidate.display(),
                    output.status,
                    if stdout.is_empty() { "" } else { "\nstdout: " },
                    stdout
                ));
                if !stderr.is_empty() {
                    errors.push(format!("stderr: {stderr}"));
                }
            }
            Err(error) => errors.push(format!("{}: {error}", candidate.display())),
        }
    }

    Err(format!(
        "PPT 转 PDF 失败，请确认已安装 LibreOffice。{}",
        if errors.is_empty() {
            String::new()
        } else {
            format!("\n{}", errors.join("\n"))
        }
    ))
}

fn libreoffice_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("soffice"), PathBuf::from("libreoffice")];

    #[cfg(target_os = "windows")]
    {
        candidates.insert(0, PathBuf::from("soffice.com"));
        candidates.insert(1, PathBuf::from("soffice.exe"));
        candidates.push(PathBuf::from(
            "C:\\Program Files\\LibreOffice\\program\\soffice.com",
        ));
        candidates.push(PathBuf::from(
            "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        ));
        candidates.push(PathBuf::from(
            "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
        ));
        candidates.push(PathBuf::from(
            "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        ));
    }

    candidates
}

#[tauri::command]
fn get_content_index() -> Result<ContentIndex, String> {
    let root = get_content_root()?;
    let collections = ["markdown", "inknotes"];
    let mut files = Vec::new();

    for kind in collections {
        let collection_dir = root.join(kind);
        if !collection_dir.exists() {
            continue;
        }

        let entries = fs::read_dir(&collection_dir)
            .map_err(|error| format!("failed to read content/{kind}: {error}"))?;
        for entry in entries {
            let entry =
                entry.map_err(|error| format!("failed to inspect content/{kind}: {error}"))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let folder_name = entry.file_name().to_string_lossy().to_string();
            let markdown_path = path.join("index.md");
            if markdown_path.exists() {
                files.push(ContentFileDescriptor {
                    path: format!("{kind}/{folder_name}/index.md"),
                    kind: kind.to_string(),
                });
            }
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));

    Ok(ContentIndex {
        root: root.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
fn read_content_file(path: String) -> Result<String, String> {
    let resolved = resolve_content_path(&path)?;
    fs::read_to_string(&resolved).map_err(|error| format!("failed to read content/{path}: {error}"))
}

#[tauri::command]
fn write_content_file(path: String, contents: String) -> Result<(), String> {
    let resolved = resolve_content_path(&path)?;
    ensure_parent_directory(&resolved.to_string_lossy())?;
    fs::write(&resolved, contents)
        .map_err(|error| format!("failed to write content/{path}: {error}"))
}

#[tauri::command]
fn delete_content_path(path: String) -> Result<(), String> {
    let resolved = resolve_content_path(&path)?;
    if !resolved.exists() {
        return Ok(());
    }

    if resolved.is_dir() {
        return Err(format!("content/{path} is a directory, expected a file"));
    }

    fs::remove_file(&resolved)
        .map_err(|error| format!("failed to delete content/{path}: {error}"))?;
    remove_empty_parent_directories(&resolved)?;
    Ok(())
}

#[tauri::command]
async fn fetch_friend_link_icon(page_url: String) -> Result<favicon::FriendLinkIconResult, String> {
    favicon::fetch_and_cache(page_url).await
}

#[tauri::command]
fn get_publish_status(
    remote: String,
    branch: String,
    ssh_key_path: Option<String>,
) -> Result<PublishStatus, String> {
    get_publish_status_with_ssh(remote, branch, ssh_key_path.as_deref())
}

fn get_publish_status_with_ssh(
    remote: String,
    branch: String,
    ssh_key_path: Option<&str>,
) -> Result<PublishStatus, String> {
    let (remote, branch) = validate_publish_target(&remote, &branch)?;
    let ssh_command = create_git_ssh_command(ssh_key_path)?;
    let remote_ref = format!("refs/heads/{branch}");
    let command_directory = std::env::temp_dir();
    let started_at = Instant::now();
    let result = ensure_git_success(
        run_git_in_with_ssh(
            &command_directory,
            &["ls-remote", "--heads", &remote, &remote_ref],
            ssh_command.as_deref(),
        )?,
        "read remote deployment branch",
    )?;
    let latency_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
    let remote_commit = result
        .stdout
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();
    let branch_exists = !remote_commit.is_empty();
    let short_status = if branch_exists {
        format!(
            "远程分支 {branch} 已连接，当前版本 {}。",
            short_commit(&remote_commit)
        )
    } else {
        format!("远程仓库已连接，首次发布时将创建分支 {branch}。")
    };

    Ok(PublishStatus {
        proxy_summary: describe_git_system_proxy(&remote),
        remote,
        branch,
        branch_exists,
        remote_commit,
        short_status,
        latency_ms,
    })
}

fn publish_status_from_known_commit(
    remote: &str,
    branch: &str,
    remote_commit: &str,
) -> PublishStatus {
    let remote_commit = remote_commit.trim().to_string();
    let branch_exists = !remote_commit.is_empty();
    let short_status = if branch_exists {
        format!(
            "远程分支 {branch} 已连接，当前版本 {}。",
            short_commit(&remote_commit)
        )
    } else {
        format!("远程仓库已连接，首次发布时将创建分支 {branch}。")
    };

    PublishStatus {
        proxy_summary: describe_git_system_proxy(remote),
        remote: remote.to_string(),
        branch: branch.to_string(),
        branch_exists,
        remote_commit,
        short_status,
        latency_ms: 0,
    }
}

#[tauri::command]
async fn publish_content_changes(
    app: tauri::AppHandle,
    request: PublishSiteRequest,
) -> Result<GitCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || publish_content_changes_blocking(app, request))
        .await
        .map_err(|error| format!("发布任务线程异常结束：{error}"))?
}

fn publish_content_changes_blocking(
    app: tauri::AppHandle,
    request: PublishSiteRequest,
) -> Result<GitCommandResult, String> {
    let reporter = PublishProgressReporter {
        app: Some(app),
        task_id: request.task_id.clone(),
        event_name: "publish-progress",
        progress: AtomicU8::new(0),
    };
    reporter.emit(
        12,
        "validate",
        "正在校验发布配置",
        "检查仓库地址、分支和基础路径。",
        "info",
    );

    let result = publish_content_changes_inner(&request, &reporter);
    match &result {
        Ok(output) => reporter.emit(
            100,
            "complete",
            "站点发布完成",
            format_git_result(output),
            "success",
        ),
        Err(error) => reporter.emit(
            reporter.current_progress(),
            "failed",
            "站点发布失败",
            error.as_str(),
            "error",
        ),
    }
    result
}

#[tauri::command]
async fn pull_remote_content(
    app: tauri::AppHandle,
    request: PullRemoteContentRequest,
) -> Result<GitCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || pull_remote_content_blocking(app, request))
        .await
        .map_err(|error| format!("远端拉取任务线程异常结束：{error}"))?
}

fn pull_remote_content_blocking(
    app: tauri::AppHandle,
    request: PullRemoteContentRequest,
) -> Result<GitCommandResult, String> {
    let reporter = PublishProgressReporter {
        app: Some(app),
        task_id: request.task_id.clone(),
        event_name: "content-sync-progress",
        progress: AtomicU8::new(0),
    };
    reporter.emit(
        8,
        "validate",
        "正在校验远端同步配置",
        "检查仓库地址、分支和 SSH 配置。",
        "info",
    );

    let result = pull_remote_content_inner(&request, &reporter);
    match &result {
        Ok(output) => reporter.emit(
            100,
            "complete",
            "远端内容同步完成",
            format_git_result(output),
            "success",
        ),
        Err(error) => reporter.emit(
            reporter.current_progress(),
            "failed",
            "远端内容同步失败",
            error.as_str(),
            "error",
        ),
    }
    result
}

#[tauri::command]
async fn sync_content_changes(
    app: tauri::AppHandle,
    request: SyncSiteRequest,
) -> Result<GitCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || sync_content_changes_blocking(app, request))
        .await
        .map_err(|error| format!("站点同步任务线程异常结束：{error}"))?
}

fn sync_content_changes_blocking(
    app: tauri::AppHandle,
    request: SyncSiteRequest,
) -> Result<GitCommandResult, String> {
    let reporter = PublishProgressReporter {
        app: Some(app),
        task_id: request.task_id.clone(),
        event_name: "publish-progress",
        progress: AtomicU8::new(0),
    };
    reporter.emit(
        18,
        "fetch",
        "准备拉取远端仓库",
        "正在校验仓库地址、分支与冲突策略。",
        "info",
    );

    let result = sync_content_changes_inner(&request, &reporter);
    match &result {
        Ok(output) => reporter.emit(
            100,
            "push",
            "同步完成",
            concise_git_result_detail(output, "远端站点已更新。"),
            "success",
        ),
        Err(error) => reporter.emit(
            reporter.current_progress(),
            "failed",
            "站点同步失败",
            error.as_str(),
            "error",
        ),
    }
    result
}

fn sync_content_changes_inner(
    request: &SyncSiteRequest,
    reporter: &PublishProgressReporter,
) -> Result<GitCommandResult, String> {
    let (remote, branch) = validate_publish_target(&request.remote, &request.branch)?;
    let ssh_key_path = request.ssh_key_path.trim();
    let ssh_command = create_git_ssh_command((!ssh_key_path.is_empty()).then_some(ssh_key_path))?;
    let conflict_strategy = ContentSyncConflictStrategy::parse(&request.conflict_strategy)?;
    let commit_message = request.message.trim();
    if commit_message.is_empty() {
        return Err("请输入同步说明。".to_string());
    }

    let status = if let Some(remote_commit) = request.known_remote_commit.as_deref() {
        publish_status_from_known_commit(&remote, &branch, remote_commit)
    } else {
        get_publish_status_with_ssh(
            remote.clone(),
            branch.clone(),
            (!ssh_key_path.is_empty()).then_some(ssh_key_path),
        )?
    };

    reporter.emit(
        20,
        "fetch",
        "准备拉取远端仓库",
        "正在创建临时 Git 工作区。",
        "info",
    );
    let sync_directory = TemporaryPublishDirectory::create()?;
    let sync_root = sync_directory.path();
    ensure_git_success(
        run_git_in(sync_root, &["init"])?,
        "initialize sync publishing repository",
    )?;
    ensure_git_success(
        run_git_in(sync_root, &["remote", "add", "origin", &remote])?,
        "configure sync publishing remote",
    )?;
    reporter.emit(
        22,
        "fetch",
        "拉取准备完成",
        status.short_status.clone(),
        "success",
    );

    let remote_ref = format!("refs/heads/{branch}");
    if status.branch_exists {
        reporter.emit(
            24,
            "fetch",
            "正在拉取远端仓库",
            format!("分支：{branch}"),
            "info",
        );
        let mut last_fetch_percent = None;
        let fetched = ensure_git_success(
            run_git_in_with_ssh_progress(
                sync_root,
                &["fetch", "--progress", "--depth=1", "origin", &remote_ref],
                ssh_command.as_deref(),
                |line| {
                    emit_git_transfer_progress(
                        reporter,
                        24,
                        18,
                        "fetch",
                        "正在拉取远端仓库",
                        line,
                        &mut last_fetch_percent,
                    );
                },
            )?,
            "fetch sync branch",
        )?;
        reporter.emit(
            42,
            "fetch",
            "远端仓库拉取完成",
            concise_git_result_detail(&fetched, "已取得远端发布分支。"),
            "success",
        );
        ensure_git_success(
            run_git_in(sync_root, &["checkout", "-B", &branch, "FETCH_HEAD"])?,
            "checkout sync branch",
        )?;

        reporter.emit(
            44,
            "merge",
            "正在合并内容",
            format!("冲突策略：{}", conflict_strategy.label()),
            "info",
        );
        let payload = read_runtime_content_payload_from_artifact_root(sync_root)?;
        restore_runtime_content_payload(&payload, conflict_strategy)?;
        restore_runtime_public_assets(sync_root, conflict_strategy)?;
        reporter.emit(
            54,
            "merge",
            "内容合并完成",
            "远端独有与本地独有内容已保留，冲突项已按策略处理。",
            "success",
        );
    } else {
        reporter.emit(
            42,
            "fetch",
            "远端分支不存在",
            "将创建首次发布分支，并以本地内容作为初始版本。",
            "warning",
        );
        ensure_git_success(
            run_git_in(sync_root, &["checkout", "--orphan", &branch])?,
            "create first sync branch",
        )?;
        reporter.emit(
            54,
            "merge",
            "无需合并远端内容",
            "远端尚无发布内容，跳过拉取合并。",
            "success",
        );
    }

    let artifact = create_publish_artifact(&request.base_path, 56, reporter)?;
    publish_prepared_worktree(
        artifact.path(),
        sync_root,
        &remote,
        &branch,
        &remote_ref,
        (!ssh_key_path.is_empty()).then_some(ssh_key_path),
        ssh_command.as_deref(),
        commit_message,
        &status,
        request.verify_after_push.unwrap_or(false),
        reporter,
    )
}

fn pull_remote_content_inner(
    request: &PullRemoteContentRequest,
    reporter: &PublishProgressReporter,
) -> Result<GitCommandResult, String> {
    let (remote, branch) = validate_publish_target(&request.remote, &request.branch)?;
    let ssh_key_path = request.ssh_key_path.trim();
    let conflict_strategy = ContentSyncConflictStrategy::parse(&request.conflict_strategy)?;
    let ssh_command = create_git_ssh_command((!ssh_key_path.is_empty()).then_some(ssh_key_path))?;

    reporter.emit(
        14,
        "prepare",
        "正在创建拉取工作区",
        "初始化临时 Git 仓库。",
        "info",
    );
    let sync_directory = TemporaryPublishDirectory::create()?;
    let sync_root = sync_directory.path();
    ensure_git_success(
        run_git_in(sync_root, &["init"])?,
        "initialize sync repository",
    )?;
    ensure_git_success(
        run_git_in(sync_root, &["remote", "add", "origin", &remote])?,
        "configure sync remote",
    )?;

    let remote_ref = format!("refs/heads/{branch}");
    reporter.emit(
        25,
        "fetch",
        "正在拉取远端发布分支",
        format!("分支：{branch}"),
        "info",
    );
    let fetched = ensure_git_success(
        run_git_in_with_ssh(
            sync_root,
            &["fetch", "--depth=1", "origin", &remote_ref],
            ssh_command.as_deref(),
        )?,
        "fetch remote content branch",
    )?;
    reporter.emit(
        42,
        "fetch",
        "远端分支拉取完成",
        format_git_result(&fetched),
        "success",
    );

    ensure_git_success(
        run_git_in(sync_root, &["checkout", "--detach", "FETCH_HEAD"])?,
        "checkout remote content branch",
    )?;

    reporter.emit(
        52,
        "manifest",
        "正在读取远端内容清单",
        sync_root.join("inknote-content.json").display().to_string(),
        "info",
    );
    let payload = read_runtime_content_payload_from_artifact_root(sync_root)?;

    reporter.emit(
        65,
        "content",
        "正在写入本地内容库",
        format!(
            "远端独有会新增，本地独有会保留；冲突时使用{}。",
            conflict_strategy.label()
        ),
        "info",
    );
    restore_runtime_content_payload(&payload, conflict_strategy)?;
    reporter.emit(
        80,
        "content",
        "本地内容库已更新",
        "远端内容已经合并写入 content/。",
        "success",
    );

    reporter.emit(
        86,
        "assets",
        "正在同步公开资源",
        "合并图片、图库、slides 与生成资源，不删除本地独有文件。",
        "info",
    );
    restore_runtime_public_assets(sync_root, conflict_strategy)?;
    reporter.emit(
        96,
        "assets",
        "公开资源同步完成",
        "本地 web 资源已完成合并同步。",
        "success",
    );

    Ok(GitCommandResult {
        success: true,
        stdout: format!(
            "已从 {remote} 的 {branch} 分支合并同步内容到本地，冲突策略：{}。",
            conflict_strategy.label()
        ),
        stderr: String::new(),
    })
}

fn read_runtime_content_payload_from_artifact_root(
    artifact_root: &Path,
) -> Result<RuntimeContentPayload, String> {
    let manifest_path = artifact_root.join("inknote-content.json");
    if !manifest_path.is_file() {
        return Err(
            "远端分支中没有找到 inknote-content.json，请确认该分支是 InkNote 发布产物。"
                .to_string(),
        );
    }

    let manifest = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("failed to read {}: {error}", manifest_path.display()))?;
    serde_json::from_str(manifest.trim_start_matches('\u{feff}'))
        .map_err(|error| format!("failed to parse {}: {error}", manifest_path.display()))
}

fn publish_content_changes_inner(
    request: &PublishSiteRequest,
    reporter: &PublishProgressReporter,
) -> Result<GitCommandResult, String> {
    let (remote, branch) = validate_publish_target(&request.remote, &request.branch)?;
    let ssh_key_path = request.ssh_key_path.trim();
    create_git_ssh_command(Some(ssh_key_path))?;
    let commit_message = request.message.trim();
    if commit_message.is_empty() {
        return Err("请输入发布说明。".to_string());
    }

    let artifact = create_publish_artifact(&request.base_path, 14, reporter)?;
    publish_built_site(
        artifact.path(),
        &remote,
        &branch,
        (!ssh_key_path.is_empty()).then_some(ssh_key_path),
        commit_message,
        request.known_remote_commit.as_deref(),
        request.verify_after_push.unwrap_or(true),
        reporter,
    )
}

fn create_publish_artifact(
    base_path_value: &str,
    progress_base: u8,
    reporter: &PublishProgressReporter,
) -> Result<TemporaryPublishDirectory, String> {
    let base_path = normalize_pages_base(base_path_value)?;
    if can_rebuild_web_shell_from_workspace() {
        reporter.emit(
            progress_base,
            "build",
            "正在构建 Web 镜像",
            "正在更新博客前端外壳。",
            "info",
        );
        let rebuild_result = rebuild_web_shell_from_workspace()?;
        if !rebuild_result.success {
            return Err(format!(
                "failed to rebuild web shell before publishing:\n{}",
                format_git_result(&rebuild_result)
            ));
        }
        reporter.emit(
            progress_base.saturating_add(2),
            "build",
            "Web 前端外壳已更新",
            concise_git_result_detail(&rebuild_result, "前端资源构建完成。"),
            "success",
        );
    } else {
        reporter.emit(
            progress_base,
            "build",
            "正在构建 Web 镜像",
            "使用当前应用内置的博客前端外壳。",
            "info",
        );
    }
    reporter.emit(
        progress_base.saturating_add(3),
        "build",
        "已确认 Web 外壳",
        "开始写入运行时内容清单。",
        "info",
    );
    reporter.emit(
        progress_base.saturating_add(4),
        "build",
        "正在构建 Web 镜像",
        format!("站点路径：{base_path}"),
        "info",
    );
    let artifact = create_runtime_web_artifact(&base_path)?;
    if let Ok(summary) = summarize_runtime_manifest(artifact.path()) {
        reporter.emit(
            progress_base.saturating_add(10),
            "build",
            "Web 内容清单已生成",
            summary,
            "success",
        );
    }
    reporter.emit(
        progress_base.saturating_add(16),
        "build",
        "Web 镜像构建完成",
        "文章、配置、RSS 与公开资源已写入临时镜像。",
        "success",
    );
    Ok(artifact)
}

fn publish_built_site(
    dist: &Path,
    remote: &str,
    branch: &str,
    ssh_key_path: Option<&str>,
    commit_message: &str,
    known_remote_commit: Option<&str>,
    verify_after_push: bool,
    reporter: &PublishProgressReporter,
) -> Result<GitCommandResult, String> {
    let ssh_command = create_git_ssh_command(ssh_key_path)?;
    reporter.emit(
        34,
        "prepare",
        "正在创建发布工作区",
        "初始化临时 Git 仓库。",
        "info",
    );
    let publish_directory = TemporaryPublishDirectory::create()?;
    let publish_root = publish_directory.path();
    let initialized = ensure_git_success(
        run_git_in(publish_root, &["init"])?,
        "initialize deployment repository",
    )?;
    reporter.emit(
        38,
        "prepare",
        "发布工作区已就绪",
        format_git_result(&initialized),
        "success",
    );

    let configured_remote = ensure_git_success(
        run_git_in(publish_root, &["remote", "add", "origin", &remote])?,
        "configure deployment remote",
    )?;
    reporter.emit(
        42,
        "remote",
        "远程仓库已配置",
        format_git_result(&configured_remote),
        "success",
    );

    let remote_ref = format!("refs/heads/{branch}");
    reporter.emit(
        45,
        "remote",
        "正在连接远程仓库",
        format!("检查分支：{branch}"),
        "info",
    );
    let status = if let Some(remote_commit) = known_remote_commit {
        publish_status_from_known_commit(remote, branch, remote_commit)
    } else {
        get_publish_status_with_ssh(remote.to_string(), branch.to_string(), ssh_key_path)?
    };
    reporter.emit(
        50,
        "remote",
        "远程仓库连接成功",
        status.short_status.clone(),
        "success",
    );
    if status.branch_exists {
        reporter.emit(
            53,
            "sync",
            "正在拉取远程发布分支",
            format!("分支：{branch}"),
            "info",
        );
        let fetched = ensure_git_success(
            run_git_in_with_ssh(
                publish_root,
                &["fetch", "--depth=1", "origin", &remote_ref],
                ssh_command.as_deref(),
            )?,
            "fetch deployment branch",
        )?;
        reporter.emit(
            57,
            "sync",
            "远程分支拉取完成",
            format_git_result(&fetched),
            "success",
        );
        let checked_out = ensure_git_success(
            run_git_in(publish_root, &["checkout", "-B", &branch, "FETCH_HEAD"])?,
            "checkout deployment branch",
        )?;
        reporter.emit(
            60,
            "sync",
            "已切换到发布分支",
            format_git_result(&checked_out),
            "success",
        );
    } else {
        reporter.emit(
            53,
            "sync",
            "正在创建首次发布分支",
            format!("分支：{branch}"),
            "info",
        );
        let created_branch = ensure_git_success(
            run_git_in(publish_root, &["checkout", "--orphan", &branch])?,
            "create deployment branch",
        )?;
        reporter.emit(
            60,
            "sync",
            "首次发布分支已创建",
            format_git_result(&created_branch),
            "success",
        );
    }

    publish_prepared_worktree(
        dist,
        publish_root,
        remote,
        branch,
        &remote_ref,
        ssh_key_path,
        ssh_command.as_deref(),
        commit_message,
        &status,
        verify_after_push,
        reporter,
    )
}

fn publish_prepared_worktree(
    dist: &Path,
    publish_root: &Path,
    remote: &str,
    branch: &str,
    remote_ref: &str,
    ssh_key_path: Option<&str>,
    ssh_command: Option<&str>,
    commit_message: &str,
    status: &PublishStatus,
    verify_after_push: bool,
    reporter: &PublishProgressReporter,
) -> Result<GitCommandResult, String> {
    reporter.emit(
        74,
        "build",
        "正在整理 Web 镜像",
        "正在把静态产物写入待推送工作区。",
        "info",
    );
    mirror_deployment_artifact(&dist, publish_root)?;
    reporter.emit(
        78,
        "build",
        "Web 镜像已准备好",
        "静态资源和内容清单已整理完成。",
        "success",
    );
    ensure_git_success(
        run_git_in(publish_root, &["config", "user.name", "InkNote Publisher"])?,
        "configure Git author",
    )?;
    ensure_git_success(
        run_git_in(
            publish_root,
            &["config", "user.email", "inknote-publisher@localhost"],
        )?,
        "configure Git author email",
    )?;
    reporter.emit(
        80,
        "push",
        "正在准备远端推送",
        "正在检查本次同步是否产生变更。",
        "info",
    );
    let staged_files = ensure_git_success(
        run_git_in(publish_root, &["add", "--all"])?,
        "stage deployment artifact",
    )?;
    reporter.emit(
        82,
        "push",
        "远端推送准备完成",
        concise_git_result_detail(&staged_files, "待推送文件已暂存。"),
        "success",
    );

    let staged = run_git_in(publish_root, &["diff", "--cached", "--quiet"])?;
    if staged.success {
        let manifest_summary = summarize_runtime_manifest(publish_root)
            .unwrap_or_else(|error| format!("无法读取当前发布清单：{error}"));
        reporter.emit(94, "push", "本次同步内容摘要", manifest_summary, "info");
        reporter.emit(
            100,
            "push",
            "远程站点已是最新版本",
            "没有检测到需要提交的文件变更。",
            "success",
        );
        return Ok(GitCommandResult {
            success: true,
            stdout: format!("部署分支 {branch} 已是最新版本，无需推送。"),
            stderr: String::new(),
        });
    }

    reporter.emit(84, "push", "正在创建同步提交", commit_message, "info");
    let committed = ensure_git_success(
        run_git_in(publish_root, &["commit", "-m", commit_message])?,
        "commit deployment artifact",
    )?;
    reporter.emit(
        86,
        "push",
        "同步提交已创建",
        concise_git_result_detail(&committed, "本地同步提交已创建。"),
        "success",
    );

    if let Ok(summary) = summarize_runtime_manifest(publish_root) {
        reporter.emit(88, "push", "本次同步内容摘要", summary, "info");
    }

    let refspec = format!("HEAD:{remote_ref}");
    reporter.emit(
        90,
        "push",
        "正在推送到远程仓库",
        format!("目标分支：{branch}"),
        "info",
    );
    let mut last_push_percent = None;
    let push_result = if status.branch_exists {
        let lease = format!("--force-with-lease={remote_ref}:{}", status.remote_commit);
        ensure_git_success(
            run_git_in_with_ssh_progress(
                publish_root,
                &["push", "--progress", "origin", &refspec, &lease],
                ssh_command,
                |line| {
                    emit_git_transfer_progress(
                        reporter,
                        90,
                        8,
                        "push",
                        "正在推送到远程仓库",
                        line,
                        &mut last_push_percent,
                    );
                },
            )?,
            "push deployment branch",
        )?
    } else {
        ensure_git_success(
            run_git_in_with_ssh_progress(
                publish_root,
                &["push", "--progress", "--set-upstream", "origin", &refspec],
                ssh_command,
                |line| {
                    emit_git_transfer_progress(
                        reporter,
                        90,
                        8,
                        "push",
                        "正在推送到远程仓库",
                        line,
                        &mut last_push_percent,
                    );
                },
            )?,
            "create remote deployment branch",
        )?
    };
    reporter.emit(
        98,
        "push",
        "远程推送完成",
        concise_git_result_detail(&push_result, "远程仓库已接收本次同步。"),
        "success",
    );

    let commit = ensure_git_success(
        run_git_in(publish_root, &["rev-parse", "HEAD"])?,
        "read deployment commit",
    )?;
    let deployed_commit = commit.stdout.trim().to_string();
    let remote_commit_after_push = if verify_after_push {
        let remote_status_after_push =
            get_publish_status_with_ssh(remote.to_string(), branch.to_string(), ssh_key_path)?;
        let remote_commit_after_push = remote_status_after_push.remote_commit.trim().to_string();
        let remote_matches_local = !remote_commit_after_push.is_empty()
            && short_commit(&remote_commit_after_push) == short_commit(&deployed_commit);
        reporter.emit(
            99,
            "push",
            if remote_matches_local {
                "远端分支校验通过"
            } else {
                "远端分支校验异常"
            },
            format!(
                "本地：{}\n远端：{}\n分支：{}",
                short_commit(&deployed_commit),
                if remote_commit_after_push.is_empty() {
                    "(empty)"
                } else {
                    short_commit(&remote_commit_after_push)
                },
                branch
            ),
            if remote_matches_local {
                "success"
            } else {
                "warning"
            },
        );
        remote_commit_after_push
    } else {
        reporter.emit(
            99,
            "push",
            "远端推送已确认",
            format!(
                "Git 已接受推送，发布版本：{}",
                short_commit(&deployed_commit)
            ),
            "success",
        );
        deployed_commit.clone()
    };
    Ok(GitCommandResult {
        success: push_result.success,
        stdout: format!(
            "已发布到 {branch}，本地版本 {}，远端版本 {}。",
            short_commit(&deployed_commit),
            if remote_commit_after_push.is_empty() {
                "(empty)"
            } else {
                short_commit(&remote_commit_after_push)
            }
        ),
        stderr: push_result.stderr,
    })
}

fn format_git_result(result: &GitCommandResult) -> String {
    match (result.stdout.is_empty(), result.stderr.is_empty()) {
        (true, true) => "命令执行成功，未返回额外信息。".to_string(),
        (false, true) => result.stdout.clone(),
        (true, false) => result.stderr.clone(),
        (false, false) => format!("{}\n{}", result.stdout, result.stderr),
    }
}

fn concise_git_result_detail(result: &GitCommandResult, fallback: &str) -> String {
    let combined = format_git_result(result);
    if combined == "命令执行成功，未返回额外信息。" {
        return fallback.to_string();
    }

    combined
        .lines()
        .map(str::trim)
        .find(|line| {
            !line.is_empty()
                && !line.contains('%')
                && !line.starts_with("remote:")
                && !line.starts_with("From ")
                && !line.starts_with("To ")
        })
        .map(|line| line.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed_url = url.trim();
    if !is_allowed_local_preview_url(trimmed_url) {
        return Err("Only local blog preview URLs can be opened.".to_string());
    }

    let mut command = if cfg!(target_os = "windows") {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", trimmed_url]);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(trimmed_url);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(trimmed_url);
        command
    };

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open local blog preview: {error}"))
}

#[tauri::command]
async fn download_and_run_desktop_installer(
    app: tauri::AppHandle,
    url: String,
) -> Result<String, String> {
    let installer_url = validate_desktop_installer_url(url.trim())?;
    let file_name = installer_url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|segment| !segment.trim().is_empty())
        .ok_or_else(|| "installer URL does not contain a file name".to_string())?
        .to_string();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("failed to create update temp file name: {error}"))?
        .as_millis();
    let target_path = std::env::temp_dir().join(format!(
        "inknote-update-{}-{nonce}-{file_name}",
        std::process::id()
    ));

    emit_desktop_update_progress(
        &app,
        5,
        "download",
        "正在连接 GitHub Release...",
        installer_url.to_string(),
        "info",
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .user_agent("InkNote-Updater-Fallback/1.0")
        .build()
        .map_err(|error| format!("failed to create update downloader: {error}"))?;
    let mut response = client
        .get(installer_url.clone())
        .send()
        .await
        .map_err(|error| format!("failed to download installer: {error}"))?
        .error_for_status()
        .map_err(|error| format!("installer download failed: {error}"))?;

    let content_length = response.content_length().unwrap_or(0);
    if content_length > 0 {
        const MAX_INSTALLER_BYTES: u64 = 350 * 1024 * 1024;
        if content_length > MAX_INSTALLER_BYTES {
            return Err(format!(
                "installer is too large: {} MB",
                content_length / 1024 / 1024
            ));
        }
    }

    emit_desktop_update_progress(
        &app,
        10,
        "download",
        "正在下载安装包...",
        if content_length > 0 {
            format!("0 / {} MB", content_length / 1024 / 1024)
        } else {
            "等待服务器返回文件大小。".to_string()
        },
        "info",
    );

    let mut file = fs::File::create(&target_path)
        .map_err(|error| format!("failed to create installer file: {error}"))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("failed to read installer response: {error}"))?
    {
        file.write_all(&chunk)
            .map_err(|error| format!("failed to write installer file: {error}"))?;
        downloaded += chunk.len() as u64;

        let progress = if content_length > 0 {
            10 + (((downloaded.min(content_length) * 78) / content_length) as u8)
        } else {
            35
        };
        emit_desktop_update_progress(
            &app,
            progress.min(88),
            "download",
            "正在下载安装包...",
            if content_length > 0 {
                format!(
                    "{} / {} MB",
                    downloaded / 1024 / 1024,
                    content_length / 1024 / 1024
                )
            } else {
                format!("已下载 {} MB", downloaded / 1024 / 1024)
            },
            "info",
        );
    }
    file.flush()
        .map_err(|error| format!("failed to flush installer file: {error}"))?;
    drop(file);

    emit_desktop_update_progress(
        &app,
        92,
        "install",
        "正在启动安装包...",
        target_path.to_string_lossy().to_string(),
        "info",
    );

    let mut command = Command::new(&target_path);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map_err(|error| format!("failed to start installer: {error}"))?;

    emit_desktop_update_progress(
        &app,
        100,
        "install",
        "安装包已启动",
        target_path.to_string_lossy().to_string(),
        "success",
    );

    Ok(target_path.to_string_lossy().to_string())
}

fn validate_desktop_installer_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|_| "invalid installer URL".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed
            .path()
            .starts_with("/Chty-syq/InkNote/releases/download/")
        || !parsed.path().to_ascii_lowercase().ends_with(".exe")
    {
        return Err("only InkNote GitHub release installers are allowed".to_string());
    }

    Ok(parsed)
}

#[tauri::command]
fn ensure_blog_preview_server(
    server: tauri::State<'_, BlogPreviewServer>,
) -> Result<BlogPreviewServerStatus, String> {
    ensure_blog_preview_server_state(server.inner(), true)
}

fn ensure_parent_directory(path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|error| format!("创建目录失败：{error}"))?;
        }
    }
    Ok(())
}

fn remove_empty_parent_directories(path: &Path) -> Result<(), String> {
    let content_root = get_content_root()?;
    let mut current = path.parent();

    while let Some(directory) = current {
        if directory == content_root.as_path() {
            break;
        }

        let mut entries = fs::read_dir(directory)
            .map_err(|error| format!("failed to inspect {:?}: {error}", directory))?;

        if entries.next().is_some() {
            break;
        }

        fs::remove_dir(directory)
            .map_err(|error| format!("failed to remove {:?}: {error}", directory))?;
        current = directory.parent();
    }

    Ok(())
}

fn initialize_runtime_paths(app: &tauri::AppHandle) -> Result<(), String> {
    let source_workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .ok();
    let resource_directory = app
        .path()
        .resource_dir()
        .map_err(|error| format!("failed to locate application resources: {error}"))?;
    let bundled_content = resource_directory.join("default-content");
    let bundled_web_shell = resource_directory.join("web-dist");

    let (workspace_root, content_root) = if cfg!(debug_assertions)
        && source_workspace
            .as_ref()
            .is_some_and(|root| root.join("content/site/site.config.json").is_file())
    {
        let workspace = source_workspace.clone().expect("checked source workspace");
        let content = workspace.join("content");
        (workspace, content)
    } else {
        let workspace = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate application data directory: {error}"))?
            .join("workspace");
        let content = workspace.join("content");
        if !content.join("site/site.config.json").is_file() {
            if !bundled_content.is_dir() {
                return Err(
                    "the installer does not contain the default content workspace".to_string(),
                );
            }
            copy_directory_contents(&bundled_content, &content)?;
        }
        let public_root = workspace.join("apps/web/public");
        fs::create_dir_all(&public_root)
            .map_err(|error| format!("failed to create local public asset directory: {error}"))?;
        (workspace, content)
    };

    let web_shell = if bundled_web_shell.join("index.html").is_file() {
        bundled_web_shell
    } else if let Some(source) = source_workspace {
        source.join("apps/web/dist")
    } else {
        bundled_web_shell
    };

    WORKSPACE_ROOT
        .set(workspace_root)
        .map_err(|_| "workspace root is already initialized".to_string())?;
    CONTENT_ROOT
        .set(content_root)
        .map_err(|_| "content root is already initialized".to_string())?;
    WEB_SHELL_ROOT
        .set(web_shell)
        .map_err(|_| "web shell root is already initialized".to_string())?;
    Ok(())
}

fn get_content_root() -> Result<PathBuf, String> {
    CONTENT_ROOT
        .get()
        .cloned()
        .ok_or_else(|| "content workspace is not initialized".to_string())
}

fn resolve_content_path(relative_path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(relative_path);
    if candidate.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_) | Component::CurDir
        )
    }) {
        return Err("invalid content path".to_string());
    }

    Ok(get_content_root()?.join(candidate))
}

fn is_allowed_local_preview_url(url: &str) -> bool {
    url::Url::parse(url).ok().is_some_and(|parsed| {
        matches!(parsed.scheme(), "http" | "https") && parsed.host().is_some()
    })
}

fn ensure_blog_preview_server_state(
    server: &BlogPreviewServer,
    wait_for_ready: bool,
) -> Result<BlogPreviewServerStatus, String> {
    if is_blog_preview_server_ready() {
        return Ok(create_blog_preview_server_status(
            false,
            true,
            "Local blog preview server is already running.",
        ));
    }

    let has_running_child = {
        let mut child_guard = server
            .child
            .lock()
            .map_err(|_| "failed to lock local blog preview server state".to_string())?;

        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) => {
                    *child_guard = None;
                    false
                }
                Err(error) => {
                    return Err(format!(
                        "failed to inspect local blog preview server: {error}"
                    ));
                }
            }
        } else {
            false
        }
    };

    if has_running_child {
        let ready = wait_for_blog_preview_server(wait_for_ready);
        if ready {
            return Ok(create_blog_preview_server_status(
                false,
                true,
                "Local blog preview server is ready.",
            ));
        }

        let mut child_guard = server
            .child
            .lock()
            .map_err(|_| "failed to lock local blog preview server state".to_string())?;
        if let Some(child) = child_guard.take() {
            terminate_blog_preview_child(child);
        }
    }

    if can_start_npm_preview_server() {
        let mut child_guard = server
            .child
            .lock()
            .map_err(|_| "failed to lock local blog preview server state".to_string())?;
        match spawn_blog_preview_server() {
            Ok(child) => {
                *child_guard = Some(child);
                drop(child_guard);

                let ready = wait_for_blog_preview_server(wait_for_ready);
                if ready {
                    return Ok(create_blog_preview_server_status(
                        true,
                        true,
                        "Local blog preview server has started.",
                    ));
                }

                let mut child_guard = server
                    .child
                    .lock()
                    .map_err(|_| "failed to lock local blog preview server state".to_string())?;
                if let Some(child) = child_guard.take() {
                    terminate_blog_preview_child(child);
                }
            }
            Err(error) => {
                eprintln!("failed to start npm blog preview server, using static preview: {error}");
            }
        }
    }

    if !server.has_static_server() {
        let static_server = spawn_static_blog_preview_server()?;
        let mut static_guard = server
            .static_server
            .lock()
            .map_err(|_| "failed to lock static local blog preview server state".to_string())?;
        *static_guard = Some(static_server);
    }

    let ready = wait_for_blog_preview_server(wait_for_ready);
    Ok(create_blog_preview_server_status(
        true,
        ready,
        if ready {
            "Static local blog preview server has started."
        } else {
            "Local blog preview server is starting."
        },
    ))
}

fn create_blog_preview_server_status(
    started: bool,
    ready: bool,
    message: &str,
) -> BlogPreviewServerStatus {
    BlogPreviewServerStatus {
        origin: BLOG_PREVIEW_ORIGIN.to_string(),
        port: BLOG_PREVIEW_PORT,
        running: true,
        started,
        ready,
        message: message.to_string(),
    }
}

fn spawn_blog_preview_server() -> Result<Child, String> {
    let mut command = Command::new(if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    });
    command
        .args(["run", "web:dev"])
        .current_dir(get_workspace_root()?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command.spawn().map_err(|error| {
        format!("failed to start local blog preview server with `npm run web:dev`: {error}")
    })
}

fn can_start_npm_preview_server() -> bool {
    get_workspace_root().ok().is_some_and(|root| {
        root.join("package.json").is_file()
            && root.join("apps/web/package.json").is_file()
            && root.join("apps/web/src").is_dir()
    })
}

fn spawn_static_blog_preview_server() -> Result<JoinHandle<()>, String> {
    let listener = TcpListener::bind(("127.0.0.1", BLOG_PREVIEW_PORT)).map_err(|error| {
        format!(
            "failed to start static local blog preview server on {BLOG_PREVIEW_ORIGIN}: {error}"
        )
    })?;

    let handle = thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    thread::spawn(move || handle_static_blog_preview_connection(stream));
                }
                Err(error) => eprintln!("failed to accept local blog preview request: {error}"),
            }
        }
    });
    Ok(handle)
}

fn handle_static_blog_preview_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(BLOG_PREVIEW_HTTP_TIMEOUT));
    let _ = stream.set_write_timeout(Some(BLOG_PREVIEW_HTTP_TIMEOUT));

    let mut buffer = [0_u8; 8192];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(bytes_read) => bytes_read,
        Err(error) => {
            eprintln!("failed to read local blog preview request: {error}");
            return;
        }
    };
    if bytes_read == 0 {
        return;
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut parts = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or("/");
    if !matches!(method, "GET" | "HEAD") {
        let _ = write_http_response(
            &mut stream,
            405,
            "Method Not Allowed",
            "text/plain; charset=utf-8",
            b"Method Not Allowed",
            method == "HEAD",
        );
        return;
    }

    match resolve_static_blog_preview_response(target) {
        Ok((content_type, body)) => {
            let _ = write_http_response(
                &mut stream,
                200,
                "OK",
                content_type,
                &body,
                method == "HEAD",
            );
        }
        Err(status) => {
            let (code, reason, body) = match status {
                403 => (403, "Forbidden", "Forbidden"),
                404 => (404, "Not Found", "Not Found"),
                _ => (500, "Internal Server Error", "Internal Server Error"),
            };
            let _ = write_http_response(
                &mut stream,
                code,
                reason,
                "text/plain; charset=utf-8",
                body.as_bytes(),
                method == "HEAD",
            );
        }
    }
}

fn resolve_static_blog_preview_response(target: &str) -> Result<(&'static str, Vec<u8>), u16> {
    let path = normalize_preview_request_path(target).ok_or(403_u16)?;
    let asset_path = normalize_preview_asset_request_path(&path);
    let path = asset_path.as_deref().unwrap_or(&path);
    if path == "/inknote-content.json" {
        let payload = create_runtime_content_payload().map_err(|_| 500_u16)?;
        let body = serde_json::to_vec(&payload).map_err(|_| 500_u16)?;
        return Ok(("application/json; charset=utf-8", body));
    }
    if path == "/rss.xml" {
        let feed = create_runtime_rss_feed().map_err(|_| 500_u16)?;
        return Ok(("application/rss+xml; charset=utf-8", feed.into_bytes()));
    }

    if let Some(public_path) = resolve_preview_public_asset_path(&path).map_err(|_| 500_u16)? {
        return fs::read(&public_path)
            .map(|body| (content_type_for_path(&public_path), body))
            .map_err(|_| 404);
    }

    let shell_root = get_web_shell_root().map_err(|_| 500_u16)?;
    let shell_path = resolve_preview_shell_asset_path(&shell_root, &path).ok_or(403_u16)?;
    let target_path = if shell_path.is_file() {
        shell_path
    } else if should_fallback_to_spa_index(&path) {
        shell_root.join("index.html")
    } else {
        return Err(404);
    };

    let content_type = content_type_for_path(&target_path);
    let body = fs::read(&target_path).map_err(|_| 404_u16)?;
    if content_type.starts_with("text/html") {
        let html = String::from_utf8(body).map_err(|_| 500_u16)?;
        let html = rewrite_spa_entry_html(&html, "/").map_err(|_| 500_u16)?;
        return Ok((content_type, html.into_bytes()));
    }

    Ok((content_type, body))
}

fn normalize_preview_request_path(target: &str) -> Option<String> {
    let raw_path = target.split(['?', '#']).next().unwrap_or("/");
    let path = if raw_path.is_empty() { "/" } else { raw_path };
    if path.as_bytes().contains(&0) || path.contains('\\') {
        return None;
    }
    Some(format!("/{}", path.trim_start_matches('/')))
}

fn normalize_preview_asset_request_path(path: &str) -> Option<String> {
    let asset_roots = [
        "/assets/",
        "/content-images/",
        "/content-slides/",
        "/card-images/",
        "/generated/",
    ];
    if asset_roots.iter().any(|prefix| path.starts_with(prefix))
        || matches!(
            path,
            "/inknote-content.json" | "/rss.xml" | "/blog-avatar.jpg" | "/blog-header-bg.png"
        )
    {
        return None;
    }

    let trimmed = path.trim_start_matches('/');
    let nested_roots = [
        "assets/",
        "content-images/",
        "content-slides/",
        "card-images/",
        "generated/",
        "inknote-content.json",
        "rss.xml",
        "blog-avatar.jpg",
        "blog-header-bg.png",
    ];
    for (index, _) in trimmed.match_indices('/') {
        let rest = &trimmed[index + 1..];
        if nested_roots.iter().any(|prefix| rest.starts_with(prefix)) {
            return Some(format!("/{rest}"));
        }
    }

    None
}

fn resolve_preview_public_asset_path(path: &str) -> Result<Option<PathBuf>, String> {
    let public_roots = [
        "/content-images/",
        "/content-slides/",
        "/card-images/",
        "/generated/",
    ];
    let is_public_asset = public_roots.iter().any(|prefix| path.starts_with(prefix))
        || matches!(path, "/blog-avatar.jpg" | "/blog-header-bg.png");
    if !is_public_asset {
        return Ok(None);
    }

    let public_root = get_workspace_root()?.join("apps/web/public");
    let Some(resolved) = resolve_child_path(&public_root, path.trim_start_matches('/')) else {
        return Err("invalid public asset path".to_string());
    };
    Ok(Some(resolved))
}

fn resolve_preview_shell_asset_path(shell_root: &Path, path: &str) -> Option<PathBuf> {
    resolve_child_path(shell_root, path.trim_start_matches('/'))
}

fn resolve_child_path(root: &Path, relative_path: &str) -> Option<PathBuf> {
    let mut resolved = root.to_path_buf();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(value) => resolved.push(value),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(resolved)
}

fn should_fallback_to_spa_index(path: &str) -> bool {
    path == "/"
        || Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_none()
}

fn content_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "pdf" => "application/pdf",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "xml" => "application/xml; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(headers.as_bytes())?;
    if !head_only {
        stream.write_all(body)?;
    }
    stream.flush()
}

fn wait_for_blog_preview_server(should_wait: bool) -> bool {
    if !should_wait {
        return is_blog_preview_server_ready();
    }

    let deadline = Instant::now() + BLOG_PREVIEW_WAIT_TIMEOUT;
    while Instant::now() < deadline {
        if is_blog_preview_server_ready() {
            return true;
        }

        thread::sleep(BLOG_PREVIEW_WAIT_STEP);
    }

    is_blog_preview_server_ready()
}

fn is_blog_preview_server_ready() -> bool {
    let addresses = [
        SocketAddr::from(([127, 0, 0, 1], BLOG_PREVIEW_PORT)),
        SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], BLOG_PREVIEW_PORT)),
    ];

    addresses.iter().any(probe_blog_preview_server)
}

fn probe_blog_preview_server(address: &SocketAddr) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(address, Duration::from_millis(120)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(BLOG_PREVIEW_HTTP_TIMEOUT));
    let _ = stream.set_write_timeout(Some(BLOG_PREVIEW_HTTP_TIMEOUT));

    let request = b"HEAD / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() || stream.flush().is_err() {
        return false;
    }

    let mut buffer = [0_u8; 96];
    match stream.read(&mut buffer) {
        Ok(bytes_read) if bytes_read > 0 => {
            let response = &buffer[..bytes_read];
            response.starts_with(b"HTTP/1.1 200") || response.starts_with(b"HTTP/1.0 200")
        }
        _ => false,
    }
}

struct TemporaryPublishDirectory {
    path: PathBuf,
}

impl TemporaryPublishDirectory {
    fn create() -> Result<Self, String> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("failed to create deployment timestamp: {error}"))?
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("inknote-publish-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&path)
            .map_err(|error| format!("failed to create temporary deployment directory: {error}"))?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TemporaryPublishDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn validate_publish_target(remote: &str, branch: &str) -> Result<(String, String), String> {
    let remote = remote.trim();
    let branch = branch.trim();
    if remote.is_empty() {
        return Err("请填写远程仓库地址。".to_string());
    }
    if remote.starts_with('-') || remote.chars().any(char::is_control) {
        return Err("远程仓库地址格式无效。".to_string());
    }
    if let Ok(parsed) = url::Url::parse(remote) {
        if matches!(parsed.scheme(), "http" | "https")
            && (!parsed.username().is_empty() || parsed.password().is_some())
        {
            return Err(
                "请勿在仓库地址中保存账号或令牌，请使用 Git Credential Manager 或 SSH。"
                    .to_string(),
            );
        }
    }
    if branch.is_empty() {
        return Err("请填写发布分支。".to_string());
    }
    if branch.eq_ignore_ascii_case("main") || branch.eq_ignore_ascii_case("master") {
        return Err("发布器会镜像整个分支，请使用 gh-pages 等专用部署分支。".to_string());
    }

    let command_directory = std::env::temp_dir();
    ensure_git_success(
        run_git_in(
            &command_directory,
            &["check-ref-format", "--branch", branch],
        )?,
        "validate deployment branch",
    )?;
    Ok((remote.to_string(), branch.to_string()))
}

fn create_git_ssh_command(ssh_key_path: Option<&str>) -> Result<Option<String>, String> {
    let key_path = ssh_key_path.unwrap_or_default().trim();
    if key_path.is_empty() {
        return Ok(None);
    }
    if key_path.chars().any(char::is_control) || key_path.contains('"') {
        return Err("SSH 私钥路径包含无效字符。".to_string());
    }
    if !Path::new(key_path).is_file() {
        return Err(format!("SSH 私钥不存在：{key_path}"));
    }

    let normalized_path = key_path.replace('\\', "/");
    Ok(Some(format!(
        "ssh -i \"{normalized_path}\" -o IdentitiesOnly=yes -o BatchMode=yes"
    )))
}

fn normalize_pages_base(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "/" {
        return Ok("/".to_string());
    }
    if !trimmed.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '/' | '-' | '_' | '.')
    }) || trimmed.split('/').any(|segment| segment == "..")
    {
        return Err("基础路径只能填写类似 /repository/ 的 URL 路径。".to_string());
    }

    Ok(format!("/{}/", trimmed.trim_matches('/')))
}

fn can_rebuild_web_shell_from_workspace() -> bool {
    get_workspace_root().ok().is_some_and(|root| {
        root.join("package.json").is_file()
            && root.join("apps/web/package.json").is_file()
            && root.join("apps/web/src").is_dir()
    })
}

fn rebuild_web_shell_from_workspace() -> Result<GitCommandResult, String> {
    let workspace_root = get_workspace_root()?;
    let mut command = Command::new(if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    });
    command
        .args(["run", "web:build"])
        .current_dir(&workspace_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| format!("failed to run `npm run web:build`: {error}"))?;

    Ok(GitCommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn create_runtime_web_artifact(base_path: &str) -> Result<TemporaryPublishDirectory, String> {
    let artifact = TemporaryPublishDirectory::create()?;
    let web_shell_root = get_web_shell_root()?;
    copy_directory_contents(&web_shell_root, artifact.path())?;

    let public_assets = get_workspace_root()?.join("apps/web/public");
    if public_assets.is_dir() {
        copy_directory_contents(&public_assets, artifact.path())?;
    }

    let payload = create_runtime_content_payload()?;
    let serialized = serde_json::to_string(&payload)
        .map_err(|error| format!("failed to serialize runtime content: {error}"))?;
    fs::write(artifact.path().join("inknote-content.json"), serialized)
        .map_err(|error| format!("failed to write runtime content manifest: {error}"))?;
    prepare_spa_artifact(artifact.path(), base_path)?;
    Ok(artifact)
}

fn create_runtime_content_payload() -> Result<RuntimeContentPayload, String> {
    let content = get_content_root()?;
    Ok(RuntimeContentPayload {
        navigation: read_json_value(&content.join("site/navigation.json"))?,
        site_config: read_json_value(&content.join("site/site.config.json"))?,
        categories: read_json_value(&content.join("site/categories.json"))?,
        markdown: read_markdown_collection(&content, "markdown")?,
        inknotes: read_markdown_collection(&content, "inknotes")?,
        inknote_projects: read_inknote_project_collection(&content)?,
    })
}

fn create_runtime_rss_feed() -> Result<String, String> {
    let payload = create_runtime_content_payload()?;
    Ok(generate_runtime_rss_feed(&payload))
}

fn generate_runtime_rss_feed(payload: &RuntimeContentPayload) -> String {
    let title =
        json_string(&payload.site_config, "title").unwrap_or_else(|| "Chty's Blog".to_string());
    let description = json_string(&payload.site_config, "description")
        .or_else(|| json_string(&payload.site_config, "tagline"))
        .unwrap_or_else(|| title.clone());
    let language =
        json_string(&payload.site_config, "language").unwrap_or_else(|| "zh-CN".to_string());
    let author = json_string(&payload.site_config, "author").unwrap_or_default();
    let repository = payload
        .site_config
        .get("repository")
        .and_then(serde_json::Value::as_object);
    let site_url = normalize_rss_site_url(
        json_string(&payload.site_config, "baseUrl")
            .or_else(|| repository.and_then(|value| json_object_string(value, "pagesUrl")))
            .unwrap_or_default(),
    );

    let mut documents = Vec::new();
    documents.extend(
        payload
            .markdown
            .iter()
            .filter_map(|(id, raw)| parse_runtime_feed_document("markdown", id, raw)),
    );
    documents.extend(
        payload
            .inknotes
            .iter()
            .filter_map(|(id, raw)| parse_runtime_feed_document("inknote", id, raw)),
    );
    documents.sort_by(|left, right| {
        runtime_feed_sort_key(right)
            .cmp(&runtime_feed_sort_key(left))
            .then_with(|| right.title.cmp(&left.title))
    });

    let mut items = String::new();
    for document in documents.into_iter().take(50) {
        let link = join_rss_url(&site_url, &document.href);
        let description_text = if document.summary.trim().is_empty() {
            truncate_chars(&strip_markdown_for_rss(&document.body), 240)
        } else {
            document.summary.clone()
        };

        items.push_str("    <item>\n");
        items.push_str(&format!(
            "      <title>{}</title>\n",
            escape_xml(&document.title)
        ));
        items.push_str(&format!("      <link>{}</link>\n", escape_xml(&link)));
        items.push_str(&format!(
            "      <guid isPermaLink=\"true\">{}</guid>\n",
            escape_xml(&link)
        ));
        if let Some(date) =
            non_empty_string(document.updated_at).or_else(|| non_empty_string(document.date))
        {
            items.push_str(&format!("      <pubDate>{}</pubDate>\n", escape_xml(&date)));
        }
        items.push_str(&format!(
            "      <description>{}</description>\n",
            escape_xml(&description_text)
        ));
        for tag in document.tags {
            items.push_str(&format!(
                "      <category>{}</category>\n",
                escape_xml(&tag)
            ));
        }
        items.push_str("    </item>\n");
    }

    [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string(),
        "<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">".to_string(),
        "  <channel>".to_string(),
        format!("    <title>{}</title>", escape_xml(&title)),
        format!(
            "    <link>{}</link>",
            escape_xml(if site_url.is_empty() { "/" } else { &site_url })
        ),
        format!(
            "    <description>{}</description>",
            escape_xml(&description)
        ),
        format!("    <language>{}</language>", escape_xml(&language)),
        if author.is_empty() {
            String::new()
        } else {
            format!(
                "    <managingEditor>{}</managingEditor>",
                escape_xml(&author)
            )
        },
        format!(
            "    <atom:link href=\"{}\" rel=\"self\" type=\"application/rss+xml\" />",
            escape_xml(&join_rss_url(&site_url, "/rss.xml"))
        ),
        items.trim_end().to_string(),
        "  </channel>".to_string(),
        "</rss>".to_string(),
        String::new(),
    ]
    .into_iter()
    .filter(|line| !line.is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

fn parse_runtime_feed_document(
    collection_type: &str,
    id: &str,
    raw: &str,
) -> Option<RuntimeFeedDocument> {
    let (frontmatter, body) = parse_markdown_frontmatter(raw);
    let document_type = frontmatter_string(&frontmatter, "type")?;
    if document_type != collection_type {
        return None;
    }
    if !frontmatter_bool(&frontmatter, "published") {
        return None;
    }

    let folder = content_entry_folder(id).unwrap_or_else(|| collection_type.to_string());
    let slug = frontmatter_string(&frontmatter, "slug").unwrap_or(folder);
    let permalink = frontmatter_string(&frontmatter, "permalink").unwrap_or_default();
    let href = if collection_type == "markdown" {
        if permalink.trim().is_empty() {
            format!("/notes/{slug}")
        } else if permalink.starts_with('/') {
            permalink
        } else {
            format!("/{permalink}")
        }
    } else {
        format!("/inknote/{slug}")
    };

    Some(RuntimeFeedDocument {
        title: frontmatter_string(&frontmatter, "title").unwrap_or_else(|| slug.clone()),
        href,
        date: frontmatter_string(&frontmatter, "date").unwrap_or_default(),
        updated_at: frontmatter_string(&frontmatter, "updatedAt").unwrap_or_default(),
        summary: frontmatter_string(&frontmatter, "summary").unwrap_or_default(),
        body,
        tags: frontmatter_string_array(&frontmatter, "tags"),
    })
}

fn parse_markdown_frontmatter(raw: &str) -> (BTreeMap<String, serde_json::Value>, String) {
    let normalized = raw.trim_start_matches('\u{feff}');
    let mut frontmatter = BTreeMap::new();
    let mut lines = normalized.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (frontmatter, normalized.trim().to_string());
    }

    let mut frontmatter_lines = Vec::new();
    let mut body_lines = Vec::new();
    let mut in_frontmatter = true;
    for line in lines {
        if in_frontmatter && line.trim() == "---" {
            in_frontmatter = false;
            continue;
        }

        if in_frontmatter {
            frontmatter_lines.push(line.to_string());
        } else {
            body_lines.push(line.to_string());
        }
    }

    let mut index = 0_usize;
    while index < frontmatter_lines.len() {
        let line = frontmatter_lines[index].trim_end();
        let Some((key, rest)) = line.split_once(':') else {
            index += 1;
            continue;
        };
        let key = key.trim();
        if key.is_empty()
            || !key
                .chars()
                .next()
                .is_some_and(|value| value.is_ascii_alphabetic())
        {
            index += 1;
            continue;
        }

        let inline_value = rest.trim();
        if inline_value.is_empty() {
            let mut values = Vec::new();
            while index + 1 < frontmatter_lines.len() {
                let next = frontmatter_lines[index + 1].trim_start();
                let Some(value) = next.strip_prefix("- ") else {
                    break;
                };
                values.push(serde_json::Value::String(
                    parse_frontmatter_scalar(value).to_string_value(),
                ));
                index += 1;
            }
            frontmatter.insert(key.to_string(), serde_json::Value::Array(values));
        } else {
            frontmatter.insert(key.to_string(), parse_frontmatter_scalar(inline_value));
        }
        index += 1;
    }

    (frontmatter, body_lines.join("\n").trim().to_string())
}

fn parse_frontmatter_scalar(value: &str) -> serde_json::Value {
    let trimmed = value.trim();
    if trimmed == "true" {
        return serde_json::Value::Bool(true);
    }
    if trimmed == "false" {
        return serde_json::Value::Bool(false);
    }
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        return serde_json::Value::String(trimmed[1..trimmed.len().saturating_sub(1)].to_string());
    }
    serde_json::Value::String(trimmed.to_string())
}

trait FrontmatterScalarExt {
    fn to_string_value(&self) -> String;
}

impl FrontmatterScalarExt for serde_json::Value {
    fn to_string_value(&self) -> String {
        match self {
            serde_json::Value::Bool(value) => value.to_string(),
            serde_json::Value::String(value) => value.clone(),
            _ => String::new(),
        }
    }
}

fn frontmatter_string(
    frontmatter: &BTreeMap<String, serde_json::Value>,
    key: &str,
) -> Option<String> {
    match frontmatter.get(key) {
        Some(serde_json::Value::String(value)) if !value.trim().is_empty() => {
            Some(value.trim().to_string())
        }
        Some(serde_json::Value::Bool(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn frontmatter_bool(frontmatter: &BTreeMap<String, serde_json::Value>, key: &str) -> bool {
    match frontmatter.get(key) {
        Some(serde_json::Value::Bool(value)) => *value,
        Some(serde_json::Value::String(value)) => value.trim() == "true",
        _ => false,
    }
}

fn frontmatter_string_array(
    frontmatter: &BTreeMap<String, serde_json::Value>,
    key: &str,
) -> Vec<String> {
    frontmatter
        .get(key)
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn json_object_string(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<String> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn content_entry_folder(id: &str) -> Option<String> {
    id.replace('\\', "/")
        .split('/')
        .rev()
        .nth(1)
        .map(ToString::to_string)
        .filter(|value| !value.is_empty())
}

fn runtime_feed_sort_key(document: &RuntimeFeedDocument) -> String {
    if !document.updated_at.trim().is_empty() {
        document.updated_at.clone()
    } else {
        document.date.clone()
    }
}

fn normalize_rss_site_url(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains("example.github.io") {
        return String::new();
    }
    trimmed.trim_end_matches('/').to_string()
}

fn join_rss_url(base_url: &str, href: &str) -> String {
    if base_url.trim().is_empty() {
        return href.to_string();
    }
    if href.starts_with('/') {
        format!("{base_url}{href}")
    } else {
        format!("{base_url}/{href}")
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn strip_markdown_for_rss(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => {
                in_tag = true;
                output.push(' ');
            }
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if in_tag => {}
            '#' | '*' | '_' | '-' | '~' | '[' | ']' | '(' | ')' | '`' | '!' | '|' => {
                output.push(' ')
            }
            '\n' | '\r' | '\t' => output.push(' '),
            _ => output.push(character),
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn non_empty_string(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn summarize_runtime_manifest(artifact_root: &Path) -> Result<String, String> {
    let manifest_path = artifact_root.join("inknote-content.json");
    let manifest = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("failed to read {}: {error}", manifest_path.display()))?;
    let payload: RuntimeContentPayload =
        serde_json::from_str(manifest.trim_start_matches('\u{feff}'))
            .map_err(|error| format!("failed to parse {}: {error}", manifest_path.display()))?;

    let title = payload
        .site_config
        .get("title")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("(untitled)");
    let tagline = payload
        .site_config
        .get("tagline")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let category_count = payload
        .categories
        .as_array()
        .map(|items| items.len())
        .unwrap_or(0);

    Ok(format!(
        "标题：{title}\n签名：{tagline}\n类目：{category_count}\nMarkdown：{}\nInkNote：{}",
        payload.markdown.len(),
        payload.inknotes.len()
    ))
}

fn restore_runtime_content_payload(
    payload: &RuntimeContentPayload,
    conflict_strategy: ContentSyncConflictStrategy,
) -> Result<(), String> {
    write_json_content_file(
        "site/navigation.json",
        &payload.navigation,
        conflict_strategy,
    )?;
    write_json_content_file(
        "site/site.config.json",
        &payload.site_config,
        conflict_strategy,
    )?;
    write_json_content_file(
        "site/categories.json",
        &payload.categories,
        conflict_strategy,
    )?;

    for (path, contents) in &payload.markdown {
        restore_manifest_content_file(path, contents, conflict_strategy)?;
    }
    for (path, contents) in &payload.inknotes {
        restore_manifest_content_file(path, contents, conflict_strategy)?;
    }
    for (path, contents) in &payload.inknote_projects {
        restore_manifest_content_file(path, contents, conflict_strategy)?;
    }

    Ok(())
}

fn write_json_content_file(
    relative_path: &str,
    value: &serde_json::Value,
    conflict_strategy: ContentSyncConflictStrategy,
) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize content/{relative_path}: {error}"))?;
    write_content_file_with_strategy(relative_path, &format!("{serialized}\n"), conflict_strategy)
}

fn restore_manifest_content_file(
    path: &str,
    contents: &str,
    conflict_strategy: ContentSyncConflictStrategy,
) -> Result<(), String> {
    let relative_path = path
        .strip_prefix("content/")
        .ok_or_else(|| format!("invalid runtime content path: {path}"))?;
    write_content_file_with_strategy(relative_path, contents, conflict_strategy)
}

fn write_content_file_with_strategy(
    relative_path: &str,
    contents: &str,
    conflict_strategy: ContentSyncConflictStrategy,
) -> Result<(), String> {
    let resolved = resolve_content_path(relative_path)?;
    if resolved.exists() {
        if resolved.is_dir() {
            if conflict_strategy == ContentSyncConflictStrategy::Local {
                return Ok(());
            }
            fs::remove_dir_all(&resolved)
                .map_err(|error| format!("failed to replace content/{relative_path}: {error}"))?;
        } else {
            let current = fs::read_to_string(&resolved).unwrap_or_default();
            if current == contents || conflict_strategy == ContentSyncConflictStrategy::Local {
                return Ok(());
            }
        }
    }

    ensure_parent_directory(&resolved.to_string_lossy())?;
    fs::write(&resolved, contents)
        .map_err(|error| format!("failed to restore content/{relative_path}: {error}"))
}

fn restore_runtime_public_assets(
    artifact_root: &Path,
    conflict_strategy: ContentSyncConflictStrategy,
) -> Result<(), String> {
    let public_root = get_workspace_root()?.join("apps/web/public");
    fs::create_dir_all(&public_root)
        .map_err(|error| format!("failed to create public asset directory: {error}"))?;

    for directory in [
        "content-images",
        "content-slides",
        "card-images",
        "generated",
    ] {
        merge_public_asset_path(
            &artifact_root.join(directory),
            &public_root.join(directory),
            conflict_strategy,
        )?;
    }
    for file in ["blog-avatar.jpg", "blog-header-bg.png"] {
        merge_public_asset_path(
            &artifact_root.join(file),
            &public_root.join(file),
            conflict_strategy,
        )?;
    }

    Ok(())
}

fn merge_public_asset_path(
    source: &Path,
    target: &Path,
    conflict_strategy: ContentSyncConflictStrategy,
) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }

    if !target.exists() {
        return copy_public_asset_path(source, target);
    }

    let source_metadata = fs::metadata(source)
        .map_err(|error| format!("failed to inspect {}: {error}", source.display()))?;
    let target_metadata = fs::metadata(target)
        .map_err(|error| format!("failed to inspect {}: {error}", target.display()))?;

    if source_metadata.is_dir() && target_metadata.is_dir() {
        for entry in fs::read_dir(source).map_err(|error| {
            format!(
                "failed to read public asset directory {}: {error}",
                source.display()
            )
        })? {
            let entry =
                entry.map_err(|error| format!("failed to inspect public asset entry: {error}"))?;
            merge_public_asset_path(
                &entry.path(),
                &target.join(entry.file_name()),
                conflict_strategy,
            )?;
        }
        return Ok(());
    }

    if source_metadata.is_file() && target_metadata.is_file() {
        let source_bytes = fs::read(source).map_err(|error| {
            format!("failed to read public asset {}: {error}", source.display())
        })?;
        let target_bytes = fs::read(target).map_err(|error| {
            format!("failed to read public asset {}: {error}", target.display())
        })?;
        if source_bytes == target_bytes || conflict_strategy == ContentSyncConflictStrategy::Local {
            return Ok(());
        }
        ensure_parent_directory(&target.to_string_lossy())?;
        fs::write(target, source_bytes).map_err(|error| {
            format!(
                "failed to overwrite public asset {} from {}: {error}",
                target.display(),
                source.display()
            )
        })?;
        return Ok(());
    }

    if conflict_strategy == ContentSyncConflictStrategy::Local {
        return Ok(());
    }

    clear_path(target)?;
    copy_public_asset_path(source, target)
}

fn copy_public_asset_path(source: &Path, target: &Path) -> Result<(), String> {
    if source.is_dir() {
        copy_directory_contents(source, target)
    } else {
        copy_file_overwriting(source, target)
    }
}

fn clear_path(path: &Path) -> Result<(), String> {
    make_path_writable_recursive(path)?;
    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("failed to clear {}: {error}", path.display()))
    } else {
        fs::remove_file(path)
            .map_err(|error| format!("failed to clear {}: {error}", path.display()))
    }
}

fn read_json_value(path: &Path) -> Result<serde_json::Value, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let raw = raw.trim_start_matches('\u{feff}');
    serde_json::from_str(raw)
        .map_err(|error| format!("failed to parse {}: {error}", path.display()))
}

fn read_markdown_collection(
    content_root: &Path,
    collection: &str,
) -> Result<BTreeMap<String, String>, String> {
    let directory = content_root.join(collection);
    let mut documents = BTreeMap::new();
    if !directory.is_dir() {
        return Ok(documents);
    }

    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("failed to read {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("failed to inspect content entry: {error}"))?;
        if !entry
            .file_type()
            .map_err(|error| format!("failed to inspect content entry type: {error}"))?
            .is_dir()
        {
            continue;
        }

        let markdown_path = entry.path().join("index.md");
        if !markdown_path.is_file() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        let id = format!("content/{collection}/{folder}/index.md");
        let raw = fs::read_to_string(&markdown_path)
            .map_err(|error| format!("failed to read {}: {error}", markdown_path.display()))?;
        documents.insert(id, raw);
    }
    Ok(documents)
}

fn read_inknote_project_collection(
    content_root: &Path,
) -> Result<BTreeMap<String, String>, String> {
    let directory = content_root.join("inknotes");
    let mut projects = BTreeMap::new();
    if !directory.is_dir() {
        return Ok(projects);
    }

    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("failed to read {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("failed to inspect inknote entry: {error}"))?;
        if !entry
            .file_type()
            .map_err(|error| format!("failed to inspect inknote entry type: {error}"))?
            .is_dir()
        {
            continue;
        }

        let folder = entry.file_name().to_string_lossy().to_string();
        for project_entry in fs::read_dir(entry.path())
            .map_err(|error| format!("failed to read {}: {error}", entry.path().display()))?
        {
            let project_entry = project_entry
                .map_err(|error| format!("failed to inspect inknote project: {error}"))?;
            if !project_entry
                .file_type()
                .map_err(|error| format!("failed to inspect inknote project type: {error}"))?
                .is_file()
            {
                continue;
            }

            let file_name = project_entry.file_name().to_string_lossy().to_string();
            if !file_name.ends_with(".inknote.json") {
                continue;
            }

            let project_path = project_entry.path();
            let id = format!("content/inknotes/{folder}/{file_name}");
            let raw = fs::read_to_string(&project_path)
                .map_err(|error| format!("failed to read {}: {error}", project_path.display()))?;
            projects.insert(id, raw);
        }
    }

    Ok(projects)
}

fn prepare_spa_artifact(dist: &Path, base_path: &str) -> Result<(), String> {
    let index_path = dist.join("index.html");
    let index = fs::read_to_string(&index_path)
        .map_err(|error| format!("failed to read static site entry: {error}"))?;
    let index = rewrite_spa_entry_html(&index, base_path)?;
    fs::write(&index_path, &index)
        .map_err(|error| format!("failed to configure static site base path: {error}"))?;
    fs::write(dist.join("404.html"), index)
        .map_err(|error| format!("failed to create SPA fallback: {error}"))?;
    fs::write(dist.join(".nojekyll"), b"")
        .map_err(|error| format!("failed to create .nojekyll: {error}"))
}

fn rewrite_spa_entry_html(index: &str, base_path: &str) -> Result<String, String> {
    let base_tag = format!("<base href=\"{base_path}\" />");
    let index = if let Some(base_start) = index.find("<base ") {
        let base_end = index[base_start..]
            .find('>')
            .map(|offset| base_start + offset + 1)
            .ok_or_else(|| "invalid base tag in static site entry".to_string())?;
        format!("{}{}{}", &index[..base_start], base_tag, &index[base_end..])
    } else {
        index.replacen("<head>", &format!("<head>{base_tag}"), 1)
    };
    let asset_prefix = format!("{base_path}assets/");
    let index = index
        .replace("src=\"/assets/", &format!("src=\"{asset_prefix}"))
        .replace("href=\"/assets/", &format!("href=\"{asset_prefix}"))
        .replace("src=\"./assets/", &format!("src=\"{asset_prefix}"))
        .replace("href=\"./assets/", &format!("href=\"{asset_prefix}"))
        .replace("src=\"assets/", &format!("src=\"{asset_prefix}"))
        .replace("href=\"assets/", &format!("href=\"{asset_prefix}"))
        .replace("src='/assets/", &format!("src='{asset_prefix}"))
        .replace("href='/assets/", &format!("href='{asset_prefix}"))
        .replace("src='./assets/", &format!("src='{asset_prefix}"))
        .replace("href='./assets/", &format!("href='{asset_prefix}"))
        .replace("src='assets/", &format!("src='{asset_prefix}"))
        .replace("href='assets/", &format!("href='{asset_prefix}"));
    Ok(index)
}

fn mirror_deployment_artifact(source: &Path, target: &Path) -> Result<(), String> {
    let preserved_cname = fs::read(target.join("CNAME")).ok();

    for entry in fs::read_dir(target)
        .map_err(|error| format!("failed to inspect deployment directory: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to inspect deployment entry: {error}"))?;
        if entry.file_name() == ".git" {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|error| {
                format!(
                    "failed to clear deployment directory {}: {error}",
                    path.display()
                )
            })?;
        } else {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "failed to clear deployment file {}: {error}",
                    path.display()
                )
            })?;
        }
    }

    copy_directory_contents(source, target)?;
    if !target.join("CNAME").exists() {
        if let Some(cname) = preserved_cname {
            fs::write(target.join("CNAME"), cname)
                .map_err(|error| format!("failed to preserve CNAME: {error}"))?;
        }
    }
    Ok(())
}

fn copy_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| {
        format!(
            "failed to create deployment directory {}: {error}",
            target.display()
        )
    })?;

    for entry in fs::read_dir(source).map_err(|error| {
        format!(
            "failed to read build directory {}: {error}",
            source.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("failed to inspect build artifact: {error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| format!("failed to inspect {}: {error}", source_path.display()))?;

        if file_type.is_dir() {
            copy_directory_contents(&source_path, &target_path)?;
        } else if file_type.is_file() {
            copy_file_overwriting(&source_path, &target_path)?;
        }
    }
    Ok(())
}

fn copy_file_overwriting(source: &Path, target: &Path) -> Result<(), String> {
    ensure_parent_directory(&target.to_string_lossy())?;
    if target.exists() {
        clear_path(target)?;
    }

    fs::copy(source, target).map(|_| ()).map_err(|error| {
        format!(
            "failed to copy file {} to {}: {error}",
            source.display(),
            target.display()
        )
    })?;
    make_path_writable(target)
}

fn make_path_writable(path: &Path) -> Result<(), String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "failed to inspect file permissions for {}: {error}",
                path.display()
            ))
        }
    };
    let mut permissions = metadata.permissions();
    if permissions.readonly() {
        permissions.set_readonly(false);
        fs::set_permissions(path, permissions).map_err(|error| {
            format!(
                "failed to update permissions for {}: {error}",
                path.display()
            )
        })?;
    }
    Ok(())
}

fn make_path_writable_recursive(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|error| {
            format!(
                "failed to read directory permissions for {}: {error}",
                path.display()
            )
        })? {
            let entry = entry.map_err(|error| {
                format!("failed to inspect directory entry permissions: {error}")
            })?;
            make_path_writable_recursive(&entry.path())?;
        }
    }

    make_path_writable(path)
}

fn short_commit(value: &str) -> &str {
    value.get(..7).unwrap_or(value)
}

fn get_workspace_root() -> Result<PathBuf, String> {
    WORKSPACE_ROOT
        .get()
        .cloned()
        .ok_or_else(|| "workspace root is not initialized".to_string())
}

fn get_web_shell_root() -> Result<PathBuf, String> {
    if let Ok(workspace_root) = get_workspace_root() {
        let workspace_web_dist = workspace_root.join("apps/web/dist");
        if workspace_root.join("apps/web/src").is_dir()
            && workspace_web_dist.join("index.html").is_file()
        {
            return Ok(workspace_web_dist);
        }
    }

    let root = WEB_SHELL_ROOT
        .get()
        .cloned()
        .ok_or_else(|| "web shell root is not initialized".to_string())?;
    if !root.join("index.html").is_file() {
        return Err("预编译 Web 外壳不存在，请先执行桌面打包构建。".to_string());
    }
    Ok(root)
}

fn run_git_in(directory: &Path, args: &[&str]) -> Result<GitCommandResult, String> {
    run_git_in_with_ssh(directory, args, None)
}

fn run_git_in_with_ssh(
    directory: &Path,
    args: &[&str],
    ssh_command: Option<&str>,
) -> Result<GitCommandResult, String> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(directory)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never");
    apply_git_system_proxy_env(&mut command);
    if let Some(ssh_command) = ssh_command {
        command.env("GIT_SSH_COMMAND", ssh_command);
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| format!("failed to run git {:?}: {error}", args))?;

    Ok(GitCommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn run_git_in_with_ssh_progress<F>(
    directory: &Path,
    args: &[&str],
    ssh_command: Option<&str>,
    mut on_progress: F,
) -> Result<GitCommandResult, String>
where
    F: FnMut(&str),
{
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(directory)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_git_system_proxy_env(&mut command);
    if let Some(ssh_command) = ssh_command {
        command.env("GIT_SSH_COMMAND", ssh_command);
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to run git {:?}: {error}", args))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("failed to capture git stdout for {:?}", args))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("failed to capture git stderr for {:?}", args))?;
    let (sender, receiver) = mpsc::channel::<(bool, String)>();
    let stdout_reader = spawn_process_stream_reader(stdout, false, sender.clone());
    let stderr_reader = spawn_process_stream_reader(stderr, true, sender);
    let mut stdout_lines = Vec::new();
    let mut stderr_lines = Vec::new();
    let status = loop {
        while let Ok((is_stderr, chunk)) = receiver.try_recv() {
            if is_stderr {
                let trimmed = chunk.trim();
                if !trimmed.is_empty() {
                    on_progress(trimmed);
                    stderr_lines.push(trimmed.to_string());
                }
            } else {
                let trimmed = chunk.trim();
                if !trimmed.is_empty() {
                    stdout_lines.push(trimmed.to_string());
                }
            }
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("failed to wait for git {:?}: {error}", args))?
        {
            break status;
        }
        thread::sleep(Duration::from_millis(80));
    };

    let _ = stdout_reader.join();
    let _ = stderr_reader.join();
    while let Ok((is_stderr, chunk)) = receiver.try_recv() {
        let trimmed = chunk.trim();
        if trimmed.is_empty() {
            continue;
        }
        if is_stderr {
            on_progress(trimmed);
            stderr_lines.push(trimmed.to_string());
        } else {
            stdout_lines.push(trimmed.to_string());
        }
    }

    Ok(GitCommandResult {
        success: status.success(),
        stdout: dedupe_git_stream_lines(stdout_lines).join("\n"),
        stderr: dedupe_git_stream_lines(stderr_lines).join("\n"),
    })
}

fn spawn_process_stream_reader<R: Read + Send + 'static>(
    mut reader: R,
    is_stderr: bool,
    sender: mpsc::Sender<(bool, String)>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        let mut segment = Vec::new();
        loop {
            let Ok(read) = reader.read(&mut buffer) else {
                break;
            };
            if read == 0 {
                break;
            }

            for byte in &buffer[..read] {
                match *byte {
                    b'\r' | b'\n' => {
                        if !segment.is_empty() {
                            let line = String::from_utf8_lossy(&segment).to_string();
                            let _ = sender.send((is_stderr, line));
                            segment.clear();
                        }
                    }
                    value => segment.push(value),
                }
            }
        }

        if !segment.is_empty() {
            let line = String::from_utf8_lossy(&segment).to_string();
            let _ = sender.send((is_stderr, line));
        }
    })
}

fn dedupe_git_stream_lines(lines: Vec<String>) -> Vec<String> {
    let mut output = Vec::new();
    for line in lines {
        if output.last().is_some_and(|previous| previous == &line) {
            continue;
        }
        output.push(line);
    }
    output
}

fn emit_git_transfer_progress(
    reporter: &PublishProgressReporter,
    base_progress: u8,
    span: u8,
    stage: &str,
    message: &str,
    line: &str,
    last_progress: &mut Option<u8>,
) {
    let Some(percent) = extract_git_progress_percent(line) else {
        return;
    };
    let phase_progress = map_git_transfer_phase_progress(line, percent);
    let progress =
        base_progress.saturating_add(((span as u16 * phase_progress as u16) / 100) as u8);
    if last_progress.is_some_and(|previous| progress <= previous && progress < 100) {
        return;
    }
    *last_progress = Some(progress);
    reporter.emit(
        progress,
        stage,
        message,
        describe_git_progress_line(line, percent),
        "info",
    );
}

fn map_git_transfer_phase_progress(line: &str, percent: u8) -> u8 {
    let percent = percent.min(100) as u16;
    let mapped = if line.contains("Counting objects") {
        percent * 15 / 100
    } else if line.contains("Compressing objects") {
        15 + percent * 25 / 100
    } else if line.contains("Receiving objects") {
        40 + percent * 40 / 100
    } else if line.contains("Resolving deltas") {
        80 + percent * 20 / 100
    } else if line.contains("Writing objects") {
        40 + percent * 55 / 100
    } else if line.contains("Enumerating objects") {
        5
    } else {
        percent
    };
    mapped.min(100) as u8
}

fn extract_git_progress_percent(line: &str) -> Option<u8> {
    let percent_index = line.find('%')?;
    let before_percent = &line[..percent_index];
    let digits: String = before_percent
        .chars()
        .rev()
        .skip_while(|character| character.is_whitespace())
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u8>().ok().map(|value| value.min(100))
}

fn describe_git_progress_line(line: &str, percent: u8) -> String {
    let label = if line.contains("Receiving objects") {
        "正在下载远端对象"
    } else if line.contains("Resolving deltas") {
        "正在解析远端变更"
    } else if line.contains("Counting objects") {
        "正在统计对象"
    } else if line.contains("Compressing objects") {
        "正在压缩对象"
    } else if line.contains("Writing objects") {
        "正在上传站点文件"
    } else if line.contains("Enumerating objects") {
        "正在准备对象"
    } else {
        "Git 正在处理"
    };
    format!("{label}：{percent}%")
}

#[cfg(target_os = "windows")]
fn apply_git_system_proxy_env(command: &mut Command) {
    let Some(proxy_env) = read_windows_system_proxy_env() else {
        return;
    };

    if let Some(value) = proxy_env.http_proxy.as_ref() {
        command.env("HTTP_PROXY", value).env("http_proxy", value);
    }
    if let Some(value) = proxy_env.https_proxy.as_ref() {
        command.env("HTTPS_PROXY", value).env("https_proxy", value);
    }
    if let Some(value) = proxy_env.all_proxy.as_ref() {
        command.env("ALL_PROXY", value).env("all_proxy", value);
    }
    if let Some(value) = proxy_env.no_proxy.as_ref() {
        command.env("NO_PROXY", value).env("no_proxy", value);
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_git_system_proxy_env(_command: &mut Command) {}

#[cfg(target_os = "windows")]
fn describe_git_system_proxy(remote: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    match read_windows_system_proxy_env() {
        Some(proxy_env) => {
            lines.push("系统代理：已读取并注入给 Git".to_string());
            if let Some(value) = proxy_env.http_proxy.as_ref() {
                lines.push(format!("HTTP：{value}"));
            }
            if let Some(value) = proxy_env.https_proxy.as_ref() {
                lines.push(format!("HTTPS：{value}"));
            }
            if let Some(value) = proxy_env.all_proxy.as_ref() {
                lines.push(format!("ALL：{value}"));
            }
            if let Some(value) = proxy_env.no_proxy.as_ref() {
                lines.push(format!("忽略：{value}"));
            }
        }
        None => {
            lines.push("系统代理：未启用或未读取到，Git 将使用自身配置/进程环境变量。".to_string());
        }
    }

    if is_ssh_remote(remote) {
        lines.push("远程类型：SSH，HTTP/HTTPS 系统代理不会直接代理 SSH。".to_string());
    } else if remote.starts_with("http://") || remote.starts_with("https://") {
        lines.push("远程类型：HTTPS/HTTP，Git 会使用上述代理环境。".to_string());
    } else {
        lines.push("远程类型：本地路径或其它协议。".to_string());
    }

    lines.join("\n")
}

#[cfg(not(target_os = "windows"))]
fn describe_git_system_proxy(remote: &str) -> String {
    if is_ssh_remote(remote) {
        "系统代理：当前平台未自动读取系统代理；远程类型：SSH。".to_string()
    } else {
        "系统代理：当前平台未自动读取系统代理，Git 将使用自身配置/进程环境变量。".to_string()
    }
}

fn is_ssh_remote(remote: &str) -> bool {
    let trimmed = remote.trim();
    trimmed.starts_with("ssh://")
        || trimmed.starts_with("git@")
        || (trimmed.contains('@') && trimmed.contains(':') && !trimmed.contains("://"))
}

#[cfg(target_os = "windows")]
fn read_windows_system_proxy_env() -> Option<GitProxyEnv> {
    let proxy_enabled = query_windows_internet_setting("ProxyEnable")
        .map(|value| parse_windows_proxy_enabled(&value))
        .unwrap_or(false);
    if !proxy_enabled {
        return None;
    }

    let proxy_server = query_windows_internet_setting("ProxyServer")?;
    let mut proxy_env = parse_windows_proxy_server(&proxy_server);
    proxy_env.no_proxy = normalize_windows_proxy_override(
        &query_windows_internet_setting("ProxyOverride").unwrap_or_default(),
    );

    if proxy_env.http_proxy.is_none()
        && proxy_env.https_proxy.is_none()
        && proxy_env.all_proxy.is_none()
    {
        None
    } else {
        Some(proxy_env)
    }
}

#[cfg(target_os = "windows")]
fn query_windows_internet_setting(value_name: &str) -> Option<String> {
    let mut command = Command::new("reg");
    command
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            "/v",
            value_name,
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null());

    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_reg_query_value(&stdout, value_name)
}

#[cfg(target_os = "windows")]
fn parse_reg_query_value(output: &str, value_name: &str) -> Option<String> {
    for line in output.lines() {
        let mut parts = line.split_whitespace();
        if parts.next() != Some(value_name) {
            continue;
        }
        parts.next()?;
        let value = parts.collect::<Vec<_>>().join(" ");
        if value.trim().is_empty() {
            return None;
        }
        return Some(value.trim().to_string());
    }
    None
}

#[cfg(target_os = "windows")]
fn parse_windows_proxy_enabled(value: &str) -> bool {
    let trimmed = value.trim();
    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        return u32::from_str_radix(hex, 16).unwrap_or(0) != 0;
    }
    trimmed.parse::<u32>().unwrap_or(0) != 0
}

#[cfg(target_os = "windows")]
fn parse_windows_proxy_server(value: &str) -> GitProxyEnv {
    let mut proxy_env = GitProxyEnv::default();
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return proxy_env;
    }

    if trimmed.contains('=') {
        for part in trimmed.split(';') {
            let Some((kind, address)) = part.split_once('=') else {
                continue;
            };
            match kind.trim().to_ascii_lowercase().as_str() {
                "http" => proxy_env.http_proxy = normalize_proxy_address(address, "http"),
                "https" => proxy_env.https_proxy = normalize_proxy_address(address, "http"),
                "socks" | "socks4" | "socks5" => {
                    proxy_env.all_proxy = normalize_proxy_address(address, "socks5h")
                }
                _ => {}
            }
        }
    } else if let Some(proxy) = normalize_proxy_address(trimmed, "http") {
        proxy_env.http_proxy = Some(proxy.clone());
        proxy_env.https_proxy = Some(proxy.clone());
        proxy_env.all_proxy = Some(proxy);
    }

    if proxy_env.https_proxy.is_none() {
        proxy_env.https_proxy = proxy_env.http_proxy.clone();
    }
    if proxy_env.http_proxy.is_none() {
        proxy_env.http_proxy = proxy_env.https_proxy.clone();
    }

    proxy_env
}

#[cfg(target_os = "windows")]
fn normalize_proxy_address(value: &str, fallback_scheme: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains("://") {
        return Some(trimmed.to_string());
    }
    Some(format!("{fallback_scheme}://{trimmed}"))
}

#[cfg(target_os = "windows")]
fn normalize_windows_proxy_override(value: &str) -> Option<String> {
    let mut entries: Vec<String> = Vec::new();
    for part in value.split(';') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.eq_ignore_ascii_case("<local>") {
            push_unique_no_proxy(&mut entries, "localhost");
            push_unique_no_proxy(&mut entries, "127.0.0.1");
            push_unique_no_proxy(&mut entries, "::1");
        } else {
            push_unique_no_proxy(&mut entries, trimmed);
        }
    }

    if entries.is_empty() {
        None
    } else {
        Some(entries.join(","))
    }
}

#[cfg(target_os = "windows")]
fn push_unique_no_proxy(entries: &mut Vec<String>, value: &str) {
    if !entries
        .iter()
        .any(|entry| entry.eq_ignore_ascii_case(value))
    {
        entries.push(value.to_string());
    }
}

fn ensure_git_success(result: GitCommandResult, action: &str) -> Result<GitCommandResult, String> {
    if result.success {
        return Ok(result);
    }

    let detail = if result.stderr.is_empty() {
        result.stdout
    } else {
        result.stderr
    };

    Err(format!("{action} failed: {detail}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_pages_base_paths() {
        assert_eq!(normalize_pages_base("").unwrap(), "/");
        assert_eq!(normalize_pages_base("InkNote").unwrap(), "/InkNote/");
        assert_eq!(normalize_pages_base("/InkNote/").unwrap(), "/InkNote/");
        assert!(normalize_pages_base("/../private/").is_err());
    }

    #[test]
    fn injects_the_pages_base_into_the_spa_entry() {
        let directory = TemporaryPublishDirectory::create().unwrap();
        fs::write(
            directory.path().join("index.html"),
            "<html><head><base href=\"./\" /></head><body></body></html>",
        )
        .unwrap();

        prepare_spa_artifact(directory.path(), "/InkNote/").unwrap();
        let index = fs::read_to_string(directory.path().join("index.html")).unwrap();
        let fallback = fs::read_to_string(directory.path().join("404.html")).unwrap();
        assert!(index.contains("<base href=\"/InkNote/\" />"));
        assert_eq!(index, fallback);
        assert!(directory.path().join(".nojekyll").is_file());
    }

    #[test]
    fn rewrites_root_asset_urls_for_project_pages() {
        let directory = TemporaryPublishDirectory::create().unwrap();
        fs::write(
            directory.path().join("index.html"),
            concat!(
                "<html><head>",
                "<base href=\"/\" />",
                "<script type=\"module\" src=\"/assets/index.js\"></script>",
                "<link rel=\"stylesheet\" href=\"/assets/index.css\">",
                "</head><body></body></html>"
            ),
        )
        .unwrap();

        prepare_spa_artifact(directory.path(), "/inknote-web/").unwrap();
        let index = fs::read_to_string(directory.path().join("index.html")).unwrap();
        assert!(index.contains("<base href=\"/inknote-web/\" />"));
        assert!(index.contains("src=\"/inknote-web/assets/index.js\""));
        assert!(index.contains("href=\"/inknote-web/assets/index.css\""));
    }

    #[test]
    fn rewrites_relative_asset_urls_for_project_pages() {
        let directory = TemporaryPublishDirectory::create().unwrap();
        fs::write(
            directory.path().join("index.html"),
            concat!(
                "<html><head>",
                "<base href=\"./\" />",
                "<script type=\"module\" src=\"./assets/index.js\"></script>",
                "<link rel=\"stylesheet\" href=\"assets/index.css\">",
                "</head><body></body></html>"
            ),
        )
        .unwrap();

        prepare_spa_artifact(directory.path(), "/inknote-web/").unwrap();
        let index = fs::read_to_string(directory.path().join("index.html")).unwrap();
        assert!(index.contains("<base href=\"/inknote-web/\" />"));
        assert!(index.contains("src=\"/inknote-web/assets/index.js\""));
        assert!(index.contains("href=\"/inknote-web/assets/index.css\""));
    }

    #[test]
    fn normalizes_deep_preview_asset_urls() {
        assert_eq!(
            normalize_preview_asset_request_path("/inknote/category/assets/index.js"),
            Some("/assets/index.js".to_string())
        );
        assert_eq!(
            normalize_preview_asset_request_path("/inknote/5369007/content-images/a.png"),
            Some("/content-images/a.png".to_string())
        );
        assert_eq!(
            normalize_preview_asset_request_path("/assets/index.js"),
            None
        );
    }

    #[test]
    fn reads_json_files_with_a_utf8_bom() {
        let directory = TemporaryPublishDirectory::create().unwrap();
        let path = directory.path().join("navigation.json");
        fs::write(&path, "\u{feff}[{\"label\":\"Home\",\"href\":\"/\"}]").unwrap();

        let parsed = read_json_value(&path).unwrap();
        assert_eq!(parsed[0]["label"], "Home");
    }

    #[test]
    fn publishes_and_updates_a_local_deployment_branch() {
        let test_directory = TemporaryPublishDirectory::create().unwrap();
        let root = test_directory.path();
        let remote = root.join("remote.git");
        let dist = root.join("dist");
        fs::create_dir_all(&dist).unwrap();
        fs::write(dist.join("index.html"), "first version").unwrap();
        fs::write(dist.join("404.html"), "first version").unwrap();
        fs::write(dist.join(".nojekyll"), "").unwrap();

        let remote_value = remote.to_string_lossy().to_string();
        ensure_git_success(
            run_git_in(root, &["init", "--bare", &remote_value]).unwrap(),
            "initialize test remote",
        )
        .unwrap();

        let reporter = PublishProgressReporter::silent();
        publish_built_site(
            &dist,
            &remote_value,
            "gh-pages",
            None,
            "First publish",
            None,
            true,
            &reporter,
        )
        .unwrap();
        let first_status =
            get_publish_status(remote_value.clone(), "gh-pages".to_string(), None).unwrap();
        assert!(first_status.branch_exists);

        fs::write(dist.join("index.html"), "second version").unwrap();
        publish_built_site(
            &dist,
            &remote_value,
            "gh-pages",
            None,
            "Second publish",
            None,
            true,
            &reporter,
        )
        .unwrap();
        let second_status = get_publish_status(remote_value, "gh-pages".to_string(), None).unwrap();
        assert!(second_status.branch_exists);
        assert_ne!(first_status.remote_commit, second_status.remote_commit);
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            initialize_runtime_paths(app.handle())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(BlogPreviewServer::default());

            let app_handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(800));
                let preview_server = app_handle.state::<BlogPreviewServer>();
                if let Err(error) = ensure_blog_preview_server_state(preview_server.inner(), false)
                {
                    eprintln!("failed to start local blog preview server: {error}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            write_binary_file,
            copy_file_to_path,
            compress_gallery_image_file,
            delete_gallery_image_file,
            convert_slides_to_pdf,
            get_content_index,
            read_content_file,
            write_content_file,
            delete_content_path,
            fetch_friend_link_icon,
            favicon::cache_external_image,
            get_publish_status,
            publish_content_changes,
            pull_remote_content,
            sync_content_changes,
            open_external_url,
            download_and_run_desktop_installer,
            ensure_blog_preview_server
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app_handle.state::<BlogPreviewServer>().stop();
        }
    });
}
