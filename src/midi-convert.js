// MIDI → Strudel 코드 변환기 (브라우저에서 직접 파싱, 외부 의존성 없음)

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const resultWrap = document.getElementById('resultWrap');
const trackInfo = document.getElementById('trackInfo');
const resultCode = document.getElementById('resultCode');
const copyBtn = document.getElementById('copyBtn');

let midiData = null;

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

async function loadFile(file) {
  if (!/\.(mid|midi)$/i.test(file.name)) {
    alert('.mid 또는 .midi 파일을 넣어주세요.');
    return;
  }
  const buf = await file.arrayBuffer();
  try {
    midiData = parseMidi(new Uint8Array(buf));
    convertBtn.disabled = false;
    dropZone.querySelector('.main').textContent = `✓ ${file.name}`;
    dropZone.querySelector('.desc').textContent =
      `${midiData.tracks.length}개 트랙 · ${midiData.ticksPerBeat} ticks/beat`;
  } catch (err) {
    alert('MIDI 파일을 읽을 수 없습니다: ' + err.message);
  }
}

// ===== MIDI 파서 (SMF 표준) =====
function parseMidi(bytes) {
  let pos = 0;
  const readStr = (n) => String.fromCharCode(...bytes.slice(pos, (pos += n)));
  const read32 = () => (bytes[pos++] << 24) | (bytes[pos++] << 16) | (bytes[pos++] << 8) | bytes[pos++];
  const read16 = () => (bytes[pos++] << 8) | bytes[pos++];
  const readVar = () => {
    let v = 0;
    for (;;) {
      const b = bytes[pos++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
  };

  if (readStr(4) !== 'MThd') throw new Error('MThd 헤더 없음');
  read32(); // header length
  const format = read16();
  const numTracks = read16();
  const division = read16();
  const ticksPerBeat = division & 0x8000 ? 480 : division; // SMPTE는 미지원(480으로 대체)

  const tracks = [];
  for (let t = 0; t < numTracks; t++) {
    if (readStr(4) !== 'MTrk') break;
    const len = read32();
    const end = pos + len;
    const events = [];
    let runningStatus = 0;

    while (pos < end) {
      const tick = readVar();
      let status = bytes[pos];
      if (status < 0x80) status = runningStatus;
      else pos++;
      runningStatus = status;

      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (type === 0x90 || type === 0x80) {
        const note = bytes[pos++];
        const vel = bytes[pos++];
        events.push({ tick, kind: type === 0x90 && vel > 0 ? 'on' : 'off', note, vel, channel });
      } else if (type === 0xb0 || type === 0xa0 || type === 0xe0) {
        pos += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        pos += 1;
      } else if (status === 0xff) {
        pos++; // meta type
        const mlen = readVar();
        if ([0x03, 0x04].includes(bytes[pos - mlen - 1] ?? bytes[pos])) {
          // 트랙명은 나중에 읽음
        }
        if (bytes[pos] === 0x03 || events._nameRead) {
          // skip
        }
        const metaStart = pos;
        if (bytes[metaStart] === 0x03 && !events.trackName) {
          events.trackName = String.fromCharCode(...bytes.slice(metaStart + 1, metaStart + mlen));
        }
        pos += mlen;
      } else if (status >= 0xf0) {
        const mlen = readVar();
        pos += mlen;
      }
    }
    pos = end;
    tracks.push({ events });
  }

  return { format, ticksPerBeat, tracks };
}

// ===== 노트 이벤트 → (tick, note, durTicks) 목록 =====
function extractNotes(track) {
  const ons = new Map(); // key: ch*128+note → [{tick, vel}]
  const notes = [];
  for (const ev of track.events) {
    if (ev.kind === 'on') {
      const key = ev.channel * 128 + ev.note;
      if (!ons.has(key)) ons.set(key, []);
      ons.get(key).push({ tick: ev.tick, vel: ev.vel });
    } else if (ev.kind === 'off') {
      const key = ev.channel * 128 + ev.note;
      const stack = ons.get(key);
      if (stack && stack.length) {
        const on = stack.shift();
        notes.push({ tick: on.tick, note: ev.note, dur: Math.max(ev.tick - on.tick, 1), channel: ev.channel, vel: on.vel });
      }
    }
  }
  notes.sort((a, b) => a.tick - b.tick);
  return notes;
}

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
function midiToName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

// ===== 변환 =====
convertBtn.addEventListener('click', () => {
  if (!midiData) return;
  const beatsPerCycle = parseInt(document.getElementById('beatsPerCycle').value) || 4;
  const tpb = midiData.ticksPerBeat;
  const ticksPerCycle = tpb * beatsPerCycle;

  // 채널별로 그룹화 (드럼 채널 9는 별도)
  const byChannel = new Map();
  let maxTick = 0;
  for (const tr of midiData.tracks) {
    for (const n of extractNotes(tr)) {
      if (!byChannel.has(n.channel)) byChannel.set(n.channel, []);
      byChannel.get(n.channel).push(n);
      maxTick = Math.max(maxTick, n.tick + n.dur);
    }
  }

  const totalCycles = Math.ceil(maxTick / ticksPerCycle);
  const lines = [`// MIDI 변환 결과 · ${totalCycles} 사이클`];

  const drumNames = ['bd', 'sd', 'hh', 'cp', 'lt', 'mt', 'ht', 'crash'];
  for (const [ch, notes] of [...byChannel.entries()].sort((a, b) => a[0] - b[0])) {
    const isDrum = ch === 9;
    // 사이클별로 그룹화
    const cycles = [];
    for (let c = 0; c < totalCycles; c++) cycles.push([]);

    for (const n of notes) {
      const cycle = Math.floor(n.tick / ticksPerCycle);
      if (cycle >= totalCycles) continue;
      const offsetInCycle = (n.tick % ticksPerCycle) / ticksPerCycle;
      cycles[cycle].push({ ...n, offset: offsetInCycle });
    }

    // 비어있는 사이클 건너뛰고 미니노테이션 생성
    const parts = [];
    cycles.forEach((cnotes, ci) => {
      if (!cnotes.length) return;
      const items = cnotes
        .sort((a, b) => a.offset - b.offset)
        .map((n) => {
          const name = isDrum
            ? drumNames[Math.min(Math.floor(n.note / 8), drumNames.length - 1)] || 'hh'
            : midiToName(n.note);
          return name;
        })
        .join(' ');
      parts.push(`<${items}>`);
    });

    if (!parts.length) continue;
    const pattern = parts.join(' ');

    if (isDrum) {
      lines.push(`$: s("${pattern}").bank("RolandTR909") // 드럼 (채널 10)`);
    } else {
      lines.push(
        `$: note("${pattern}")\n  .s("gm_epiano1")\n  .room(.5) // 채널 ${ch + 1}`
      );
    }
    lines.push('');
  }

  resultCode.value = lines.join('\n');
  trackInfo.textContent =
    `총 ${totalCycles} 사이클 · ${byChannel.size}개 채널 · setcpm으로 속도를 조절하세요 (예: setcpm(120/${beatsPerCycle}))`;
  resultWrap.style.display = 'block';
});

// 복사
copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(resultCode.value);
  copyBtn.textContent = '✓ 복사됨';
  setTimeout(() => (copyBtn.textContent = '복사'), 1500);
});
