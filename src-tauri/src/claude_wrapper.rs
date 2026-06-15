use std::collections::HashMap;

use chrono::{DateTime, Local};
use reqwest::multipart;
use walkdir::WalkDir;

use crate::state::AppState;
use crate::types::{Config, DailyUsage, ProjectInfo, ProjectUsage, UsageData};

pub async fn get_config() -> Config {
    let config_path = dirs::home_dir()
        .expect("home dir not found")
        .join(".claude-usage-config");

    match tokio::fs::read_to_string(&config_path).await {
        Ok(data) => {
            let mut config = Config::default();
            for line in data.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = trimmed.split_once('=') {
                    match key.trim() {
                        "user_email" => config.user_email = value.trim().to_string(),
                        "server_url" => config.server_url = value.trim().to_string(),
                        "upload_interval" => {
                            config.upload_interval = value.trim().parse().unwrap_or(600);
                        }
                        "selected_projects" => {
                            // 콤마 구분 목록. 키가 존재하면 Some(...)로 설정한다.
                            // 값이 비어 있으면 Some(빈 목록) = 아무것도 전송하지 않음.
                            let list: Vec<String> = value
                                .split(',')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            config.selected_projects = Some(list);
                        }
                        _ => {}
                    }
                }
            }
            config
        }
        Err(_) => Config::default(),
    }
}

pub async fn save_config(config: &Config) -> Result<(), String> {
    if config.user_email.trim().is_empty() {
        return Err("사용자 이메일은 필수 항목입니다".to_string());
    }
    if config.server_url.trim().is_empty() {
        return Err("서버 URL은 필수 항목입니다".to_string());
    }
    if config.upload_interval == 0 {
        return Err("업로드 주기는 필수 항목입니다".to_string());
    }

    let mut content = format!(
        "user_email={}\nserver_url={}\nupload_interval={}\n",
        config.user_email, config.server_url, config.upload_interval
    );

    // 선택 목록이 설정된 경우에만 기록한다. (None이면 줄을 쓰지 않아 기존 호환 동작 유지)
    if let Some(projects) = &config.selected_projects {
        content.push_str(&format!("selected_projects={}\n", projects.join(",")));
    }

    let config_path = dirs::home_dir()
        .expect("home dir not found")
        .join(".claude-usage-config");

    tokio::fs::write(&config_path, content)
        .await
        .map_err(|e| e.to_string())
}

/// 디렉토리명(인코딩된 경로)에서 표시용 이름을 뽑는다.
fn name_from_path(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

/// 프로젝트 디렉토리의 jsonl에서 cwd 값을 찾아 실제 경로를 구한다.
/// 찾지 못하면 디렉토리명을 그대로 사용한다.
async fn detect_project_path(project_dir: &std::path::Path, fallback_id: &str) -> String {
    for entry in WalkDir::new(project_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        if let Ok(content) = tokio::fs::read_to_string(path).await {
            for line in content.lines() {
                let trimmed = line.trim();
                if !trimmed.contains("\"cwd\"") {
                    continue;
                }
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(cwd) = value.get("cwd").and_then(|c| c.as_str()) {
                        if !cwd.is_empty() {
                            return cwd.to_string();
                        }
                    }
                }
            }
        }
    }
    fallback_id.to_string()
}

/// ~/.claude/projects 하위의 모든 프로젝트 목록을 반환한다.
pub async fn list_projects() -> Result<Vec<ProjectInfo>, String> {
    let projects_dir = dirs::home_dir()
        .expect("home dir not found")
        .join(".claude/projects");

    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let mut read_dir = tokio::fs::read_dir(&projects_dir)
        .await
        .map_err(|e| e.to_string())?;

    let mut projects = Vec::new();
    while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let project_path = detect_project_path(&path, &id).await;
        let name = name_from_path(&project_path);
        projects.push(ProjectInfo {
            id,
            path: project_path,
            name,
        });
    }

    projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(projects)
}

/// 단일 프로젝트 디렉토리를 스캔해 일별 사용량과 cwd를 집계한다.
async fn scan_single_project(
    project_dir: &std::path::Path,
    cutoff: DateTime<Local>,
) -> (Vec<DailyUsage>, Option<String>) {
    let mut message_data: HashMap<String, (String, serde_json::Value)> = HashMap::new();
    let mut detected_cwd: Option<String> = None;

    for entry in WalkDir::new(project_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        let content = match tokio::fs::read_to_string(path).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let entry: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if detected_cwd.is_none() {
                if let Some(cwd) = entry.get("cwd").and_then(|c| c.as_str()) {
                    if !cwd.is_empty() {
                        detected_cwd = Some(cwd.to_string());
                    }
                }
            }

            if entry.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                continue;
            }

            let timestamp = match entry.get("timestamp").and_then(|t| t.as_str()) {
                Some(ts) => ts,
                None => continue,
            };

            let msg_time: DateTime<Local> = match DateTime::parse_from_rfc3339(timestamp) {
                Ok(dt) => dt.with_timezone(&Local),
                Err(_) => match timestamp.parse::<DateTime<chrono::Utc>>() {
                    Ok(dt) => dt.with_timezone(&Local),
                    Err(_) => continue,
                },
            };

            if msg_time < cutoff {
                continue;
            }

            let date_str = msg_time.format("%Y-%m-%d").to_string();

            let message = match entry.get("message") {
                Some(m) => m,
                None => continue,
            };

            let usage = match message.get("usage") {
                Some(u) if u.is_object() && !u.as_object().unwrap().is_empty() => u.clone(),
                _ => continue,
            };

            let msg_id = message
                .get("id")
                .and_then(|id| id.as_str())
                .map(|s| s.to_string());

            let key = msg_id.unwrap_or_else(|| format!("no_id_{}", timestamp));

            // 항상 덮어씀 - 마지막 엔트리가 최종 토큰 값을 가짐
            message_data.insert(key, (date_str, usage));
        }
    }

    let mut daily_stats: HashMap<String, DailyStats> = HashMap::new();
    for (date_str, usage) in message_data.values() {
        let stats = daily_stats.entry(date_str.clone()).or_default();
        stats.input_tokens += usage
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        stats.output_tokens += usage
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        stats.cache_creation_tokens += usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        stats.cache_read_tokens += usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        stats.message_count += 1;
    }

    let mut daily: Vec<DailyUsage> = daily_stats
        .into_iter()
        .map(|(date, stats)| stats.into_daily(date))
        .collect();
    daily.sort_by(|a, b| a.date.cmp(&b.date));

    (daily, detected_cwd)
}

/// 모든 프로젝트를 프로젝트 단위로 스캔한다.
pub async fn scan_project_usage() -> Result<Vec<ProjectUsage>, String> {
    let projects_dir = dirs::home_dir()
        .expect("home dir not found")
        .join(".claude/projects");

    if !projects_dir.exists() {
        return Err("Claude projects 디렉토리가 존재하지 않습니다".to_string());
    }

    let cutoff = Local::now() - chrono::TimeDelta::days(90);

    let mut read_dir = tokio::fs::read_dir(&projects_dir)
        .await
        .map_err(|e| e.to_string())?;

    let mut projects = Vec::new();
    while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let (daily, detected_cwd) = scan_single_project(&path, cutoff).await;

        // 사용 데이터가 전혀 없는 프로젝트는 집계에서 제외한다.
        if daily.is_empty() {
            continue;
        }

        let project_path = detected_cwd.unwrap_or_else(|| id.clone());
        let project_name = name_from_path(&project_path);

        projects.push(ProjectUsage {
            project_id: id,
            project_path,
            project_name,
            daily,
        });
    }

    projects.sort_by(|a, b| a.project_name.to_lowercase().cmp(&b.project_name.to_lowercase()));
    Ok(projects)
}

/// 여러 프로젝트의 일별 사용량을 날짜 기준으로 합산한다.
fn aggregate_daily(projects: &[&ProjectUsage]) -> Vec<DailyUsage> {
    let mut daily_stats: HashMap<String, DailyStats> = HashMap::new();
    for project in projects {
        for day in &project.daily {
            let stats = daily_stats.entry(day.date.clone()).or_default();
            stats.input_tokens += day.total_input_tokens;
            stats.output_tokens += day.total_output_tokens;
            stats.cache_creation_tokens += day.total_cache_write_tokens;
            stats.cache_read_tokens += day.total_cache_read_tokens;
            stats.message_count += day.request_count;
        }
    }

    let mut daily: Vec<DailyUsage> = daily_stats
        .into_iter()
        .map(|(date, stats)| stats.into_daily(date))
        .collect();
    daily.sort_by(|a, b| a.date.cmp(&b.date));
    daily
}

/// 대시보드/즉시조회용: 전체 프로젝트의 합산 + 프로젝트별 분해를 반환한다.
pub async fn scan_usage_data() -> Result<UsageData, String> {
    let projects = scan_project_usage().await?;
    let daily = aggregate_daily(&projects.iter().collect::<Vec<_>>());
    Ok(UsageData { daily, projects })
}

pub async fn upload_usage_data(state: &AppState) -> Result<UsageData, String> {
    let config = get_config().await;

    if config.user_email.is_empty() {
        return Err("사용자 이메일이 설정되지 않았습니다".to_string());
    }

    state.add_log("info", "사용량 데이터 수집 중...");

    let all_projects = scan_project_usage().await?;

    // 선택된 프로젝트만 추린다. None이면 전체(기존 호환), Some이면 목록에 포함된 것만.
    let selected: Vec<&ProjectUsage> = match &config.selected_projects {
        None => all_projects.iter().collect(),
        Some(ids) => all_projects
            .iter()
            .filter(|p| ids.contains(&p.project_id))
            .collect(),
    };

    if selected.is_empty() {
        state.add_log(
            "warning",
            "전송할 프로젝트가 선택되지 않아 업로드를 건너뜁니다",
        );
        return Ok(UsageData {
            daily: Vec::new(),
            projects: all_projects,
        });
    }

    state.add_log(
        "info",
        &format!("{}개 프로젝트의 사용량을 전송합니다", selected.len()),
    );

    let daily = aggregate_daily(&selected);
    // 서버 호환을 위해 daily만 전송한다.
    let payload = UsageData {
        daily: daily.clone(),
        projects: Vec::new(),
    };
    let json_data = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    if daily.is_empty() {
        return Err("선택한 프로젝트에 전송할 데이터가 없습니다".to_string());
    }

    let upload_url = format!("{}/api/claude-usage/upload", config.server_url);

    let the_hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let timestamp = chrono::Utc::now().timestamp().to_string();

    let file_part = multipart::Part::bytes(json_data.into_bytes())
        .file_name(format!("claude-usage-{}.json", timestamp))
        .mime_str("application/json")
        .map_err(|e| e.to_string())?;

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("hostname", the_hostname)
        .text("timestamp", timestamp)
        .text("userEmail", config.user_email);

    let client = reqwest::Client::new();
    let response = client
        .post(&upload_url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("업로드 요청 실패: {}", e))?;

    let status_code = response.status();
    if status_code.is_success() {
        let count = {
            let mut status = state.status.lock().unwrap();
            status.upload_count += 1;
            status.last_upload_time = Some(chrono::Local::now().to_rfc3339());
            status.upload_count
        };

        state.add_log("success", &format!("업로드 성공 (#{})", count));
    } else {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status_code.as_u16(), body));
    }

    // 화면 갱신을 위해 전체 프로젝트 데이터를 돌려준다.
    Ok(UsageData {
        daily: aggregate_daily(&all_projects.iter().collect::<Vec<_>>()),
        projects: all_projects,
    })
}

#[derive(Default)]
struct DailyStats {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    message_count: u64,
}

impl DailyStats {
    fn into_daily(self, date: String) -> DailyUsage {
        let total_tokens = self.input_tokens
            + self.output_tokens
            + self.cache_creation_tokens
            + self.cache_read_tokens;
        DailyUsage {
            date,
            total_input_tokens: self.input_tokens,
            total_output_tokens: self.output_tokens,
            total_cache_write_tokens: self.cache_creation_tokens,
            total_cache_read_tokens: self.cache_read_tokens,
            total_tokens,
            request_count: self.message_count,
        }
    }
}
