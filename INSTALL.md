# Claude Usage Tracker 설치 가이드

## macOS 설치 방법

이 앱은 Apple 공증을 받지 않은 앱이므로, macOS에서 설치 시 추가 단계가 필요합니다.

### 1단계: DMG 파일 다운로드

`Claude Usage Tracker.dmg` 파일을 다운로드합니다.

### 2단계: 격리 속성 제거

**터미널**을 열고 아래 명령어를 실행합니다:

```bash
xattr -cr ~/Downloads/Claude\ Usage\ Tracker.dmg
```

> 💡 다운로드 경로가 다르다면 해당 경로로 변경하세요.

### 3단계: 앱 설치

1. DMG 파일을 더블클릭하여 마운트
2. `Claude Usage Tracker.app`을 `Applications` 폴더로 드래그

### 4단계: 앱 실행

Applications 폴더에서 앱을 실행합니다.

---

## 문제 해결

### "악성 소프트웨어가 있는지 확인할 수 없습니다" 오류

Applications 폴더에 복사한 후에도 오류가 발생하면:

```bash
xattr -cr /Applications/Claude\ Usage\ Tracker.app
```

### "앱이 손상되었습니다" 오류

터미널에서 다음 명령어 실행 후 다시 시도:

```bash
sudo xattr -rd com.apple.quarantine /Applications/Claude\ Usage\ Tracker.app
```

### 그래도 안 될 경우

1. 시스템 설정 → 개인정보 보호 및 보안 이동
2. 하단의 "확인 없이 열기" 버튼 클릭

---

## 왜 이런 과정이 필요한가요?

macOS는 Apple 공증을 받지 않은 앱을 기본적으로 차단합니다.
이 앱은 악성코드가 아니며, 위 과정은 macOS의 보안 정책을 우회하는 것입니다.
