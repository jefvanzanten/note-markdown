use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub struct Tab {
    pub tab_id: String,
    pub title: String,
    pub is_temp: bool,
    pub is_dirty: bool,
    pub linked_path: Option<PathBuf>,
    pub content: String,
    pub cursor: usize,
    pub temp_file_name: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TabDto {
    pub tab_id: String,
    pub title: String,
    pub is_temp: bool,
    pub is_dirty: bool,
    pub linked_path: Option<String>,
    pub content: String,
    pub cursor: usize,
}

impl From<&Tab> for TabDto {
    fn from(value: &Tab) -> Self {
        Self {
            tab_id: value.tab_id.clone(),
            title: value.title.clone(),
            is_temp: value.is_temp,
            is_dirty: value.is_dirty,
            linked_path: value
                .linked_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            content: value.content.clone(),
            cursor: value.cursor,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SaveResultDto {
    pub tab: TabDto,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ack {
    pub ok: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PersistedSession {
    pub next_tab_id: u64,
    pub next_temp_id: u64,
    pub tabs: Vec<PersistedTab>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PersistedTab {
    pub tab_id: String,
    pub title: String,
    pub is_temp: bool,
    pub is_dirty: bool,
    pub linked_path: Option<String>,
    pub content: String,
    pub cursor: usize,
    pub temp_file_name: Option<String>,
}

impl From<&Tab> for PersistedTab {
    fn from(value: &Tab) -> Self {
        Self {
            tab_id: value.tab_id.clone(),
            title: value.title.clone(),
            is_temp: value.is_temp,
            is_dirty: value.is_dirty,
            linked_path: value
                .linked_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            content: value.content.clone(),
            cursor: value.cursor,
            temp_file_name: value.temp_file_name.clone(),
        }
    }
}

impl PersistedTab {
    pub fn to_tab(self, hydrated_content: Option<String>) -> Tab {
        Tab {
            tab_id: self.tab_id,
            title: self.title,
            is_temp: self.is_temp,
            is_dirty: self.is_dirty,
            linked_path: self.linked_path.map(PathBuf::from),
            content: hydrated_content.unwrap_or(self.content),
            cursor: self.cursor,
            temp_file_name: self.temp_file_name,
        }
    }
}
