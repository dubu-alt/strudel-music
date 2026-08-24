// MML(Music Macro Language) → Strudel 코드 변환기 (브라우저에서 직접 파싱)
// 코드 생성 규칙: https://strudel.cc/workshop/first-notes/

const convertBtn = document.getElementById('convertBtn');
const addTrackBtn = document.getElementById('addTrackBtn');
const resultWrap = document.getElementById('resultWrap');
const trackInfo = document.getElementById('trackInfo');
const resultCode = document.getElementById('resultCode');
const copyBtn = document.getElementById('copyBtn');
const openPlayerBtn = document.getElementById('openPlayerBtn');

let generatedCode = '';

addTrackBtn.addEventListener('click', () => {
  const panel = document.getElementById('tracksPanel');
  const sections = panel.querySelectorAll('.trackSection');
  const idx = sections.length;
  const div = document.createElement('div');
  div.className = 'trackSection';
  div.dataset.track = idx;
  div.innerHTML = `
    <div class="trackHeader">
      <span class="name">트랙 ${idx + 1}</span>
      <label><input type="checkbox" class="useTrack" checked /> 사용</label>
      <label>옥타브 이동
        <input type="number" class="octShift" value="0" min="-4" max="4" style="width:4rem" />
      </label>
    </div>
    <textarea class="mmlInput" spellcheck="false" placeholder="MML 텍스트를 붙여넣으세요"></textarea>`;
  panel.insertBefore(div, addTrackBtn);
});

convertBtn.addEventListener('click', () => {
  const bpm = Number(document.getElementById('bpm').value) || 135;
  const defaultLen = Number(document.getElementById('defaultLen').value) || 4;
  const melodySound = document.getElementById('melodySound').value.trim() || 'sawtooth';
  const chordSound = document.getElementById('chordSound').value.trim() || 'triangle';

  const tracks = [];
  document.querySelectorAll('.trackSection').forEach((sec, i) => {
    if (!sec.querySelector('.useTrack').checked) return;
    const mml = sec.querySelector('.mmlInput').value;
    if (!mml.trim()) return;
    const octShift = Number(sec.querySelector('.octShift').value) || 0;
    const notes = parseMml(mml, defaultLen, octShift);
    if (notes.length) {
      tracks.push({ index: i + 1, notes, count: notes.length });
    }
  });

  if (!tracks.length) {
    alert('변환할 MML 텍스트를 입력해주세요.');
    return;
  }

  generatedCode = generateCode(tracks, bpm, melodySound, chordSound);
  resultCode.value = generatedCode;
  resultWrap.style.display = 'block';
  trackInfo.innerHTML =
    `<strong style="color:#c9c9c9">${tracks.length}개 트랙 변환 완료</strong> · ` +
    `BPM ${bpm} · 총 노트 ${tracks.reduce((s, t) => s + t.count, 0)}개<br />` +
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

// ===== MML 파서 =====
// 지원: c~b 음이름, #/+/- 반음, o 옥타브, > < 옥타브 이동, l 기본길이,
//       n1~n96 노트번호, r/p 쉼, & 타이(이음), v/t 등은 무시
const NOTE_SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function parseMml(mml, defaultLen, octShift) {
  // 공백/제거 대상 정리 (v15, t135 같은 접두 명령은 스킵 대상)
  const s = mml.replace(/\s+/g, '');
  const events = []; // { startBeat, durBeats, midi }
  let octave = 4; // MML 기본 o4
  let len = defaultLen;
  let dot = false;
  let pos = 0; // 현재 위치(박자 단위)
  let i = 0;

  const lenToBeats = (l, d) => {
    let beats = 4 / l;
    if (d) beats *= 1.5;
    return beats;
  };

  while (i < s.length) {
    const ch = s[i].toLowerCase();

    if (/[a-g]/.test(ch)) {
      i++;
      // 임시표 (# 또는 + 올림, - 내림)
      let semi = 0;
      while (i < s.length && '#+-'.includes(s[i])) {
        semi += s[i] === '-' ? -1 : 1;
        i++;
      }
      // 길이
      let l = len, d = false;
      let num = '';
      while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];
      if (num) l = Number(num);
      if (s[i] === '.') { d = true; i++; }
      const dur = lenToBeats(l, d);
      const midi = (octave + octShift + 1) * 12 + NOTE_SEMITONE[ch] + semi;
      events.push({ start: pos, dur, midi });
      pos += dur;
      continue;
    }

    if (ch === 'r' || ch === 'p') {
      i++;
      let l = len, d = false;
      let num = '';
      while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];
      if (num) l = Number(num);
      if (s[i] === '.') { d = true; i++; }
      pos += lenToBeats(l, d);
      continue;
    }

    if (ch === 'o') {
      i++;
      let num = '';
      while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];
      if (num) octave = Number(num);
      continue;
    }

    if (ch === '>') { octave++; i++; continue; }
    if (ch === '<') { octave--; i++; continue; }
    if (ch === 'l') {
      i++;
      let num = '';
      while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];
      if (num) len = Number(num);
      if (s[i] === '.') { /* l8. 도 점허용 */ len = len; i++; }
      continue;
    }
    if (ch === 'n') {
      // n번호: 1=C4 기준 (n0은 A3)
      i++;
      let num = '';
      while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];
      let l = len, d = false;
      if (s[i] === '.') { d = true; i++; }
      if (num) {
        const midi = 57 + Number(num); // n0 = A3 = MIDI 57
        const dur = lenToBeats(l, d);
        events.push({ start: pos, dur, midi: midi + octShift * 12 });
        pos += dur;
      }
      continue;
    }

    if (ch === '&') { i++; continue; } // 타이: 다음 노트와 이어짐 → 길이 합산 처리는 단순화 위해 무시
    if (ch === '[' || ch === ']') { i++; continue; } // 루프 문법 미지원, 무시

    // v15, t135, @ 등 숫자가 붙는 명령 스킵
    if (/[vtsq@]/.test(ch)) {
      i++;
      while (i < s.length && /[0-9]/.test(s[i])) i++;
      continue;
    }

    i++; // 알 수 없는 문자 무시
  }

  return events;
}

// ===== 코드 생성 =====
function generateCode(tracks, bpm, melodySound, chordSound) {
  const lines = [];
  lines.push('// ===== MML → Strudel 변환 결과 =====');
  lines.push(`// BPM ${bpm} · ${tracks.map((t) => `트랙${t.index}: ${t.count}노트`).join(' · ')}`);
  lines.push('// 생성 규칙: https://strudel.cc/workshop/first-notes/');
  lines.push('');
  lines.push(`setcpm(${bpm}/4)`);
  lines.push('');

  tracks.forEach((t, idx) => {
    const isChord = idx > 0 || t.index > 1;
    const sound = isChord ? chordSound : melodySound;
    const label = t.index === 1 ? '멜로디' : `트랙 ${t.index}`;
    lines.push(`// --- ${label} (${t.count} 노트) ---`);
    lines.push(`$: note("${notesToPattern(t.notes)}")`);
    lines.push(`   .sound("${sound}")`);
    lines.push(`   .clip(1)`);
    lines.push(`   .gain(${isChord ? 0.6 : 0.85})`);
    lines.push('');
  });

  return lines.join('\n');
}

// 노트 배열 → Strudel 미니 노테이션 (@로 길이 표현, 박자 단위)
function notesToPattern(events) {
  const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const parts = [];
  for (const ev of events) {
    const midi = Math.round(ev.midi);
    const name = names[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    const dur = Number(ev.dur.toFixed(2));
    parts.push(`${name}${oct}@${dur}`);
  }
  // 너무 길면 줄바꿈으로 정리
  const out = [];
  let line = [];
  for (const p of parts) {
    line.push(p);
    if (line.join(' ').length > 90) {
      out.push(line.join(' '));
      line = [];
    }
  }
  if (line.length) out.push(line.join(' '));
  return out.join('\n     ');
}
