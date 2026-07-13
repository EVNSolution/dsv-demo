# Clever - DSV Demo

DSV 배송 관제 흐름을 보여주는 정적 HTML 데모입니다.

## 바로 보기

- 데모 페이지: https://evnsolution.github.io/dsv-demo/
- 제품 소개: https://evnsolution.github.io/dsv-demo/showcase.html
- 저장소: https://github.com/EVNSolution/dsv-demo

## 데모에 포함된 내용

- 서울 기준 배송 차량 지도
- 2D / 3D 지도 전환
- Public OSRM 기반 실제 경로 표시
- 차량 이동 시뮬레이션
- 배송지 리스트와 상차 리스트
- 주문 업로드용 엑셀형 편집 화면
- 완료 배송 기록, 증빙자료 기록, 현장 메모
- 알림 기준 설정 화면

## OSRM 동작 방식

GitHub Pages에서는 별도 서버 없이 public OSRM을 직접 호출합니다.

```txt
GitHub Pages
→ https://router.project-osrm.org
```

로컬에서 열면 `http://localhost:3000` Clever route server를 먼저 시도하고,
실패하면 public OSRM으로 자동 전환합니다.

```js
localhost 또는 file 실행: localhost:3000 먼저 시도
GitHub Pages 실행: public OSRM 바로 사용
```

## 디버그 확인

브라우저 주소 뒤에 `?debug=1`을 붙이면 콘솔 로그가 자세히 출력됩니다.

```txt
https://evnsolution.github.io/dsv-demo/?debug=1
```

콘솔에서 다음 값도 확인할 수 있습니다.

```js
window.demoLogs
window.downloadDemoLog()
window.mapDebugReport
```

## 로컬 실행

```bash
python3 -m http.server 4173 --directory .
```

그 다음 브라우저에서 엽니다.

```txt
http://localhost:4173/
```

## 검증

Playwright 회귀 테스트를 포함합니다.

```bash
npm install
npm test
```

검증 범위:

- HTML 내부 스크립트 문법 검사
- 배송원 / 업무 / 기록 / 설정 페이지 반응형 카드 레이아웃
- 큰 화면 확장과 좁은 화면 스택/스크롤 동작

## 배포

`main` 브랜치에 push하면 GitHub Actions가 GitHub Pages로 배포합니다.

사용 중인 workflow:

```txt
.github/workflows/pages.yml
```

## 주의

이 데모는 프론트엔드 정적 데모입니다.
DB 저장, 실제 인증, 실제 주문 처리, 실제 알림 발송은 포함하지 않습니다.
설정 화면의 값도 새로고침하면 기본값으로 돌아갑니다.
