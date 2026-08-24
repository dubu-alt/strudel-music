# Strudel Music (로컬)

VS Code에서 편집하고 브라우저에서 바로 듣는 Strudel 로컬 환경입니다.

## 실행 방법

```bash
npm install   # 최초 1회
npm run dev
```

터미널에 표시되는 `http://localhost:5173` 을 브라우저로 열면 됩니다.

## 사용법

- 코드를 수정하면 **800ms 후 자동으로 다시 재생**됩니다.
- `Ctrl+Enter` (Mac: `Cmd+Enter`) 즉시 재생
- `Ctrl+.` (Mac: `Cmd+.`) 정지

## MIDI 파일 사용하기

`midi/` 폴더에 `.mid` 파일을 넣고, 변환 도구를 이용해 Strudel 코드로 바꿀 수 있습니다:

- [Strudelizer](https://midi-strudel-dash.vercel.app/) — 웹에서 .mid → Strudel 코드 변환
- 또는 Python 스크립트 변환 요청 가능

변환된 코드를 `src/main.js`의 `initialCode`에 붙여넣으면 됩니다.

## 참고

- [Strudel 공식 문서](https://strudel.cc/workshop/getting-started/)
- [미니 노테이션 치트시트](https://strudel.cc/learn/mini-notation/)
