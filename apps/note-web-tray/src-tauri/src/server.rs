use axum::{
    body::Body,
    extract::{Query, State},
    http::{HeaderValue, Response, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
};

#[derive(RustEmbed)]
#[folder = "../../web-app/dist"]
struct Asset;

#[derive(Clone)]
pub struct AppState {
    pub recents_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RecentWorkspace {
    path: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileEntry {
    path: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DirEntry {
    name: String,
    path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DirListing {
    current: String,
    parent: Option<String>,
    dirs: Vec<DirEntry>,
}

#[derive(Deserialize)]
struct PathQuery {
    path: Option<String>,
}

#[derive(Deserialize)]
struct FileQuery {
    workspace: Option<String>,
    path: Option<String>,
}

#[derive(Deserialize)]
struct RenameQuery {
    workspace: Option<String>,
    path: Option<String>,
    #[serde(rename = "newPath")]
    new_path: Option<String>,
}

#[derive(Deserialize)]
struct FilesQuery {
    workspace: Option<String>,
}

fn load_recents(recents_path: &Path) -> Vec<RecentWorkspace> {
    let content = match std::fs::read_to_string(recents_path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_recents(recents_path: &Path, list: &[RecentWorkspace]) -> Result<(), String> {
    if let Some(parent) = recents_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(recents_path, content).map_err(|e| e.to_string())
}

fn scan_dir(dir: &Path, prefix: &str, results: &mut Vec<FileEntry>) -> Result<(), String> {
    let read = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = read.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let rel_path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            scan_dir(&entry.path(), &rel_path, results)?;
        } else if file_type.is_file() {
            let lower = name.to_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                let stem_len = if lower.ends_with(".markdown") { name.len() - 9 } else { name.len() - 3 };
                results.push(FileEntry { path: rel_path, name: name[..stem_len].to_string() });
            }
        }
    }
    Ok(())
}

async fn get_recents(State(state): State<AppState>) -> impl IntoResponse {
    axum::Json(load_recents(&state.recents_path))
}

async fn post_workspaces(
    State(state): State<AppState>,
    axum::Json(entry): axum::Json<RecentWorkspace>,
) -> impl IntoResponse {
    if !Path::new(&entry.path).exists() {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Path does not exist" })),
        )
            .into_response();
    }
    let mut list = load_recents(&state.recents_path);
    list.retain(|r| r.path != entry.path);
    list.insert(0, entry);
    list.truncate(8);
    match save_recents(&state.recents_path, &list) {
        Ok(_) => axum::Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn get_files(Query(query): Query<FilesQuery>) -> impl IntoResponse {
    let Some(workspace) = query.workspace else {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Missing workspace parameter" })),
        )
            .into_response();
    };
    let mut results = Vec::new();
    match scan_dir(Path::new(&workspace), "", &mut results) {
        Ok(_) => {
            results.sort_by(|a, b| a.path.cmp(&b.path));
            axum::Json(results).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn get_file(Query(query): Query<FileQuery>) -> impl IntoResponse {
    let (Some(workspace), Some(file_path)) = (query.workspace, query.path) else {
        return (StatusCode::BAD_REQUEST, "Missing workspace or path").into_response();
    };
    let workspace_canon = match std::fs::canonicalize(&workspace) {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };
    let abs = match std::fs::canonicalize(workspace_canon.join(&file_path)) {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };
    if !abs.starts_with(&workspace_canon) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }
    match std::fs::read_to_string(abs) {
        Ok(content) => Response::builder()
            .status(StatusCode::OK)
            .header("content-type", HeaderValue::from_static("text/plain; charset=utf-8"))
            .body(Body::from(content))
            .unwrap()
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "File not found").into_response(),
    }
}

async fn put_file(Query(query): Query<FileQuery>, body: String) -> impl IntoResponse {
    let (Some(workspace), Some(file_path)) = (query.workspace, query.path) else {
        return (StatusCode::BAD_REQUEST, "Missing workspace or path").into_response();
    };
    let workspace_canon = match std::fs::canonicalize(&workspace) {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };
    let abs = workspace_canon.join(&file_path);
    // Prevent path traversal via the resolved path
    let abs_canon = match std::fs::canonicalize(abs.parent().unwrap_or(&abs)) {
        Ok(p) => p.join(abs.file_name().unwrap_or_default()),
        Err(_) => abs.clone(),
    };
    if !abs_canon.starts_with(&workspace_canon) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }
    match std::fs::write(abs, body) {
        Ok(_) => (StatusCode::OK, "OK").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_list_dirs(Query(query): Query<PathQuery>) -> impl IntoResponse {
    let current = match query.path {
        Some(p) => PathBuf::from(p),
        None => match dirs::home_dir() {
            Some(h) => h,
            None => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(serde_json::json!({ "error": "Cannot determine home directory" })),
                )
                    .into_response()
            }
        },
    };
    let current_str = current.to_string_lossy().replace('\\', "/");
    let entries = match std::fs::read_dir(&current) {
        Ok(e) => e,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    };
    let mut dirs: Vec<DirEntry> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            !name.starts_with('.') && e.file_type().map(|t| t.is_dir()).unwrap_or(false)
        })
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let path = e.path().to_string_lossy().replace('\\', "/");
            DirEntry { name, path }
        })
        .collect();
    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    let parent = current.parent().and_then(|p| {
        let p_str = p.to_string_lossy().replace('\\', "/");
        if p_str != current_str { Some(p_str) } else { None }
    });
    axum::Json(DirListing { current: current_str, parent, dirs }).into_response()
}

async fn delete_file(Query(query): Query<FileQuery>) -> impl IntoResponse {
    let (Some(workspace), Some(file_path)) = (query.workspace, query.path) else {
        return (StatusCode::BAD_REQUEST, "Missing workspace or path").into_response();
    };
    let workspace_canon = match std::fs::canonicalize(&workspace) {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };
    let abs = match std::fs::canonicalize(workspace_canon.join(&file_path)) {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "Not found").into_response(),
    };
    if !abs.starts_with(&workspace_canon) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }
    let result = if abs.is_dir() {
        std::fs::remove_dir_all(&abs)
    } else {
        std::fs::remove_file(&abs)
    };
    match result {
        Ok(_) => (StatusCode::OK, "OK").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn rename_file(Query(query): Query<RenameQuery>) -> impl IntoResponse {
    let (Some(workspace), Some(old_path), Some(new_path)) = (query.workspace, query.path, query.new_path) else {
        return (StatusCode::BAD_REQUEST, "Missing workspace, path, or newPath").into_response();
    };
    let workspace_canon = match std::fs::canonicalize(&workspace) {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };
    let old_abs = match std::fs::canonicalize(workspace_canon.join(&old_path)) {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "Source not found").into_response(),
    };
    if !old_abs.starts_with(&workspace_canon) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }
    let new_abs = workspace_canon.join(&new_path);
    if let Some(parent) = new_abs.parent() {
        match std::fs::canonicalize(parent) {
            Ok(cp) if !cp.starts_with(&workspace_canon) => {
                return (StatusCode::FORBIDDEN, "Access denied").into_response();
            }
            Err(_) => return (StatusCode::BAD_REQUEST, "Target directory does not exist").into_response(),
            _ => {}
        }
    }
    if new_abs.exists() {
        return (StatusCode::CONFLICT, "Target already exists").into_response();
    }
    match std::fs::rename(&old_abs, &new_abs) {
        Ok(_) => (StatusCode::OK, "OK").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn serve_static(uri: axum::http::Uri) -> Response<Body> {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Asset::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header("content-type", mime.as_ref())
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => match Asset::get("index.html") {
            Some(content) => Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "text/html")
                .body(Body::from(content.data.into_owned()))
                .unwrap(),
            None => Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::empty())
                .unwrap(),
        },
    }
}

pub async fn start(recents_path: PathBuf) {
    let state = AppState { recents_path };
    let router = Router::new()
        .route("/api/workspaces/recent", get(get_recents))
        .route("/api/workspaces", axum::routing::post(post_workspaces))
        .route("/api/files", get(get_files))
        .route("/api/file", get(get_file).put(put_file).delete(delete_file).patch(rename_file))
        .route("/api/list-dirs", get(get_list_dirs))
        .fallback(serve_static)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 1422));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to port 1422");
    axum::serve(listener, router).await.expect("Server error");
}
