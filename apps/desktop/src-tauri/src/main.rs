#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
  fs,
  path::{Component, Path, PathBuf},
  process::Command,
};

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

    let entries = fs::read_dir(&collection_dir).map_err(|error| format!("failed to read content/{kind}: {error}"))?;
    for entry in entries {
      let entry = entry.map_err(|error| format!("failed to inspect content/{kind}: {error}"))?;
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
  fs::write(&resolved, contents).map_err(|error| format!("failed to write content/{path}: {error}"))
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

  fs::remove_file(&resolved).map_err(|error| format!("failed to delete content/{path}: {error}"))?;
  remove_empty_parent_directories(&resolved)?;
  Ok(())
}

#[tauri::command]
fn get_publish_status() -> Result<PublishStatus, String> {
  ensure_git_repository()?;

  let branch_result = ensure_git_success(run_git(&["branch", "--show-current"])?, "git branch")?;
  let status_result = ensure_git_success(
    run_git(&["status", "--short", "--branch", "--", "content", "apps/web/public"])?,
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
    run_git(&["diff", "--cached", "--name-only", "--", "content", "apps/web/public"])?,
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

    let mut entries =
      fs::read_dir(directory).map_err(|error| format!("failed to inspect {:?}: {error}", directory))?;

    if entries.next().is_some() {
      break;
    }

    fs::remove_dir(directory).map_err(|error| format!("failed to remove {:?}: {error}", directory))?;
    current = directory.parent();
  }

  Ok(())
}

fn get_content_root() -> Result<PathBuf, String> {
  let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../content");
  root
    .canonicalize()
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
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      read_text_file,
      write_text_file,
      write_binary_file,
      get_content_index,
      read_content_file,
      write_content_file,
      delete_content_path,
      get_publish_status,
      publish_content_changes
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
