// MP3/오디오 → Strudel 코드 변환기 (브라우저에서 직접 분석, 외부 의존성 없음)
// 코드 생성 규칙은 Strudel 공식 문서를 따름:
//   - 워크숍: https://strudel.cc/workshop/first-sounds/
//   - 샘플 로딩: https://strudel.cc/learn/samples/

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const progressWrap = document.getElementById('progressWrap');
const progressLabel = document.getElementById('progressLabel');
const progressBar = document.getElementById('progressBar');
const resultWrap = document.getElementById('resultWrap');
const trackInfo = document.getElementById('trackInfo');
const resultCode = document.getElementById('resultCode');
const copyBtn = document.getElementById('copyBtn');
const openPlayerBtn = document.getElementById('openPlayerBtn');
const manualBpm = document.getElementById('manualBpm');
const bpmWrap = document.getElementById('bpmWrap');
const bpmInput = document.getElementById('bpm');

let audioBuffer = null;
let fileName = '';
let detectedBpm = null;
let generatedCode = '';

// ===== 파일 선택 UI =====
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

manualBpm.addEventListener('change', () => {
  bpmWrap.style.display = manualBpm.checked ? 'inline-flex' : 'none';
});

async function loadFile(file) {
  if (!/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) {
    alert('오디오 파일(mp3, wav, ogg, m4a 등)을 넣어주세요.');
    return;
  }
  fileName = file.name;
  progressWrap.style.display = 'block';
  setProgress(0.05, '파일 읽는 중…');
  try {
    const buf = await file.arrayBuffer();
    setProgress(0.2, '오디오 디코딩 중…');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await ctx.decodeAudioData(buf);
    ctx.close();
    setProgress(0.5, 'BPM 분석 중…');
    detectedBpm = detectBpm(audioBuffer);
    setProgress(1, '분석 완료');
    setTimeout(() => { progressWrap.style.display = 'none'; }, 600);

    convertBtn.disabled = false;
    dropZone.querySelector('.main').textContent = `✓ ${file.name}`;
    dropZone.querySelector('.desc').textContent =
      `${audioBuffer.duration.toFixed(1)}초 · ${audioBuffer.sampleRate}Hz · ` +
      `감지된 BPM: ${detectedBpm ? detectedBpm.toFixed(1) : '알 수 없음'}`;
    resultWrap.style.display = 'none';
  } catch (err) {
    progressWrap.style.display = 'none';
    alert('오디오 파일을 읽을 수 없습니다: ' + err.message);
  }
}

function setProgress(ratio, label) {
  progressBar.style.width = `${Math.round(ratio * 100)}%`;
  if (label) progressLabel.textContent = label;
}

// ===== BPM 자동 감지 (오프셋 기반 에너지 피크 간격 측정) =====
function detectBpm(buffer) {
  // 모노로 다운믹스
  const chCount = Math.min(buffer.numberOfChannels, 2);
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < chCount; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / chCount;
  }

  const sr = buffer.sampleRate;
  const hop = 512;
  const frames = Math.floor(len / hop);

  // 프레임별 에너지 계산
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + hop && i < len; i++) sum += mono[i] * mono[i];
    energy[f] = sum;
  }
  // 에너지 차분(온셋 근사)
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const d = energy[f] - energy[f - 1];
    flux[f] = d > 0 ? d : 0;
  }

  // 오토코릴레이션으로 주기 추정 (60~200 BPM 범위)
  const fps = sr / hop; // 초당 프레임 수
  const minLag = Math.floor(fps * 60 / 200); // 200 BPM
  const maxLag = Math.min(Math.floor(fps * 60 / 60), Math.floor(frames / 2)); // 60 BPM

  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let f = 0; f + lag < frames; f++) score += flux[f] * flux[f + lag];
    score /= frames - lag;
    // 약간의 배수 페널티 없이 순수 코릴레이션 → 느린 템포 선호 경향 보정
    score *= 1 + 0.002 * lag / minLag;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return null;

  let bpm = (fps * 60) / bestLag;
  // 상식적인 범위(70~180)로 정규화: 절반/두배 템포 보정
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return bpm;
}

// ===== 코드 생성 =====
convertBtn.addEventListener('click', () => {
  if (!audioBuffer) return;
  generatedCode = generateCode();
  resultCode.value = generatedCode;
  resultWrap.style.display = 'block';

  const dur = audioBuffer.duration;
  trackInfo.innerHTML =
    `<strong style="color:#c9c9c9">${fileName}</strong> · ` +
    `${dur.toFixed(1)}초 · ${audioBuffer.numberOfChannels}채널 · ` +
    `BPM: ${(manualBpm.checked ? Number(bpmInput.value) : detectedBpm?.toFixed(1)) ?? '?'}<br />` +
    `아래 코드를 복사해 플레이어에 붙여넣고 Ctrl+Enter로 재생하세요.`;
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(resultCode.value);
  copyBtn.textContent = '복사됨 ✓';
  setTimeout(() => (copyBtn.textContent = '복사'), 1200);
});

openPlayerBtn.addEventListener('click', () => {
  sessionStorage.setItem('strudel-code', generatedCode);
  window.location.href = './index.html';
});

function generateCode() {
  const duration = audioBuffer.duration;
  const limitSec = Number(document.getElementById('durationLimit').value) || 0;
  const useLoop = document.getElementById('useLoop').checked;
  const useChop = document.getElementById('useChop').checked;
  const addDrums = document.getElementById('addDrums').checked;
  const bpm = manualBpm.checked
    ? Number(bpmInput.value)
    : Math.round((detectedBpm ?? 120) * 10) / 10;

  const lines = [];
  lines.push('// ===== MP3 → Strudel 변환 결과 =====');
  lines.push(`// 원본: ${fileName} (${duration.toFixed(1)}초${limitSec ? `, ${limitSec}초만 사용` : ''})`);
  lines.push('// 생성 규칙: https://strudel.cc/workshop/first-sounds/ · https://strudel.cc/learn/samples/');
  lines.push('');
  lines.push('// 1) 업로드한 오디오를 "mysample" 이름으로 등록합니다.');
  lines.push('//    아래 URL 부분을 실제 오디오 파일의 공개 URL로 바꾸거나,');
  lines.push('//    이 프로젝트의 public 폴더에 파일을 넣은 뒤 상대경로로 지정하세요.');
  lines.push(`samples({ mysample: '${sanitizeName(fileName)}' });`);
  lines.push('');

  if (useLoop) {
    lines.push('// 2) 원본 그대로 루프 재생 — loopAt 으로 사이클 길이에 맞춥니다.');
    const cycles = limitSec ? (limitSec * bpm) / 240 : Math.max(2, Math.round((duration * bpm) / 240));
    lines.push(`$: s("mysample").loopAt(${cycles})`);
    lines.push('');
  }

  if (useChop) {
    lines.push('// 3) 샘플을 잘라 리듬 패턴으로 재조합 — chop + slice 조합');
    lines.push('$: s("mysample")');
    lines.push('   .chop(8)');
    lines.push('   .slice(8, "[0 1 2 3] [4 5 <6 7*2> 3]")');
    lines.push('   .loopAt(4)');
    lines.push('');
  }

  if (addDrums) {
    lines.push('// 드럼 비트 레이어 — 공식 워크숍 First Sounds 스타일');
    lines.push(`setcpm(${bpm}/4)`);
    lines.push('$: sound(`[bd ~ ~ ~] [~ ~ ~ bd], [~ ~ sd ~] [~ ~ ~ ~], hh*8`).bank("RolandTR909")');
    lines.push('');
  } else {
    lines.push(`setcpm(${bpm}/4) // 감지된 BPM 반영`);
  }

  return lines.join('\n');
}

function sanitizeName(name) {
  // 공백/한글이 포함된 파일명은 URL 인코딩
  return encodeURI(name.replace(/\s+/g, '_'));
}
