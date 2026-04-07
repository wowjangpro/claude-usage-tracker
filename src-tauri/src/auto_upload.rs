use std::sync::Arc;

use tokio::time::{interval, Duration};

use crate::claude_wrapper;
use crate::state::AppState;

pub fn start_auto_upload(state: &AppState) {
    let logs = Arc::clone(&state.logs);
    let status = Arc::clone(&state.status);
    let upload_handle_ref = Arc::clone(&state.upload_handle);

    let handle = tauri::async_runtime::spawn(async move {
        let task_state = AppState {
            logs,
            status,
            upload_handle: Arc::new(std::sync::Mutex::new(None)),
        };

        let config = claude_wrapper::get_config().await;
        if config.user_email.is_empty() {
            task_state.add_log(
                "warning",
                "사용자 이메일이 설정되지 않아 자동 업로드가 비활성화되었습니다",
            );
            return;
        }

        let interval_secs = config.upload_interval;
        task_state.add_log(
            "info",
            &format!("자동 업로드 시작 ({}초 주기)", interval_secs),
        );

        // 즉시 한 번 실행
        if let Err(e) = claude_wrapper::upload_usage_data(&task_state).await {
            task_state.add_log("error", &format!("자동 업로드 실패: {}", e));
        }

        let mut ticker = interval(Duration::from_secs(interval_secs));

        loop {
            ticker.tick().await;
            let current_config = claude_wrapper::get_config().await;
            if current_config.user_email.is_empty() {
                continue;
            }
            if let Err(e) = claude_wrapper::upload_usage_data(&task_state).await {
                task_state.add_log("error", &format!("자동 업로드 실패: {}", e));
            }
        }
    });

    let mut h = upload_handle_ref.lock().unwrap();
    *h = Some(handle);
}

pub fn restart_auto_upload(state: &AppState) {
    // 기존 태스크 중지
    let mut h = state.upload_handle.lock().unwrap();
    if let Some(handle) = h.take() {
        handle.abort();
    }
    drop(h);

    // 새 태스크 시작
    start_auto_upload(state);
}
