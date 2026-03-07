use std::sync::Mutex;

use note_core::{
    infra::fs::{session_root_for, StdFileSystem},
    services::app_service::AppService,
};
use tauri::{Manager, Wry};

pub struct AppState {
    pub service: Mutex<AppService>,
}

mod commands {
    use super::AppState;
    use std::path::PathBuf;

    use note_core::{
        domain::tab::{Ack, SaveResultDto, TabDto},
        services::app_service::AppServiceError,
    };
    use tauri::State;

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
}

pub fn run_app(context: tauri::Context<Wry>, session_name: &str) {
    let root = session_root_for(session_name);
    let service =
        AppService::new(root, Box::<StdFileSystem>::default()).expect("app service should initialize");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            service: Mutex::new(service),
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_restore_session,
            commands::new_note,
            commands::open_file,
            commands::update_tab_content,
            commands::save_tab,
            commands::save_tab_as,
            commands::close_tab,
            commands::persist_session,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<AppState>();
                if let Ok(mut service) = state.service.lock() {
                    let _ = service.persist_session();
                };
            }
        })
        .run(context)
        .expect("error while running tauri application");
}
