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
      } else if (type === 0xc0) {
        // 프로그램 변경 (악기 전환)
        const program = bytes[pos++];
        events.push({ tick, kind: 'program', program, channel });
      } else if (type === 0xd0) {
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

// General MIDI 프로그램 → strudel gm_ 사운드 매핑 (대표 항목)
const GM_SOUNDS = [
  'gm_piano', 'gm_piano', 'gm_piano', 'gm_epiano1', 'gm_epiano2', 'gm_harpsichord', 'gm_clavinet',
  'gm_celesta', 'gm_glockenspiel', 'gm_music_box', 'gm_vibraphone', 'gm_marimba', 'gm_xylophone',
  'gm_tubular_bells', 'gm_dulcimer', 'gm_drawbar_organ', 'gm_percussive_organ', 'gm_rock_organ',
  'gm_church_organ', 'gm_reed_organ', 'gm_accordion', 'gm_harmonica', 'gm_tango_accordion',
  'gm_nylon_guitar', 'gm_steel_guitar', 'gm_jazz_guitar', 'gm_clean_guitar', 'gm_muted_guitar',
  'gm_overdrive_guitar', 'gm_distortion_guitar', 'gm_harmonics_guitar',
  'gm_acoustic_bass', 'gm_finger_bass', 'gm_pick_bass', 'gm_fretless_bass', 'gm_slap_bass_1',
  'gm_slap_bass_2', 'gm_synth_bass_1', 'gm_synth_bass_2',
  'gm_violin', 'gm_viola', 'gm_cello', 'gm_contrabass', 'gm_tremolo_strings', 'gm_pizzicato_strings',
  'gm_orchestral_harp', 'gm_timpani', 'gm_strings', 'gm_strings_2', 'gm_synth_strings_1',
  'gm_synth_strings_2', 'gm_choir_aahs', 'gm_voice_oohs', 'gm_synth_voice', 'gm_orchestra_hit',
  'gm_trumpet', 'gm_trombone', 'gm_tuba', 'gm_muted_trumpet', 'gm_french_horn', 'gm_brass_section',
  'gm_synth_brass_1', 'gm_synth_brass_2', 'gm_soprano_sax', 'gm_alto_sax', 'gm_tenor_sax',
  'gm_baritone_sax', 'gm_oboe', 'gm_english_horn', 'gm_bassoon', 'gm_clarinet',
  'gm_piccolo', 'gm_flute', 'gm_recorder', 'gm_pan_flute', 'gm_blown_bottle', 'gm_shakuhachi',
  'gm_whistle', 'gm_ocarina', 'gm_lead_1_square', 'gm_lead_2_sawtooth', 'gm_lead_3_calliope',
  'gm_lead_4_chiff', 'gm_lead_5_charang', 'gm_lead_6_voice', 'gm_lead_7_fifths', 'gm_lead_8_bass',
  'gm_pad_1_new_age', 'gm_pad_2_warm', 'gm_pad_3_polysynth', 'gm_pad_4_choir', 'gm_pad_5_bowed',
  'gm_pad_6_metallic', 'gm_pad_7_halo', 'gm_pad_8_sweep', 'gm_fx_1_rain', 'gm_fx_2_soundtrack',
  'gm_fx_3_crystal', 'gm_fx_4_atmosphere', 'gm_fx_5_brightness', 'gm_fx_6_goblins', 'gm_fx_7_echoes',
  'gm_fx_8_scifi', 'gm_sitar', 'gm_banjo', 'gm_shamisen', 'gm_koto', 'gm_kalimba', 'gm_bagpipe',
  'gm_fiddle', 'gm_shanai', 'gm_tinkle_bell', 'gm_agogo', 'gm_steel_drums', 'gm_woodblock',
  'gm_taiko_drum', 'gm_melodic_tom', 'gm_synth_drum', 'gm_reverse_cymbal',
  'gm_guitar_fret_noise', 'gm_breath_noise', 'gm_seashore', 'gm_bird_tweet', 'gm_telephone_ring',
  'gm_helicopter', 'gm_applause', 'gm_gunshot',
];
function gmSoundForProgram(prog) {
  return GM_SOUNDS[prog] || 'gm_piano';
}

// 트랙의 프로그램 변경 이벤트 찾기
function programForTrack(track) {
  for (const ev of track.events) {
    if (ev.kind === 'program') return ev.program;
  }
  return 0;
}

// ===== 변환 =====
convertBtn.addEventListener('click', () => {
  if (!midiData) return;
  const beatsPerCycle = parseInt(document.getElementById('beatsPerCycle').value) || 4;
  const barLimit = parseInt(document.getElementById('barLimit').value) || 0;
  const bpm = parseInt(document.getElementById('bpm').value) || 120;
  const useGM = document.getElementById('useGM').checked;
  const singleSound = document.getElementById('singleSound').checked;
  const soundName = document.getElementById('soundName').value.trim() || 'gm_epiano1';
  const singleLine = document.getElementById('singleLine').checked;
  const useDurations = document.getElementById('useDurations').checked;
  const useVelocity = document.getElementById('useVelocity').checked;

  const tpb = midiData.ticksPerBeat;
  const ticksPerCycle = tpb * beatsPerCycle;

  // 채널별로 그룹화 (드럼 채널 9는 별도) + 트랙별 프로그램 기록
  const byChannel = new Map(); // ch → { notes, program }
  let maxTick = 0;
  for (const tr of midiData.tracks) {
    const prog = programForTrack(tr);
    for (const n of extractNotes(tr)) {
      if (!byChannel.has(n.channel)) byChannel.set(n.channel, { notes: [], program: prog });
      const entry = byChannel.get(n.channel);
      entry.notes.push(n);
      if (prog) entry.program = prog;
      maxTick = Math.max(maxTick, n.tick + n.dur);
    }
  }

  let totalCycles = Math.ceil(maxTick / ticksPerCycle);
  if (barLimit > 0) totalCycles = Math.min(totalCycles, barLimit);
  const lines = [`// MIDI 변환 결과 · ${totalCycles} 사이클`, `setcpm(${bpm}/${beatsPerCycle})`, ''];

  const drumNames = ['bd', 'sd', 'hh', 'cp', 'lt', 'mt', 'ht', 'crash'];
  for (const [ch, { notes, program }] of [...byChannel.entries()].sort((a, b) => a[0] - b[0])) {
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

    // 미니노테이션 생성
    const parts = [];
    cycles.forEach((cnotes) => {
      if (!cnotes.length) return;
      const items = cnotes
        .sort((a, b) => a.offset - b.offset)
        .map((n) => {
          let name = isDrum
            ? drumNames[Math.min(Math.floor(n.note / 8), drumNames.length - 1)] || 'hh'
            : midiToName(n.note);
          // 노트 길이 반영: 사이클의 1/8 이상이면 @로 늘림
          if (useDurations && !isDrum) {
            const durCycles = n.dur / ticksPerCycle;
            if (durCycles >= 0.125) {
              const steps = Math.round(durCycles * 8);
              if (steps > 1) name += '@' + (steps / 8).toFixed(2).replace(/\.?0+$/, '');
            }
          }
          return name;
        })
        .join(' ');
      parts.push(`<${items}>`);
    });

    if (!parts.length) continue;
    const pattern = parts.join(singleLine ? ' ' : ' ');

    if (isDrum) {
      lines.push(`$: s("${pattern}").bank("RolandTR909") // 드럼 (채널 10)`);
    } else {
      const sound = singleSound ? soundName : (useGM ? gmSoundForProgram(program) : soundName);
      let chain = `$: note("${pattern}")\n  .s("${sound}")`;
      if (useVelocity) {
        const vels = notes.map(n => n.vel).filter(v => v > 0);
        const avg = vels.length ? (vels.reduce((a, b) => a + b, 0) / vels.length / 127).toFixed(2) : '0.8';
        chain += `\n  .gain(${avg})`;
      }
      chain += `\n  .room(.5) // 채널 ${ch + 1}${useGM && !singleSound ? ' · ' + gmSoundForProgram(program) : ''}`;
      lines.push(chain);
    }
    lines.push('');
  }

  resultCode.value = lines.join('\n');
  trackInfo.textContent =
    `총 ${totalCycles} 사이클 · ${byChannel.size}개 채널 · BPM ${bpm} (setcpm(${bpm}/${beatsPerCycle}))`;
  resultWrap.style.display = 'block';
});

// 단일 사운드 체크박스 → 사운드 이름 입력 표시 토글
document.getElementById('singleSound').addEventListener('change', (e) => {
  document.getElementById('soundNameWrap').style.display = e.target.checked ? 'flex' : 'none';
});

// 복사
copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(resultCode.value);
  copyBtn.textContent = '✓ 복사됨';
  setTimeout(() => (copyBtn.textContent = '복사'), 1500);
});
