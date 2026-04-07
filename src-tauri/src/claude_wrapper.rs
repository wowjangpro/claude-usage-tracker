use std::collections::HashMap;

use chrono::{DateTime, Local};
use reqwest::multipart;
use walkdir::WalkDir;

use crate::state::AppState;
use crate::types::{Config, DailyUsage, UsageData};

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

    let content = format!(
        "user_email={}\nserver_url={}\nupload_interval={}\n",
        config.user_email, config.server_url, config.upload_interval
    );

    let config_path = dirs::home_dir()
        .expect("home dir not found")
        .join(".claude-usage-config");

    tokio::fs::write(&config_path, content)
        .await
        .map_err(|e| e.to_string())
}

pub async fn scan_usage_data() -> Result<UsageData, String> {
    let projects_dir = dirs::home_dir()
        .expect("home dir not found")
        .join(".claude/projects");

    if !projects_dir.exists() {
        return Err("Claude projects 디렉토리가 존재하지 않습니다".to_string());
    }

    let cutoff = Local::now() - chrono::TimeDelta::days(90);

    // Phase 1: 모든 엔트리를 읽고 같은 message_id는 마지막 값으로 덮어씀
    let mut message_data: HashMap<String, (String, serde_json::Value)> = HashMap::new();

    for entry in WalkDir::new(&projects_dir)
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

            if entry.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                continue;
            }

            let timestamp = match entry.get("timestamp").and_then(|t| t.as_str()) {
                Some(ts) => ts,
                None => continue,
            };

            let msg_time: DateTime<Local> = match DateTime::parse_from_rfc3339(timestamp) {
                Ok(dt) => dt.with_timezone(&Local),
                Err(_) => {
                    // ISO 8601 형식이 아닌 경우 다른 형식 시도
                    match timestamp.parse::<DateTime<chrono::Utc>>() {
                        Ok(dt) => dt.with_timezone(&Local),
                        Err(_) => continue,
                    }
                }
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

    // Phase 2: 최종 값으로 집계
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
        .map(|(date, stats)| {
            let total_tokens = stats.input_tokens
                + stats.output_tokens
                + stats.cache_creation_tokens
                + stats.cache_read_tokens;

            DailyUsage {
                date,
                total_input_tokens: stats.input_tokens,
                total_output_tokens: stats.output_tokens,
                total_cache_write_tokens: stats.cache_creation_tokens,
                total_cache_read_tokens: stats.cache_read_tokens,
                total_tokens,
                request_count: stats.message_count,
            }
        })
        .collect();

    daily.sort_by(|a, b| a.date.cmp(&b.date));

    Ok(UsageData { daily })
}

pub async fn upload_usage_data(state: &AppState) -> Result<UsageData, String> {
    let config = get_config().await;

    if config.user_email.is_empty() {
        return Err("사용자 이메일이 설정되지 않았습니다".to_string());
    }

    state.add_log("info", "사용량 데이터 수집 중...");

    let usage_data = scan_usage_data().await?;
    let json_data = serde_json::to_string(&usage_data).map_err(|e| e.to_string())?;

    if json_data.len() < 10 {
        return Err("데이터가 너무 작거나 비어있습니다".to_string());
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

    Ok(usage_data)
}

#[derive(Default)]
struct DailyStats {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    message_count: u64,
}
