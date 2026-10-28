# 삼성·하이닉스 갭 · 달러선물 전망

맨 위 탭 **[삼성·하이닉스 갭 | 달러선물 전망]** 으로 두 페이지를 오가며 봅니다. 휴대폰 화면 기준으로 만들었고, ◐ 버튼으로 고른 밝은/어두운 화면은 두 페이지에 함께 적용됩니다.

| 페이지 | 주소 | 데이터 |
|---|---|---|
| 삼성·하이닉스 실시간 갭 | https://calm6777-png.github.io/pair-gap/ | 하이퍼리퀴드 xyz:SMSN / xyz:SKHX 실시간 캔들. 브라우저가 하이퍼리퀴드에 직접 접속(API·WebSocket) |
| 달러선물 전망 | https://calm6777-png.github.io/pair-gap/usd/ | Yahoo 시세·FXStreet 일정·Bing 뉴스를 Cloudflare Worker(`dollar.calm6777.workers.dev`)가 중계 |

같은 화면이 https://dollar.calm6777.workers.dev/ (갭) 와 `/usd/` (달러선물)에서도 열립니다.

## 구조

| 위치 | 역할 |
|---|---|
| `index.html` | 갭 차트. 파일 하나로 완결 |
| `tabs.css`, `tabs.js` | 두 페이지 공통 상단 탭, 밝은/어두운 화면 전환 |
| `usd/` | 달러선물 전망. 화면 파일(`index.html`, `style.css`, `app.js` …)과 소스(`src/`), 테스트, Worker 설정. 계산 방법은 [usd/README.md](usd/README.md) |
| `.assetsignore` | Worker로 내보낼 때 빼는 소스·설정 파일 |

API 키나 비밀값은 쓰지 않습니다(모두 공개 시세).

## 고치고 올리기

- **갭 차트·탭**: 고쳐서 커밋·푸시하면 GitHub Pages에 1~2분 뒤 반영됩니다.
- **달러선물 화면 코드**(`usd/src/app`, `usd/src/lib`): GitHub Pages는 빌드를 하지 않으므로 `cd usd && npm run build`로 `usd/app.js`를 다시 만든 뒤 함께 커밋합니다.
- **시세 중계 Worker**(`usd/src/worker`): `cd usd && npm run deploy`.
- **로컬 확인**: `cd usd && npm install && npm run dev` → http://localhost:8787 (두 페이지와 API를 함께 띄웁니다)
