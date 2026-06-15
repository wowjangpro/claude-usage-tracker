use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub user_email: String,
    pub server_url: String,
    pub upload_interval: u64,
    /// 서버로 전송할 프로젝트 ID(디렉토리명) 목록.
    /// `None`이면 아직 설정한 적이 없는 상태로 전체 프로젝트를 전송한다(기존 동작 호환).
    /// `Some([])`이면 명시적으로 아무 프로젝트도 전송하지 않는다.
    #[serde(default)]
    pub selected_projects: Option<Vec<String>>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            user_email: String::new(),
            server_url: "http://10.12.200.99:3498".to_string(),
            upload_interval: 600,
            selected_projects: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub upload_count: u64,
    pub last_upload_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_write_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_tokens: u64,
    pub request_count: u64,
}

/// 로컬에 존재하는 Claude 프로젝트 정보 (설정 화면의 선택 목록용)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// ~/.claude/projects 하위 디렉토리명 (프로젝트 고유 ID)
    pub id: String,
    /// 실제 프로젝트 경로 (jsonl의 cwd 또는 디렉토리명 디코딩)
    pub path: String,
    /// 표시용 이름 (경로의 마지막 세그먼트)
    pub name: String,
}

/// 프로젝트 단위 사용량 집계
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsage {
    pub project_id: String,
    pub project_path: String,
    pub project_name: String,
    pub daily: Vec<DailyUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageData {
    /// 전체 프로젝트를 합산한 일별 사용량
    pub daily: Vec<DailyUsage>,
    /// 프로젝트별 일별 사용량 (대시보드 필터링용)
    pub projects: Vec<ProjectUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveResult {
    pub success: bool,
    pub error: Option<String>,
}
