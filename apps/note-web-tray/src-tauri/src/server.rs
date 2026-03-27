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
    pub config_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceConfig {
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

fn load_config(config_path: &Path) -> Option<WorkspaceConfig> {
    let content = std::fs::read_to_string(config_path).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_config(config_path: &Path, config: &WorkspaceConfig) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(config_path, content).map_err(|e| e.to_string())
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

fn has_traversal(path: &str) -> bool {
    path.split('/').any(|seg| seg == ".." || seg == ".")
}

async fn get_workspace(State(state): State<AppState>) -> impl IntoResponse {
    axum::Json(load_config(&state.config_path))
}

async fn post_workspace(
    State(state): State<AppState>,
    axum::Json(config): axum::Json<WorkspaceConfig>,
) -> impl IntoResponse {
    if !Path::new(&config.path).exists() {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Path does not exist" })),
        )
            .into_response();
    }
    match save_config(&state.config_path, &config) {
        Ok(_) => axum::Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn get_files(State(state): State<AppState>) -> impl IntoResponse {
    let Some(config) = load_config(&state.config_path) else {
        return (
            StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({ "error": "No workspace configured" })),
        )
            .into_response();
    };
    let mut results = Vec::new();
    match scan_dir(Path::new(&config.path), "", &mut results) {
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

async fn get_file(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let Some(file_path) = query.path else {
        return (StatusCode::BAD_REQUEST, "Missing path").into_response();
    };
    if has_traversal(&file_path) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }
    let Some(config) = load_config(&state.config_path) else {
        return (StatusCode::BAD_REQUEST, "No workspace configured").into_response();
    };
    let workspace = match std::fs::canonicalize(&config.path) {
        Ok(p) => p,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let abs = match std::fs::canonicalize(workspace.join(&file_path)) {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };
    if !abs.starts_with(&workspace) {
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

async fn put_file(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
    body: String,
) -> impl IntoResponse {
    let Some(file_path) = query.path else {
        return (StatusCode::BAD_REQUEST, "Missing path").into_response();
    };
    if has_traversal(&file_path) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }
    let Some(config) = load_config(&state.config_path) else {
        return (StatusCode::BAD_REQUEST, "No workspace configured").into_response();
    };
    let workspace = match std::fs::canonicalize(&config.path) {
        Ok(p) => p,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    match std::fs::write(workspace.join(&file_path), body) {
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

pub async fn start(config_path: PathBuf) {
    let state = AppState { config_path };
    let router = Router::new()
        .route("/api/workspace", get(get_workspace).post(post_workspace))
        .route("/api/files", get(get_files))
        .route("/api/file", get(get_file).put(put_file))
        .route("/api/list-dirs", get(get_list_dirs))
        .fallback(serve_static)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 1422));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to port 1422");
    axum::serve(listener, router).await.expect("Server error");
}
