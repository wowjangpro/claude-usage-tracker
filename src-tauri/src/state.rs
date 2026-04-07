use std::sync::{Arc, Mutex};

use crate::types::{LogEntry, Status};

pub struct AppState {
    pub logs: Arc<Mutex<Vec<LogEntry>>>,
    pub status: Arc<Mutex<Status>>,
    pub upload_handle: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            logs: Arc::new(Mutex::new(Vec::new())),
            status: Arc::new(Mutex::new(Status {
                upload_count: 0,
                last_upload_time: None,
            })),
            upload_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn add_log(&self, level: &str, message: &str) {
        let mut logs = self.logs.lock().unwrap();
        logs.push(LogEntry {
            timestamp: chrono::Local::now().to_rfc3339(),
            level: level.to_string(),
            message: message.to_string(),
        });
        if logs.len() > 1000 {
            logs.remove(0);
        }
    }
}
