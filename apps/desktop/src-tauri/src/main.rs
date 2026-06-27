#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod favicon;

use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    net::{SocketAddr, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU8, Ordering},
        Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const BLOG_PREVIEW_PORT: u16 = 4321;
const BLOG_PREVIEW_ORIGIN: &str = "http://localhost:4321";
const BLOG_PREVIEW_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
const BLOG_PREVIEW_WAIT_STEP: Duration = Duration::from_millis(100);

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishSiteRequest {
    task_id: String,
    remote: String,
    branch: String,
    base_path: String,
    ssh_key_path: String,
    message: String,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishStatus {
    remote: String,
    branch: String,
    branch_exists: bool,
    remote_commit: String,
    short_status: String,
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
}

impl BlogPreviewServer {
    fn stop(&self) {
        if let Ok(mut child_guard) = self.child.lock() {
            if let Some(mut child) = child_guard.take() {
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
        }
    }
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
    let result = ensure_git_success(
        run_git_in_with_ssh(
            &command_directory,
            &["ls-remote", "--heads", &remote, &remote_ref],
            ssh_command.as_deref(),
        )?,
        "read remote deployment branch",
    )?;
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
        remote,
        branch,
        branch_exists,
        remote_commit,
        short_status,
    })
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

    let manifest_path = sync_root.join("inknote-content.json");
    if !manifest_path.is_file() {
        return Err(
            "远端分支中没有找到 inknote-content.json，请确认该分支是 InkNote 发布产物。"
                .to_string(),
        );
    }

    reporter.emit(
        52,
        "manifest",
        "正在读取远端内容清单",
        manifest_path.display().to_string(),
        "info",
    );
    let manifest = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("failed to read {}: {error}", manifest_path.display()))?;
    let payload: RuntimeContentPayload =
        serde_json::from_str(manifest.trim_start_matches('\u{feff}'))
            .map_err(|error| format!("failed to parse {}: {error}", manifest_path.display()))?;

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

    let base_path = normalize_pages_base(&request.base_path)?;
    if can_rebuild_web_shell_from_workspace() {
        reporter.emit(
            14,
            "shell",
            "正在重建 Web 前端外壳",
            "检测到源码工作区，发布前会自动执行 npm run web:build。",
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
            16,
            "shell",
            "Web 前端外壳重建完成",
            format_git_result(&rebuild_result),
            "success",
        );
    } else {
        reporter.emit(
            14,
            "shell",
            "本次发布使用现有 Web 外壳",
            "未检测到可重建的源码工作区；若修改了 apps/web/src，请先构建新版桌面应用或在源码仓库中发布。",
            "info",
        );
    }
    reporter.emit(
        17,
        "shell",
        "已确认 Web 外壳来源",
        get_web_shell_root()?.display().to_string(),
        "info",
    );
    reporter.emit(
        18,
        "build",
        "正在生成静态站点",
        format!("基础路径：{base_path}"),
        "info",
    );
    let artifact = create_runtime_web_artifact(&base_path)?;
    if let Ok(summary) = summarize_runtime_manifest(artifact.path()) {
        reporter.emit(24, "build", "已生成运行时内容清单", summary, "success");
    }
    reporter.emit(
        30,
        "build",
        "静态站点生成完成",
        format!("临时产物：{}", artifact.path().display()),
        "success",
    );
    publish_built_site(
        artifact.path(),
        &remote,
        &branch,
        (!ssh_key_path.is_empty()).then_some(ssh_key_path),
        commit_message,
        reporter,
    )
}

fn publish_built_site(
    dist: &Path,
    remote: &str,
    branch: &str,
    ssh_key_path: Option<&str>,
    commit_message: &str,
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
    let status = get_publish_status_with_ssh(remote.to_string(), branch.to_string(), ssh_key_path)?;
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

    reporter.emit(
        64,
        "files",
        "正在整理站点文件",
        "镜像静态产物并保留已有 CNAME。",
        "info",
    );
    mirror_deployment_artifact(&dist, publish_root)?;
    reporter.emit(
        70,
        "files",
        "站点文件整理完成",
        "静态资源和内容清单已写入。",
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
        73,
        "commit",
        "正在暂存发布文件",
        "执行 git add --all。",
        "info",
    );
    let staged_files = ensure_git_success(
        run_git_in(publish_root, &["add", "--all"])?,
        "stage deployment artifact",
    )?;
    reporter.emit(
        77,
        "commit",
        "发布文件已暂存",
        format_git_result(&staged_files),
        "success",
    );

    let staged = run_git_in(publish_root, &["diff", "--cached", "--quiet"])?;
    if staged.success {
        let manifest_summary = summarize_runtime_manifest(publish_root)
            .unwrap_or_else(|error| format!("无法读取当前发布清单：{error}"));
        reporter.emit(94, "complete", "本次发布清单摘要", manifest_summary, "info");
        reporter.emit(
            96,
            "complete",
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

    reporter.emit(80, "commit", "正在创建发布提交", commit_message, "info");
    let committed = ensure_git_success(
        run_git_in(publish_root, &["commit", "-m", commit_message])?,
        "commit deployment artifact",
    )?;
    reporter.emit(
        85,
        "commit",
        "发布提交已创建",
        format_git_result(&committed),
        "success",
    );

    if let Ok(summary) = summarize_runtime_manifest(publish_root) {
        reporter.emit(86, "commit", "本次发布清单摘要", summary, "info");
    }

    let refspec = format!("HEAD:{remote_ref}");
    reporter.emit(
        88,
        "push",
        "正在推送到远程仓库",
        format!("目标分支：{branch}"),
        "info",
    );
    let push_result = if status.branch_exists {
        let lease = format!("--force-with-lease={remote_ref}:{}", status.remote_commit);
        ensure_git_success(
            run_git_in_with_ssh(
                publish_root,
                &["push", "origin", &refspec, &lease],
                ssh_command.as_deref(),
            )?,
            "push deployment branch",
        )?
    } else {
        ensure_git_success(
            run_git_in_with_ssh(
                publish_root,
                &["push", "--set-upstream", "origin", &refspec],
                ssh_command.as_deref(),
            )?,
            "create remote deployment branch",
        )?
    };
    reporter.emit(
        96,
        "push",
        "远程推送完成",
        format_git_result(&push_result),
        "success",
    );

    let commit = ensure_git_success(
        run_git_in(publish_root, &["rev-parse", "HEAD"])?,
        "read deployment commit",
    )?;
    let deployed_commit = commit.stdout.trim().to_string();
    let remote_status_after_push =
        get_publish_status_with_ssh(remote.to_string(), branch.to_string(), ssh_key_path)?;
    let remote_commit_after_push = remote_status_after_push.remote_commit.trim().to_string();
    let remote_matches_local = !remote_commit_after_push.is_empty()
        && short_commit(&remote_commit_after_push) == short_commit(&deployed_commit);
    reporter.emit(
        98,
        "verify",
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
        if remote_matches_local { "success" } else { "warning" },
    );
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
        fs::create_dir_all(workspace.join("apps/web/public"))
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

    let mut child_guard = server
        .child
        .lock()
        .map_err(|_| "failed to lock local blog preview server state".to_string())?;

    if let Some(child) = child_guard.as_mut() {
        match child.try_wait() {
            Ok(None) => {
                drop(child_guard);
                let ready = wait_for_blog_preview_server(wait_for_ready);
                return Ok(create_blog_preview_server_status(
                    false,
                    ready,
                    if ready {
                        "Local blog preview server is ready."
                    } else {
                        "Local blog preview server is starting."
                    },
                ));
            }
            Ok(Some(_)) => {
                *child_guard = None;
            }
            Err(error) => {
                return Err(format!(
                    "failed to inspect local blog preview server: {error}"
                ));
            }
        }
    }

    let child = spawn_blog_preview_server()?;
    *child_guard = Some(child);
    drop(child_guard);

    let ready = wait_for_blog_preview_server(wait_for_ready);
    Ok(create_blog_preview_server_status(
        true,
        ready,
        if ready {
            "Local blog preview server has started."
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

    addresses
        .iter()
        .any(|address| TcpStream::connect_timeout(address, Duration::from_millis(120)).is_ok())
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
        .replace("src='/assets/", &format!("src='{asset_prefix}"))
        .replace("href='/assets/", &format!("href='{asset_prefix}"));
    fs::write(&index_path, &index)
        .map_err(|error| format!("failed to configure static site base path: {error}"))?;
    fs::write(dist.join("404.html"), index)
        .map_err(|error| format!("failed to create SPA fallback: {error}"))?;
    fs::write(dist.join(".nojekyll"), b"")
        .map_err(|error| format!("failed to create .nojekyll: {error}"))
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
    if let Some(ssh_command) = ssh_command {
        command.env("GIT_SSH_COMMAND", ssh_command);
    }
    let output = command
        .output()
        .map_err(|error| format!("failed to run git {:?}: {error}", args))?;

    Ok(GitCommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
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
            open_external_url,
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
