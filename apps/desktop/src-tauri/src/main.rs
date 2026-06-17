#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    fs,
    net::{SocketAddr, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const BLOG_PREVIEW_PORT: u16 = 4321;
const BLOG_PREVIEW_ORIGIN: &str = "http://localhost:4321";
const BLOG_PREVIEW_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
const BLOG_PREVIEW_WAIT_STEP: Duration = Duration::from_millis(100);

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishStatus {
    branch: String,
    short_status: String,
    clean: bool,
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
fn get_publish_status() -> Result<PublishStatus, String> {
    ensure_git_repository()?;

    let branch_result = ensure_git_success(run_git(&["branch", "--show-current"])?, "git branch")?;
    let status_result = ensure_git_success(
        run_git(&[
            "status",
            "--short",
            "--branch",
            "--",
            "content",
            "apps/web/public",
        ])?,
        "git status",
    )?;

    let clean = status_result
        .stdout
        .lines()
        .filter(|line| !line.starts_with("##"))
        .all(|line| line.trim().is_empty());

    Ok(PublishStatus {
        branch: branch_result.stdout,
        short_status: status_result.stdout,
        clean,
    })
}

#[tauri::command]
fn publish_content_changes(message: String) -> Result<GitCommandResult, String> {
    ensure_git_repository()?;

    let commit_message = message.trim();
    if commit_message.is_empty() {
        return Err("A commit message is required before publishing.".to_string());
    }

    ensure_git_success(run_git(&["add", "content", "apps/web/public"])?, "git add")?;

    let staged_result = ensure_git_success(
        run_git(&[
            "diff",
            "--cached",
            "--name-only",
            "--",
            "content",
            "apps/web/public",
        ])?,
        "git diff",
    )?;

    if staged_result.stdout.trim().is_empty() {
        return Ok(GitCommandResult {
            success: true,
            stdout: "No content or public asset changes to publish.".to_string(),
            stderr: String::new(),
        });
    }

    ensure_git_success(run_git(&["commit", "-m", commit_message])?, "git commit")?;
    ensure_git_success(run_git(&["push"])?, "git push")
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
    ensure_blog_preview_server_state(server.inner(), false)
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

fn get_content_root() -> Result<PathBuf, String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../content");
    root.canonicalize()
        .map_err(|error| format!("failed to locate content root: {error}"))
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
    [
        "http://localhost:",
        "http://127.0.0.1:",
        "https://localhost:",
        "https://127.0.0.1:",
    ]
    .iter()
    .any(|prefix| url.starts_with(prefix))
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
    TcpStream::connect_timeout(&blog_preview_socket_addr(), Duration::from_millis(120)).is_ok()
}

fn blog_preview_socket_addr() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], BLOG_PREVIEW_PORT))
}

fn get_workspace_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .map_err(|error| format!("failed to locate workspace root: {error}"))
}

fn run_git(args: &[&str]) -> Result<GitCommandResult, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(get_workspace_root()?)
        .output()
        .map_err(|error| format!("failed to run git {:?}: {error}", args))?;

    Ok(GitCommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn ensure_git_repository() -> Result<(), String> {
    let result = run_git(&["rev-parse", "--is-inside-work-tree"])?;
    if result.success && result.stdout == "true" {
        return Ok(());
    }

    Err(
    "This workspace is not a Git repository yet. Initialize Git, add a GitHub remote, and try publishing again."
      .to_string(),
  )
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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
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
            get_content_index,
            read_content_file,
            write_content_file,
            delete_content_path,
            get_publish_status,
            publish_content_changes,
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
