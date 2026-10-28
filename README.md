# 삼성·하이닉스 갭 · 달러선물 전망

맨 위 탭 **[삼성·하이닉스 갭 | 달러선물 전망]** 으로 두 페이지를 오가며 봅니다. 휴대폰 화면 기준으로 만들었고, ◐ 버튼으로 고른 밝은/어두운 화면은 두 페이지에 함께 적용됩니다.

| 페이지 | 주소 | 데이터 |
|---|---|---|
| 삼성·하이닉스 실시간 갭 | https://calm6777-png.github.io/pair-gap/ | 하이퍼리퀴드 xyz:SMSN / xyz:SKHX 실시간 캔들. 브라우저가 하이퍼리퀴드에 직접 접속(API·WebSocket) |
| 달러선물 전망 | https://calm6777-png.github.io/pair-gap/usd/ | Yahoo 시세·FXStreet 일정·Bing 뉴스를 Cloudflare Worker(`dollar.calm6777.workers.dev`)가 중계 |

같은 화면이 https://dollar.calm6777.workers.dev/ (갭) 와 `/usd/` (달러선물)에서도 열립니다.

## 1시간봉 신호 알림

갭 차트의 **1시간봉 신호 알림 → 알림 켜기**를 누르면, 화면을 닫아 둬도 갭 점수가 진입 기준(기본 ±2)을 넘을 때 휴대폰으로 푸시가 옵니다.

- Worker(`dollar.calm6777.workers.dev`)가 **5분마다** 하이퍼리퀴드 1시간봉으로 갭 점수를 계산합니다. 화면에서 1시간을 골랐을 때 보이는 값(만들어지는 중인 캔들 포함)과 같습니다.
- 한 번 알리면, 갭이 평소 수준(청산 기준 ±0.5 안)으로 돌아와야 같은 쪽을 다시 알립니다. 반대쪽 신호는 바로 알립니다.
- 기준(평소 길이·진입·청산·손절·종목)은 그 기기 화면 값을 켤 때와 바꿀 때마다 서버에 보냅니다. 기기마다 따로입니다.
- 알림을 누르면 갭 차트가 1시간봉으로 열립니다.
- 아이폰은 사파리 공유 → **홈 화면에 추가**로 설치한 앱(iOS 16.4 이상)에서만 받을 수 있습니다. 안드로이드 크롬은 그냥 켜면 됩니다.

## 구조

| 위치 | 역할 |
|---|---|
| `index.html` | 갭 차트. 파일 하나로 완결 |
| `sw.js` | 신호 알림을 받아 띄우는 서비스 워커(화면 파일은 저장하지 않음) |
| `manifest.webmanifest`, `icon.svg` | 갭 차트를 홈 화면 앱으로 설치할 때 쓰는 정보 |
| `tabs.css`, `tabs.js` | 두 페이지 공통 상단 탭, 밝은/어두운 화면 전환 |
| `usd/` | 달러선물 전망. 화면 파일(`index.html`, `style.css`, `app.js` …)과 소스(`src/`), 테스트, Worker 설정. 계산 방법은 [usd/README.md](usd/README.md) |
| `.assetsignore` | Worker로 내보낼 때 빼는 소스·설정 파일 |

API 키나 비밀값은 쓰지 않습니다(모두 공개 시세). 알림용 VAPID 키는 Worker가 처음 쓸 때 만들어 D1에 보관하므로 저장소에 없습니다.

## 고치고 올리기

- **갭 차트·탭**: 고쳐서 커밋·푸시하면 GitHub Pages에 1~2분 뒤 반영됩니다.
- **달러선물 화면 코드**(`usd/src/app`, `usd/src/lib`): GitHub Pages는 빌드를 하지 않으므로 `cd usd && npm run build`로 `usd/app.js`를 다시 만든 뒤 함께 커밋합니다.
- **시세 중계·신호 알림 Worker**(`usd/src/worker`, `usd/src/lib/gap.ts`): `cd usd && npm run deploy`.
- **로컬 확인**: `cd usd && npm install && npm run dev` → http://localhost:8787 (두 페이지와 API를 함께 띄웁니다)
