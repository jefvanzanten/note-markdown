use std::path::PathBuf;

use note_core::{
    domain::tab::{Ack, SaveResultDto, TabDto},
    services::app_service::AppServiceError,
};
use tauri::State;

use crate::AppState;

fn map_error(error: AppServiceError) -> String {
    error.to_string()
}

#[tauri::command]
pub fn list_restore_session(state: State<'_, AppState>) -> Result<Vec<TabDto>, String> {
    let service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    Ok(service.list_tabs())
}

#[tauri::command]
pub fn new_note(state: State<'_, AppState>) -> Result<TabDto, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    service.new_note().map_err(map_error)
}

#[tauri::command]
pub fn open_file(state: State<'_, AppState>, path: Option<String>) -> Result<TabDto, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    let file_path = path.ok_or_else(|| "path is required".to_string())?;
    service
        .open_file(PathBuf::from(file_path).as_path())
        .map_err(map_error)
}

#[tauri::command]
pub fn update_tab_content(
    state: State<'_, AppState>,
    tab_id: String,
    content: String,
    cursor: usize,
) -> Result<Ack, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    service
        .update_tab_content(&tab_id, content, cursor)
        .map_err(map_error)?;

    Ok(Ack { ok: true })
}

#[tauri::command]
pub fn save_tab(state: State<'_, AppState>, tab_id: String) -> Result<SaveResultDto, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    let tab = service.save_tab(&tab_id).map_err(map_error)?;
    Ok(SaveResultDto { tab })
}

#[tauri::command]
pub fn save_tab_as(
    state: State<'_, AppState>,
    tab_id: String,
    target_path: Option<String>,
) -> Result<SaveResultDto, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    let path = target_path.ok_or_else(|| "target_path is required".to_string())?;
    let tab = service
        .save_tab_as(&tab_id, PathBuf::from(path).as_path())
        .map_err(map_error)?;
    Ok(SaveResultDto { tab })
}

#[tauri::command]
pub fn close_tab(state: State<'_, AppState>, tab_id: String) -> Result<Ack, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    service.close_tab(&tab_id).map_err(map_error)?;
    Ok(Ack { ok: true })
}

#[tauri::command]
pub fn persist_session(state: State<'_, AppState>) -> Result<Ack, String> {
    let mut service = state
        .service
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    service.persist_session().map_err(map_error)?;
    Ok(Ack { ok: true })
}
