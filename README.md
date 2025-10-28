# Claude Usage Tracker

Claude Code 사용량을 자동으로 추적하고 서버에 업로드하는 Electron 기반 GUI 애플리케이션입니다.

## 주요 기능

- **실시간 대시보드**: 토큰 사용량, 요청 수 등을 차트로 시각화
- **설정 관리**: 서버 URL, 이메일, 업로드 주기 등을 GUI에서 간편하게 설정
- **로그 뷰어**: 실시간 로그를 앱 내에서 확인
- **자동 업로드**: 설정한 주기마다 자동으로 사용량 데이터를 서버에 업로드
- **Claude Code 통합**: 앱 내에서 Claude Code 시작/중지 제어

## 설치

### 필요 조건

- Node.js 18 이상
- npm 또는 yarn
- Claude Code 설치됨

### 개발 모드 실행

1. 프로젝트 클론 또는 다운로드

2. 의존성 설치:
   ```bash
   cd claude-usage-tracker
   npm install
   ```

3. 개발 모드 실행:
   ```bash
   npm run electron:dev
   ```

### 프로덕션 빌드

.dmg 설치 파일을 생성하려면:

```bash
npm install
npm run build
npm run electron:build
```

빌드된 .dmg 파일은 `release` 디렉토리에 생성됩니다.

## 사용 방법

1. **첫 실행 시 설정**
   - 앱을 실행하면 설정 탭에서 다음 정보를 입력합니다:
     - 사용자 이메일
     - 서버 URL (기본값: http://10.12.200.99:3498)
     - 업로드 주기 (기본값: 600초 = 10분)
     - Claude Code 경로

2. **Claude Code 시작**
   - 사이드바 하단의 "시작" 버튼을 클릭하여 Claude Code를 실행합니다
   - 실행 중에는 설정한 주기마다 자동으로 사용량 데이터가 업로드됩니다

3. **대시보드**
   - 토큰 사용량, 요청 수를 실시간 차트로 확인
   - "즉시 업로드" 버튼으로 수동 업로드 가능

4. **로그**
   - 로그 탭에서 실시간 로그 확인
   - 자동 스크롤 옵션 사용 가능

## 프로젝트 구조

```
claude-usage-tracker/
├── electron/
│   ├── main.js              # Electron 메인 프로세스
│   ├── preload.js           # 보안 브릿지 스크립트
│   └── claude-wrapper.js    # Claude Code 래퍼 로직
├── src/
│   ├── App.jsx              # 메인 React 컴포넌트
│   ├── components/
│   │   ├── Dashboard.jsx    # 대시보드 컴포넌트
│   │   ├── Settings.jsx     # 설정 컴포넌트
│   │   └── LogViewer.jsx    # 로그 뷰어 컴포넌트
│   ├── main.jsx             # React 엔트리 포인트
│   └── index.css            # 스타일
├── public/                  # 정적 파일
├── package.json
├── vite.config.js
└── README.md
```

## 기술 스택

- **Electron**: 데스크톱 애플리케이션 프레임워크
- **React**: UI 라이브러리
- **Vite**: 빌드 도구
- **Chart.js**: 데이터 시각화
- **Tailwind CSS**: 스타일링
- **electron-builder**: 앱 패키징

## 데이터 수집 방식

앱은 `~/.claude/projects` 디렉토리의 모든 JSONL 파일을 스캔하여 다음 데이터를 수집합니다:

- 입력/출력 토큰 수
- 캐시 생성/읽기 토큰 수
- 메시지 개수
- 최근 90일간의 데이터

데이터는 메시지 ID를 기반으로 중복 제거되며, 날짜별로 그룹화되어 서버에 전송됩니다.

## 설정 파일

- **설정 파일**: `~/.claude-usage-config.json`
- **로그 파일**: `~/.claude-code-wrapper/`

## 라이센스

MIT

## 문의

문제가 발생하면 이슈를 등록해주세요.
