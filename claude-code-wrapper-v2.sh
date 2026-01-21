#!/bin/bash

###############################################################################
# Claude Code Wrapper Script (Linux/Mac)
#
# Claude Code를 실행하고 백그라운드에서 주기적으로 사용량 데이터를 서버에 전송합니다.
#
# 사용법:
#   ./claude-code-wrapper.sh [SERVER_URL]
#
# 예시:
#   ./claude-code-wrapper.sh http://localhost:3498
#   ./claude-code-wrapper.sh https://your-stats-server.com
#
# 환경변수:
#   STATS_SERVER_URL     - 통계 서버 URL (기본값: http://localhost:3498)
#   UPLOAD_INTERVAL      - 업로드 주기 (초 단위, 기본값: 600 = 10분)
#   CLAUDE_CODE_PATH     - Claude Code 실행 경로 (기본값: claude)
###############################################################################

# Bash alias 확장 활성화
shopt -s expand_aliases 2>/dev/null || true

# 에러 발생 시에도 계속 진행하도록 설정 (cleanup은 trap으로 보장)
set -e

# PATH 설정 (현재 쉘에 맞는 RC 파일만 로드)
if [ -n "$BASH_VERSION" ]; then
    # Bash 쉘인 경우
    [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
    [ -f "$HOME/.bash_profile" ] && source "$HOME/.bash_profile" 2>/dev/null
elif [ -n "$ZSH_VERSION" ]; then
    # Zsh 쉘인 경우
    [ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null
fi

# 일반적인 PATH 추가
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 설정값
SERVER_URL="${1:-${STATS_SERVER_URL:-http://10.12.200.99:3498}}"
UPLOAD_ENDPOINT="${SERVER_URL}/api/claude-usage/upload"
UPLOAD_INTERVAL="${UPLOAD_INTERVAL:-600}"  # 기본 10분 (600초)

# Claude Code 명령어 결정
if [ -n "$CLAUDE_CODE_PATH" ]; then
    CLAUDE_CODE_CMD="$CLAUDE_CODE_PATH"
else
    # 일반적인 Claude Code 설치 경로들 확인
    CLAUDE_CODE_CMD=""

    # 순서대로 확인
    if [ -x "$HOME/.claude/local/claude" ]; then
        CLAUDE_CODE_CMD="$HOME/.claude/local/claude"
    elif [ -x "$HOME/.local/bin/claude" ]; then
        CLAUDE_CODE_CMD="$HOME/.local/bin/claude"
    elif [ -x "/usr/local/bin/claude" ]; then
        CLAUDE_CODE_CMD="/usr/local/bin/claude"
    else
        # command -v로 찾아보기
        FOUND_PATH=$(command -v claude 2>/dev/null || echo "")
        if [ -n "$FOUND_PATH" ] && [ -x "$FOUND_PATH" ]; then
            CLAUDE_CODE_CMD="$FOUND_PATH"
        else
            # 못 찾으면 기본값
            CLAUDE_CODE_CMD="claude"
        fi
    fi
fi

# 로그 파일 경로
LOG_DIR="${HOME}/.claude-code-wrapper"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/wrapper-$(date +%Y%m%d-%H%M%S).log"
PID_FILE="${LOG_DIR}/claude-code.pid"
MONITOR_PID_FILE="${LOG_DIR}/monitor.pid"

# 전역 변수
CLAUDE_CODE_PID=""
MONITOR_PID=""
UPLOAD_COUNT=0
LAST_UPLOAD_TIME=""

###############################################################################
# 로그 함수
###############################################################################
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "${CYAN}$*${NC}"
}

log_success() {
    log "SUCCESS" "${GREEN}$*${NC}"
}

log_warning() {
    log "WARNING" "${YELLOW}$*${NC}"
}

log_error() {
    log "ERROR" "${RED}$*${NC}"
}

###############################################################################
# 사용량 데이터 업로드 함수
###############################################################################
upload_usage_data() {
    local temp_file="/tmp/claude-usage-$(date +%s).json"

    log_info "📤 사용량 데이터 수집 중..."

    # Claude projects 디렉토리
    local claude_projects_dir="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"

    # 디렉토리 확인
    if [ ! -d "$claude_projects_dir" ]; then
        log_warning "Claude projects 디렉토리가 존재하지 않습니다: $claude_projects_dir"
        return 1
    fi

    # Python으로 JSONL 파일 파싱 (중복 제거 포함)
    python3 << 'PYTHON_SCRIPT' > "$temp_file"
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import os

def scan_all_projects(claude_dir, hours_back=24*90):
    """Scan all Claude Code projects and aggregate usage with deduplication"""
    claude_path = Path(claude_dir).expanduser()

    if not claude_path.exists():
        sys.exit(1)

    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    # Store last usage per message ID (streaming creates multiple entries, last one has final values)
    message_data = {}

    # Find all JSONL files
    jsonl_files = list(claude_path.rglob("*.jsonl"))

    # Phase 1: Read all entries and keep the last one per message ID
    for jsonl_file in jsonl_files:
        with open(jsonl_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())

                    # Check if it's an assistant message with usage info
                    if entry.get('type') != 'assistant':
                        continue

                    # Check timestamp
                    timestamp_str = entry.get('timestamp')
                    if not timestamp_str:
                        continue

                    msg_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    if msg_time < cutoff_time:
                        continue

                    # Get date string for grouping
                    date_str = msg_time.strftime('%Y-%m-%d')

                    # Extract message and usage data
                    message = entry.get('message', {})
                    msg_id = message.get('id')
                    usage = message.get('usage', {})

                    # Skip if no usage
                    if not usage:
                        continue

                    # Use message ID as key, or generate one from timestamp if missing
                    key = msg_id if msg_id else f"no_id_{timestamp_str}"

                    # Always overwrite - last entry has the final usage values
                    message_data[key] = {
                        'date_str': date_str,
                        'usage': usage
                    }

                except Exception:
                    continue

    # Phase 2: Aggregate by date using the last usage values
    daily_stats = {}
    for msg_id, data in message_data.items():
        date_str = data['date_str']
        usage = data['usage']

        if date_str not in daily_stats:
            daily_stats[date_str] = {
                'input_tokens': 0,
                'output_tokens': 0,
                'cache_creation_tokens': 0,
                'cache_read_tokens': 0,
                'message_count': 0
            }

        daily_stats[date_str]['input_tokens'] += usage.get('input_tokens', 0)
        daily_stats[date_str]['output_tokens'] += usage.get('output_tokens', 0)
        daily_stats[date_str]['cache_creation_tokens'] += usage.get('cache_creation_input_tokens', 0)
        daily_stats[date_str]['cache_read_tokens'] += usage.get('cache_read_input_tokens', 0)
        daily_stats[date_str]['message_count'] += 1

    # Create daily format compatible with existing backend
    daily_list = []
    for date_str in sorted(daily_stats.keys()):
        stats = daily_stats[date_str]
        total_tokens = (stats['input_tokens'] + stats['output_tokens'] +
                       stats['cache_creation_tokens'] + stats['cache_read_tokens'])

        daily_list.append({
            'date': date_str,
            'totalInputTokens': stats['input_tokens'],
            'totalOutputTokens': stats['output_tokens'],
            'totalCacheWriteTokens': stats['cache_creation_tokens'],
            'totalCacheReadTokens': stats['cache_read_tokens'],
            'totalTokens': total_tokens,
            'requestCount': stats['message_count']
        })

    output = {'daily': daily_list}
    print(json.dumps(output))

claude_dir = os.environ.get('CLAUDE_PROJECTS_DIR', os.path.expanduser('~/.claude/projects'))
scan_all_projects(claude_dir, hours_back=24*90)
PYTHON_SCRIPT

    # 파일 크기 확인
    local file_size=$(stat -f%z "$temp_file" 2>/dev/null || stat -c%s "$temp_file" 2>/dev/null || echo "0")

    if [ "$file_size" -lt 10 ]; then
        log_warning "데이터가 너무 작거나 비어있습니다. 업로드 건너뜁니다."
        rm -f "$temp_file"
        return 1
    fi

    # 메타데이터 수집
    local hostname=$(hostname)
    local timestamp=$(date +%s)

    # 사용자 이메일 확인
    local user_email="${CLAUDE_USER_EMAIL:-}"
    if [ -z "$user_email" ]; then
        log_warning "CLAUDE_USER_EMAIL 환경변수가 설정되지 않았습니다. 업로드를 건너뜁니다."
        rm -f "$temp_file"
        return 1
    fi

    # 서버에 업로드
    local http_response=$(curl -s -w "\n%{http_code}" -X POST \
        -F "file=@$temp_file" \
        -F "hostname=$hostname" \
        -F "timestamp=$timestamp" \
        -F "userEmail=$user_email" \
        "$UPLOAD_ENDPOINT" 2>&1)

    local http_status=$(echo "$http_response" | tail -n1)
    local http_body=$(echo "$http_response" | sed '$d')

    # 임시 파일 삭제
    rm -f "$temp_file"

    # 결과 확인
    if [ "$http_status" = "200" ] || [ "$http_status" = "201" ]; then
        UPLOAD_COUNT=$((UPLOAD_COUNT + 1))
        LAST_UPLOAD_TIME=$(date "+%Y-%m-%d %H:%M:%S")
        log_success "✓ 업로드 성공 (#${UPLOAD_COUNT}) - 파일 크기: ${file_size} bytes"
        return 0
    else
        log_error "✗ 업로드 실패 (HTTP ${http_status})"
        log_error "서버 응답: ${http_body}"
        return 1
    fi
}

###############################################################################
# Claude Code 프로세스 확인
###############################################################################
is_claude_code_running() {
    if [ -z "$CLAUDE_CODE_PID" ]; then
        return 1
    fi

    # 프로세스 존재 확인
    if ps -p "$CLAUDE_CODE_PID" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

###############################################################################
# 모니터링 백그라운드 작업
###############################################################################
monitor_and_upload() {
    log_info "🔄 모니터링 시작 (업로드 주기: ${UPLOAD_INTERVAL}초)"

    local next_upload_time=$(($(date +%s) + UPLOAD_INTERVAL))

    while true; do
        # Claude Code 프로세스 확인
        if ! is_claude_code_running; then
            log_info "Claude Code 프로세스가 종료되었습니다."
            break
        fi

        # 업로드 시간 확인
        local current_time=$(date +%s)
        if [ $current_time -ge $next_upload_time ]; then
            upload_usage_data || true  # 실패해도 계속 진행
            next_upload_time=$((current_time + UPLOAD_INTERVAL))
        fi

        # 10초마다 체크
        sleep 10
    done

    log_info "모니터링 종료"
}

###############################################################################
# 정리 함수
###############################################################################
cleanup() {
    log_info "🧹 정리 작업 시작..."

    # 모니터 프로세스 종료
    if [ -n "$MONITOR_PID" ] && ps -p "$MONITOR_PID" > /dev/null 2>&1; then
        log_info "모니터 프로세스 종료 중 (PID: ${MONITOR_PID})..."
        kill "$MONITOR_PID" 2>/dev/null || true
        wait "$MONITOR_PID" 2>/dev/null || true
    fi

    # Claude Code 프로세스 종료 (혹시 남아있을 경우)
    if [ -n "$CLAUDE_CODE_PID" ] && ps -p "$CLAUDE_CODE_PID" > /dev/null 2>&1; then
        log_warning "Claude Code 프로세스가 아직 실행 중입니다. 종료 대기..."
        # 부모 프로세스는 자연스럽게 종료되도록 대기만 함
    fi

    # PID 파일 삭제
    rm -f "$PID_FILE" "$MONITOR_PID_FILE"

    # 최종 업로드
    log_info "📤 최종 사용량 데이터 업로드..."
    upload_usage_data || log_warning "최종 업로드 실패 (데이터가 없을 수 있습니다)"

    # 통계 출력
    log_success "════════════════════════════════════════════════════"
    log_success "총 업로드 횟수: ${UPLOAD_COUNT}회"
    if [ -n "$LAST_UPLOAD_TIME" ]; then
        log_success "마지막 업로드: ${LAST_UPLOAD_TIME}"
    fi
    log_success "로그 파일: ${LOG_FILE}"
    log_success "════════════════════════════════════════════════════"
}

###############################################################################
# 시그널 핸들러
###############################################################################
trap cleanup EXIT INT TERM

###############################################################################
# 메인 실행 로직
###############################################################################
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Claude Code Wrapper Script (자동 업로드)        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
    echo ""

    # 사용자 이메일 확인
    if [ -z "$CLAUDE_USER_EMAIL" ]; then
        # 설정 파일에서 이메일 읽기
        CONFIG_FILE="$HOME/.claude-usage-config"
        if [ -f "$CONFIG_FILE" ]; then
            CLAUDE_USER_EMAIL=$(grep -E "^user_email=" "$CONFIG_FILE" 2>/dev/null | cut -d'=' -f2-)
        fi

        # 설정 파일에도 없으면 입력 받기
        if [ -z "$CLAUDE_USER_EMAIL" ]; then
            echo -e "${YELLOW}사용자 이메일을 입력해주세요 (다음부터는 저장된 이메일을 사용합니다):${NC}"
            read -p "Email: " CLAUDE_USER_EMAIL

            if [ -z "$CLAUDE_USER_EMAIL" ]; then
                log_error "이메일이 입력되지 않았습니다."
                exit 1
            fi

            # 설정 파일에 저장
            echo "user_email=$CLAUDE_USER_EMAIL" > "$CONFIG_FILE"
            chmod 600 "$CONFIG_FILE"
            echo -e "${GREEN}✓ 이메일이 $CONFIG_FILE 에 저장되었습니다.${NC}"
        fi

        export CLAUDE_USER_EMAIL
        echo ""
    fi

    log_info "설정:"
    log_info "  - 서버 URL: ${SERVER_URL}"
    log_info "  - 사용자: ${CLAUDE_USER_EMAIL}"
    log_info "  - 업로드 주기: ${UPLOAD_INTERVAL}초 ($(($UPLOAD_INTERVAL / 60))분)"
    log_info "  - Claude Code 명령어: ${CLAUDE_CODE_CMD}"
    log_info "  - 로그 파일: ${LOG_FILE}"
    echo ""

    # 필수 도구 확인
    log_info "필수 도구 확인 중..."

    if ! command -v npx &> /dev/null; then
        log_error "npx가 설치되어 있지 않습니다."
        log_error "Node.js를 설치해주세요: https://nodejs.org/"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        log_error "curl이 설치되어 있지 않습니다."
        exit 1
    fi

    # Claude Code 명령어 확인
    if [ -x "$CLAUDE_CODE_CMD" ]; then
        log_info "✓ Claude Code 명령어 확인: ${CLAUDE_CODE_CMD}"
    elif type "$CLAUDE_CODE_CMD" &> /dev/null; then
        log_info "✓ Claude Code 명령어 확인: ${CLAUDE_CODE_CMD}"
    else
        log_warning "Claude Code 명령어를 찾을 수 없습니다: ${CLAUDE_CODE_CMD}"
        log_info "계속 진행합니다. 실행 시 오류가 발생하면 CLAUDE_CODE_PATH 환경변수를 설정해주세요."
    fi

    log_success "✓ 필수 도구 확인 완료"
    echo ""

    # 초기 업로드 (시작 시점 데이터)
    log_info "🚀 초기 사용량 데이터 업로드..."
    upload_usage_data || log_warning "초기 업로드 실패 (기존 데이터가 없을 수 있습니다)"
    echo ""

    # Claude Code 실행 (포그라운드로 직접 실행하여 입출력 모두 가능)
    log_info "🎯 Claude Code 실행 중..."
    log_info "실행 명령어: ${CLAUDE_CODE_CMD}"
    log_info "종료하려면 Claude Code를 종료하거나 Ctrl+C를 누르세요."
    log_info ""
    log_info "📊 사용량 데이터는 백그라운드에서 ${UPLOAD_INTERVAL}초($(($UPLOAD_INTERVAL / 60))분)마다 자동 업로드됩니다."
    echo ""

    # 백그라운드에서 주기적 업로드를 위한 타이머 (별도 서브쉘)
    (
        while true; do
            sleep "$UPLOAD_INTERVAL"
            upload_usage_data >> "$LOG_FILE" 2>&1 || true
        done
    ) &
    MONITOR_PID=$!
    echo "$MONITOR_PID" > "$MONITOR_PID_FILE"

    # 포그라운드로 직접 실행 (입출력 모두 터미널과 연결됨)
    "$CLAUDE_CODE_CMD" "$@"
    local exit_code=$?

    # 모니터링 프로세스 종료
    if [ -n "$MONITOR_PID" ] && ps -p "$MONITOR_PID" > /dev/null 2>&1; then
        kill "$MONITOR_PID" 2>/dev/null || true
    fi

    log_info "Claude Code가 종료되었습니다 (종료 코드: ${exit_code})"

    # cleanup은 EXIT trap에서 자동 실행됨
}

# 스크립트 실행
main "$@"

