// 공식 @strudel/repl 웹 컴포넌트를 로드합니다.
// <strudel-editor> 태그가 자동으로 에디터 + 재생/정지 기능을 제공합니다.
import '@strudel/repl';

// 재생 / 정지 버튼 연결
function setupControls() {
  const playBtn = document.getElementById('playBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (!playBtn || !stopBtn) return;

  playBtn.addEventListener('click', () => {
    const el = document.querySelector('strudel-editor');
    const repl = el?.editor?.repl;
    if (!repl) return;
    // 코드를 평가하고 재생 시작
    repl.evaluate(el.editor.code).then(() => repl.start()).catch(console.error);
  });

  stopBtn.addEventListener('click', () => {
    const el = document.querySelector('strudel-editor');
    el?.editor?.repl?.stop?.();
  });
}

// 컴포넌트 초기화 후 버튼 연결
const trySetup = setInterval(() => {
  const el = document.querySelector('strudel-editor');
  if (el?.editor?.repl) {
    clearInterval(trySetup);
    setupControls();
    setupVisualizer();
  }
}, 200);
setTimeout(() => clearInterval(trySetup), 15000); // 최대 15초 대기

// ===== 배경 오디오 파형 시각화 =====
function setupVisualizer() {
  const canvas = document.getElementById('waveCanvas');
  const ctx2d = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // strudel의 오디오 컨텍스트에 분석기 연결
  let analyser = null;
  const tryConnect = setInterval(() => {
    try {
      if (typeof getAudioContext !== 'function') return;
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const ctrl = getSuperdoughAudioController?.();
      const source = ctrl?.output?.destinationGain || audioCtx.destination;
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      try { source.connect(analyser); } catch (e) { /* 이미 연결됐을 수 있음 */ }
      clearInterval(tryConnect);
    } catch (e) { /* 아직 준비 안 됨 */ }
  }, 500);

  const data = new Uint8Array(1024);
  const bars = 96;
  const heights = new Float32Array(bars);

  function draw() {
    requestAnimationFrame(draw);
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);

    if (analyser) analyser.getByteFrequencyData(data);

    // 하단 중심 대칭 파형 막대
    const barW = w / bars;
    for (let i = 0; i < bars; i++) {
      // 로그 스케일로 저음~고음 고르게 분배
      const idx = Math.floor(Math.pow(i / bars, 1.6) * 400);
      // 증폭: 작은 신호도 잘 보이도록 곡선 강조
      let v = analyser ? data[idx] / 255 : 0;
      v = Math.pow(v, 0.6); // 감마 보정으로 약한 신호 부스트
      // 부드러운 감쇠
      heights[i] += (v - heights[i]) * 0.25;
      const bh = Math.max(3, heights[i] * h * 0.42);
      const x = i * barW + barW * 0.15;
      const bw = barW * 0.7;
      const cy = h / 2;
      // 소리가 클수록 진하게
      const alpha = 0.08 + heights[i] * 0.22;
      ctx2d.fillStyle = `rgba(245, 245, 245, ${alpha.toFixed(3)})`;
      ctx2d.fillRect(x, cy - bh, bw, bh * 2);
    }
  }
  draw();
}
