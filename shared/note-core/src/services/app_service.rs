use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use crate::{
    domain::tab::{PersistedSession, PersistedTab, Tab, TabDto},
    infra::fs::FileSystem,
};

const AUTOSAVE_DEBOUNCE_MS: u64 = 700;
const SESSION_FILE_NAME: &str = "session.json";

#[derive(thiserror::Error, Debug)]
pub enum AppServiceError {
    #[error("tab not found: {0}")]
    TabNotFound(String),
    #[error("save as required for tab: {0}")]
    SaveAsRequired(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
}

pub struct AppService {
    pub tabs: Vec<Tab>,
    next_tab_id: u64,
    next_temp_id: u64,
    session_root: PathBuf,
    fs: Box<dyn FileSystem>,
    last_autosave: HashMap<String, Instant>,
}

impl AppService {
    pub fn new(session_root: PathBuf, fs: Box<dyn FileSystem>) -> Result<Self, AppServiceError> {
        fs.create_dir_all(&session_root)?;

        let mut service = Self {
            tabs: Vec::new(),
            next_tab_id: 1,
            next_temp_id: 1,
            session_root,
            fs,
            last_autosave: HashMap::new(),
        };

        service.restore_session()?;
        Ok(service)
    }

    pub fn list_tabs(&self) -> Vec<TabDto> {
        self.tabs.iter().map(TabDto::from).collect()
    }

    pub fn new_note(&mut self) -> Result<TabDto, AppServiceError> {
        let temp_name = format!("tmp-{}", self.next_temp_id);
        self.next_temp_id += 1;

        let tab = Tab {
            tab_id: self.next_tab_id(),
            title: temp_name.clone(),
            is_temp: true,
            is_dirty: false,
            linked_path: None,
            content: String::new(),
            cursor: 0,
            temp_file_name: Some(format!("{}.md", temp_name)),
        };

        let dto = TabDto::from(&tab);
        self.tabs.push(tab);
        self.persist_session()?;
        Ok(dto)
    }

    pub fn open_file(&mut self, path: &Path) -> Result<TabDto, AppServiceError> {
        let content = self.fs.read_to_string(path)?;
        let title = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("untitled")
            .to_string();

        let tab = Tab {
            tab_id: self.next_tab_id(),
            title,
            is_temp: false,
            is_dirty: false,
            linked_path: Some(path.to_path_buf()),
            content,
            cursor: 0,
            temp_file_name: None,
        };

        let dto = TabDto::from(&tab);
        self.tabs.push(tab);
        self.persist_session()?;
        Ok(dto)
    }

    pub fn update_tab_content(
        &mut self,
        tab_id: &str,
        content: String,
        cursor: usize,
    ) -> Result<(), AppServiceError> {
        let idx = self.find_tab_index(tab_id)?;
        let is_temp = self.tabs[idx].is_temp;

        self.tabs[idx].content = content;
        self.tabs[idx].cursor = cursor;
        self.tabs[idx].is_dirty = true;

        if is_temp {
            self.try_autosave_temp(tab_id)?;
        }

        Ok(())
    }

    pub fn save_tab(&mut self, tab_id: &str) -> Result<TabDto, AppServiceError> {
        let idx = self.find_tab_index(tab_id)?;
        let path = self.tabs[idx]
            .linked_path
            .clone()
            .ok_or_else(|| AppServiceError::SaveAsRequired(tab_id.to_string()))?;
        let content = self.tabs[idx].content.clone();

        self.fs.write_string(&path, &content)?;

        self.tabs[idx].is_dirty = false;
        let dto = TabDto::from(&self.tabs[idx]);
        self.persist_session()?;
        Ok(dto)
    }

    pub fn save_tab_as(
        &mut self,
        tab_id: &str,
        target_path: &Path,
    ) -> Result<TabDto, AppServiceError> {
        let idx = self.find_tab_index(tab_id)?;
        let content = self.tabs[idx].content.clone();
        self.fs.write_string(target_path, &content)?;

        let old_temp = self.tabs[idx].temp_file_name.clone();
        if let Some(temp_name) = old_temp {
            self.remove_temp_file_if_exists(&temp_name)?;
        }

        self.tabs[idx].linked_path = Some(target_path.to_path_buf());
        self.tabs[idx].is_temp = false;
        self.tabs[idx].is_dirty = false;
        self.tabs[idx].title = target_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("untitled")
            .to_string();
        self.tabs[idx].temp_file_name = None;

        let dto = TabDto::from(&self.tabs[idx]);
        self.persist_session()?;
        Ok(dto)
    }

    pub fn close_tab(&mut self, tab_id: &str) -> Result<(), AppServiceError> {
        let pos = self.find_tab_index(tab_id)?;
        let tab = self.tabs.remove(pos);

        if let Some(temp_name) = tab.temp_file_name {
            self.remove_temp_file_if_exists(&temp_name)?;
        }

        self.last_autosave.remove(tab_id);
        self.persist_session()?;
        Ok(())
    }

    pub fn persist_session(&mut self) -> Result<(), AppServiceError> {
        let empty_temp_files: Vec<String> = self
            .tabs
            .iter()
            .filter(|tab| tab.is_temp && tab.content.is_empty())
            .filter_map(|tab| tab.temp_file_name.clone())
            .collect();

        for temp_name in empty_temp_files {
            self.remove_temp_file_if_exists(&temp_name)?;
        }

        let to_write: Vec<(String, String)> = self
            .tabs
            .iter()
            .filter(|tab| tab.is_temp && !tab.content.is_empty())
            .filter_map(|tab| {
                tab.temp_file_name
                    .as_ref()
                    .map(|name| (name.clone(), tab.content.clone()))
            })
            .collect();

        for (temp_name, content) in to_write {
            self.write_temp_file(&temp_name, &content)?;
        }

        let saved_tabs: Vec<PersistedTab> = self
            .tabs
            .iter()
            .filter(|tab| !tab.is_temp || !tab.content.is_empty())
            .map(PersistedTab::from)
            .collect();

        let next_temp_id = if saved_tabs.iter().any(|t| t.is_temp) {
            self.next_temp_id
        } else {
            1
        };

        let session = PersistedSession {
            next_tab_id: self.next_tab_id,
            next_temp_id,
            tabs: saved_tabs,
        };

        let serialized = serde_json::to_string_pretty(&session)?;
        self.fs
            .write_string(&self.session_root.join(SESSION_FILE_NAME), &serialized)?;
        Ok(())
    }

    fn restore_session(&mut self) -> Result<(), AppServiceError> {
        let session_path = self.session_root.join(SESSION_FILE_NAME);
        if !self.fs.exists(&session_path) {
            return Ok(());
        }

        let raw = self.fs.read_to_string(&session_path)?;
        let persisted: PersistedSession = match serde_json::from_str(&raw) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[note] session.json parse error, starting fresh: {e}");
                return Ok(());
            }
        };

        self.next_tab_id = persisted.next_tab_id;
        self.next_temp_id = persisted.next_temp_id;
        self.tabs = persisted
            .tabs
            .into_iter()
            .map(|tab| {
                let hydrated_content = tab
                    .temp_file_name
                    .as_ref()
                    .map(|name| self.temp_file_path(name))
                    .filter(|path| self.fs.exists(path))
                    .and_then(|path| self.fs.read_to_string(&path).ok());
                tab.to_tab(hydrated_content)
            })
            .collect();

        Ok(())
    }

    fn try_autosave_temp(&mut self, tab_id: &str) -> Result<(), AppServiceError> {
        let should_write = self
            .last_autosave
            .get(tab_id)
            .map(|instant| instant.elapsed() >= Duration::from_millis(AUTOSAVE_DEBOUNCE_MS))
            .unwrap_or(true);

        if !should_write {
            return Ok(());
        }

        let idx = self.find_tab_index(tab_id)?;
        let (temp_name, content) = match self.tabs[idx].temp_file_name.clone() {
            Some(name) => (name, self.tabs[idx].content.clone()),
            None => return Ok(()),
        };

        self.write_temp_file(&temp_name, &content)?;
        self.last_autosave.insert(tab_id.to_string(), Instant::now());
        self.persist_session()?;
        Ok(())
    }

    fn write_temp_file(&self, temp_name: &str, content: &str) -> Result<(), AppServiceError> {
        let path = self.temp_file_path(temp_name);
        self.fs.write_string(&path, content)?;
        Ok(())
    }

    fn remove_temp_file_if_exists(&self, temp_name: &str) -> Result<(), AppServiceError> {
        let path = self.temp_file_path(temp_name);
        if self.fs.exists(&path) {
            self.fs.remove_file(&path)?;
        }

        Ok(())
    }

    fn temp_file_path(&self, temp_name: &str) -> PathBuf {
        self.session_root.join(temp_name)
    }

    fn next_tab_id(&mut self) -> String {
        let id = format!("tab-{}", self.next_tab_id);
        self.next_tab_id += 1;
        id
    }

    fn find_tab_index(&self, tab_id: &str) -> Result<usize, AppServiceError> {
        self.tabs
            .iter()
            .position(|tab| tab.tab_id == tab_id)
            .ok_or_else(|| AppServiceError::TabNotFound(tab_id.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use std::{thread, time::Duration};

    use tempfile::TempDir;

    use crate::infra::fs::StdFileSystem;

    use super::AppService;

    fn setup_service() -> (TempDir, AppService) {
        let dir = TempDir::new().expect("temp dir should be created");
        let service = AppService::new(dir.path().to_path_buf(), Box::<StdFileSystem>::default())
            .expect("service should initialize");

        (dir, service)
    }

    #[test]
    fn new_note_assigns_unique_tmp_names() {
        let (_dir, mut service) = setup_service();

        let first = service.new_note().expect("first note should be created");
        let second = service.new_note().expect("second note should be created");

        assert_eq!(first.title, "tmp-1");
        assert_eq!(second.title, "tmp-2");
        assert_eq!(first.content, "");
    }

    #[test]
    fn autosave_persists_temp_file() {
        let (dir, mut service) = setup_service();
        let tab = service.new_note().expect("new note should be created");

        service
            .update_tab_content(&tab.tab_id, "hello".to_string(), 5)
            .expect("update should succeed");

        let temp_path = dir.path().join("tmp-1.md");
        assert!(temp_path.exists());
    }

    #[test]
    fn save_tab_as_updates_title_and_cleans_temp_file() {
        let (dir, mut service) = setup_service();
        let tab = service.new_note().expect("new note should be created");
        service
            .update_tab_content(&tab.tab_id, "draft".to_string(), 5)
            .expect("update should succeed");

        thread::sleep(Duration::from_millis(750));

        let target = dir.path().join("my-note.md");
        let saved = service
            .save_tab_as(&tab.tab_id, &target)
            .expect("save as should succeed");

        assert_eq!(saved.title, "my-note.md");
        assert!(!saved.is_temp);
        assert!(target.exists());
        assert!(!dir.path().join("tmp-1.md").exists());
    }

    #[test]
    fn restore_session_recovers_tabs_in_order() {
        let dir = TempDir::new().expect("temp dir should be created");
        let root = dir.path().to_path_buf();

        {
            let mut service =
                AppService::new(root.clone(), Box::<StdFileSystem>::default()).expect("init works");
            let one = service.new_note().expect("note one created");
            let two = service.new_note().expect("note two created");
            service
                .update_tab_content(&one.tab_id, "first".to_string(), 5)
                .expect("update one works");
            service
                .update_tab_content(&two.tab_id, "second".to_string(), 6)
                .expect("update two works");
            service.persist_session().expect("persist works");
        }

        let restored =
            AppService::new(root, Box::<StdFileSystem>::default()).expect("restore init works");

        assert_eq!(restored.tabs.len(), 2);
        assert_eq!(restored.tabs[0].title, "tmp-1");
        assert_eq!(restored.tabs[1].title, "tmp-2");
    }
}
