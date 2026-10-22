# 딱! 다섯 — 하루 5문장 영어 암기

설치나 빌드 없이 쓰는 정적 웹앱이에요 (HTML · CSS · JS).

## 실행

마이크 권한이 필요해서 로컬 서버로 여는 걸 권장해요.

```
cd E:\ddak-daseot
python -m http.server 5173
```
→ Chrome 또는 Edge에서 http://localhost:5173 열기

- 음성 인식: Chrome / Edge / Safari (Firefox 미지원 → 정답 보기로 대체)
- 녹음 음성: `audio/{날짜번호}-{문장번호}-{ko|en}.mp3` (ElevenLabs · Anna Kim). 현재 1일차만 있음.
  다른 날을 추가하면 `app.js`의 `REC_DAYS`에 날짜 번호(0부터)를 넣으면 돼요. 녹음이 없는 문장은 기기 음성으로 읽어요.
- 기기 음성 중 가장 자연스러운 것: Edge("Natural") > Chrome("Google") > Safari("Enhanced")

## GitHub Pages로 배포 (테스트용)

1. github.com → New repository → 이름 예: `ddak-daseot` → **Public** → Create
2. 저장소 화면의 **uploading an existing file** → 이 폴더 안의 파일과 `audio` 폴더를 전부 끌어다 놓기 → Commit changes
3. Settings → Pages → Branch: `main` / `/ (root)` → Save
4. 1~2분 뒤 `https://<아이디>.github.io/ddak-daseot/` 접속 (휴대폰에서도 열려요, 마이크 허용 필요)

## 흐름

홈(학습 경로) — 하루 = ⭐ 문장 → 📖 표현 레슨 → 🎁 보물상자. 다 끝내면 다음 날 다음 일차가 열려요.
- ⭐ 문장: 듣기 → 생각 5초 → 영어 → 따라 말하기 × 반복 1~3회 → 5초 말하기(음성 인식 채점) → 룰렛(START/STOP)
- 📖 표현 레슨: 오늘 5문장으로 10문제 (단어 배열 · 듣고 고르기 · 빈칸 · 뜻). 틀린 문제는 끝에 다시 나와요.
- 효과음은 Web Audio로 합성(파일 없음), 진동은 Android만 (iPhone Safari는 진동 미지원)

녹음 대본: `녹음대본.txt`

## 파일

| 파일 | 역할 |
|---|---|
| `data.js` | 10일치 문장 (하루 5개, 날마다 돌아가며 나옴) |
| `score.js` | 발음 채점 (단어 단위 비교) |
| `app.js` | 화면 · 음성 · 저장 |
| `style.css` | 디자인 토큰 · 모션 |

테스트: `node score.test.js`
