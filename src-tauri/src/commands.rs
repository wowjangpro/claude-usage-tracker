use tauri::State;

use crate::auto_upload;
use crate::claude_wrapper;
use crate::state::AppState;
use crate::types::*;

#[tauri::command]
pub async fn get_config() -> Result<Config, String> {
    Ok(claude_wrapper::get_config().await)
}

#[tauri::command]
pub async fn save_config(config: Config, state: State<'_, AppState>) -> Result<SaveResult, String> {
    match claude_wrapper::save_config(&config).await {
        Ok(_) => {
            state.add_log("info", "설정이 변경되어 자동 업로드를 재시작합니다");
            auto_upload::restart_auto_upload(&state);
            Ok(SaveResult {
                success: true,
                error: None,
            })
        }
        Err(e) => Ok(SaveResult {
            success: false,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<Status, String> {
    Ok(state.status.lock().unwrap().clone())
}

#[tauri::command]
pub async fn get_usage_data() -> Result<UsageData, String> {
    claude_wrapper::scan_usage_data().await
}

#[tauri::command]
pub async fn upload_now(state: State<'_, AppState>) -> Result<UsageData, String> {
    claude_wrapper::upload_usage_data(&state).await
}

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    Ok(state.logs.lock().unwrap().clone())
}
