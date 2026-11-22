# 기술 효과음 만들기 — pret/pokeemerald (https://github.com/pret/pokeemerald) 의 기술 효과음 MIDI (sound/songs/midi/se_m_*.mid)
# 를 그 악기 묶음 (sound/voicegroups/rs_sfx_2.inc) 대로 소리로 만듦 · 『포켓몬스터 에메랄드』 원작 순서 · GBA 음원을 흉내 낸 합성
#   직접 음 (directsound) = 원작 샘플 (sound/direct_sound_samples/*.wav) · 사각파 · 잡음 = GB 소리 회로 흉내
# 쓰는 법: python3 make_move_se.py <내려받은 폴더 (mid/ · wav/ · rs_sfx_2.inc)> <출력 폴더> [이름 …]
#   내려받기: README 의 「기술 효과음」 참고 · ffmpeg · mido 필요
import sys, os, re, struct, math, subprocess
import numpy as np, mido

SR = 32768
FR = 1 / 59.7275            # GBA 화면 한 장 (엔벨로프 · LFO 는 이 단위로 돎)

def read_wav(p):
    b = open(p, 'rb').read(); i = 12; rate = 0; data = b''; loop = None; agbp = None
    while i < len(b) - 8:
        cid = b[i:i+4]; sz = struct.unpack('<I', b[i+4:i+8])[0]; d = b[i+8:i+8+sz]
        if cid == b'fmt ': rate = struct.unpack('<I', d[4:8])[0]
        elif cid == b'data': data = d
        elif cid == b'agbp': agbp = struct.unpack('<I', d[:4])[0] / 1024
        elif cid == b'smpl':
            n = struct.unpack('<I', d[28:32])[0]
            if n: s, e = struct.unpack('<II', d[44:52]); loop = (s, e)
        i += 8 + sz + (sz & 1)
    x = (np.frombuffer(data, np.uint8).astype(np.float32) - 128) / 128
    return x, (agbp or rate), loop

def parse_vg(p):
    vs = []
    for l in open(p, encoding='utf-8'):
        l = l.split('@')[0].strip()
        if not l.startswith('voice_') or l.startswith('voice_group'): continue
        kind, args = l.split(None, 1); vs.append((kind, [a.strip() for a in args.split(',')]))
    return vs

DUTY = [0.125, 0.25, 0.5, 0.75]

def cgb_env(n_on, n_tot, a, d, s, r, peak):
    # GB 엔벨로프 (0~15 단계 · 화면 장 단위) → 표본마다 크기
    fr_on = n_on / SR / FR; fr_tot = n_tot / SR / FR; out = []; lv = 0.0 if a else 15.0; st = 'a' if a else 'd'; t = 0; f = 0
    nf = int(fr_tot) + 2; env = np.zeros(nf)
    for f in range(nf):
        if f >= fr_on and st != 'r': st = 'r'; t = 0
        if st == 'a':
            t += 1
            if t >= a: t = 0; lv += 1
            if lv >= 15: lv = 15; st = 'd'
        elif st == 'd':
            if d == 0 or lv <= s: lv = max(lv, s) if d else lv; st = 's'
            else:
                t += 1
                if t >= d: t = 0; lv -= 1
        elif st == 'r':
            if r == 0: lv = 0
            else:
                t += 1
                if t >= r: t = 0; lv -= 1
            lv = max(lv, 0)
        env[f] = lv
    idx = np.minimum((np.arange(n_tot) / SR / FR).astype(int), nf - 1)
    return env[idx] / 15 * peak

def ds_env(n_on, n_tot, a, d, s, r):
    nf = int(n_tot / SR / FR) + 2; env = np.zeros(nf); lv = 0.0; st = 'a'; fr_on = n_on / SR / FR
    for f in range(nf):
        if f >= fr_on and st != 'r': st = 'r'
        if st == 'a':
            lv += a
            if lv >= 255: lv = 255; st = 'd'
        elif st == 'd':
            lv = lv * d / 256
            if lv <= s: lv = s; st = 's'
        elif st == 'r':
            lv = lv * r / 256
            if lv < 1: lv = 0
        env[f] = lv
    idx = np.minimum((np.arange(n_tot) / SR / FR).astype(int), nf - 1)
    return env[idx] / 255

def render(midp, vg, wavs):
    m = mido.MidiFile(midp); tpb = m.ticks_per_beat
    # 박자 바꿈 (보통 첫 트랙에 있음)
    tempos = [(0, 500000)]
    for tr in m.tracks:
        t = 0
        for e in tr:
            t += e.time
            if e.type == 'set_tempo': tempos.append((t, e.tempo))
    tempos.sort()
    def sec(tick):
        s = 0.0; lt, tp = 0, 500000
        for tt, tq in tempos:
            if tt > tick: break
            s += (tt - lt) * tp / tpb / 1e6; lt, tp = tt, tq
        return s + (tick - lt) * tp / tpb / 1e6
    notes = []
    for tr in m.tracks:
        st = dict(prog=0, vol=100, pan=64, bend=0, br=2, mod=0, lfos=22, modt=0, lfodl=0, tune=0)
        ctl = []   # (초, 상태 사본)
        t = 0; on = {}
        for e in tr:
            t += e.time; ts = sec(t)
            if e.type == 'program_change': st['prog'] = e.program
            elif e.type == 'control_change':
                k = {7: 'vol', 10: 'pan', 20: 'br', 1: 'mod', 21: 'lfos', 22: 'modt', 26: 'lfodl', 24: 'tune'}.get(e.control)
                if k: st[k] = e.value
            elif e.type == 'pitchwheel': st['bend'] = e.pitch
            ctl.append((ts, dict(st)))
            if e.type == 'note_on' and e.velocity > 0:
                on[e.note] = (ts, e.velocity, dict(st), len(ctl) - 1)
            elif e.type in ('note_off', 'note_on') and e.note in on:
                t0, vel, s0, ci = on.pop(e.note); notes.append((t0, ts, e.note, vel, s0, ctl, ci))
    if not notes: return np.zeros((1, 2))
    end = max(n[1] for n in notes) + 1.2
    L = int(end * SR); out = np.zeros((L, 2), np.float32)
    for t0, t1, key, vel, s0, ctl, ci in notes:
        kind, a = vg[s0['prog']] if s0['prog'] < len(vg) else vg[0]
        n0 = int(t0 * SR); non = max(1, int((t1 - t0) * SR)); ntot = min(L - n0, non + int(1.0 * SR))
        if ntot <= 0: continue
        tt = np.arange(ntot) / SR
        # 시간마다 조절값 (음높이 휨 · 크기 · 좌우)
        bend = np.zeros(ntot); vol = np.zeros(ntot); pan = np.zeros(ntot); mod = np.zeros(ntot); lfos = np.zeros(ntot); modt = np.zeros(ntot)
        seg = [(ts - t0, s) for ts, s in ctl[ci:] if ts - t0 <= ntot / SR]
        for j, (ts, s) in enumerate(seg):
            i0 = max(0, int(ts * SR)); i1 = int(seg[j + 1][0] * SR) if j + 1 < len(seg) else ntot
            bend[i0:i1] = s['bend'] / 8192 * s['br'] + (s['tune'] - 64) / 64 if s['tune'] else s['bend'] / 8192 * s['br']
            vol[i0:i1] = s['vol']; pan[i0:i1] = s['pan']; mod[i0:i1] = s['mod']; lfos[i0:i1] = s['lfos']; modt[i0:i1] = s['modt']
        # LFO (삼각파 · 화면 장마다 lfos 씩 · 256 이 한 바퀴)
        ph = np.cumsum(lfos / 256 * (1 / FR) / SR) * 1.0
        tri = 1 - 4 * np.abs((ph % 1) - 0.5)
        dl = s0['lfodl'] * FR; lf = np.where(tt >= dl, tri, 0) * mod
        pitch_mod = np.where(modt == 0, lf / 16, 0)
        amp_mod = np.where(modt == 1, 1 - np.abs(lf) / 128, 1)
        semis = key - int(a[0]) + bend + pitch_mod
        gain = vel / 127 * vol / 127 * amp_mod
        if kind.startswith('voice_directsound'):
            x, rate, loop = wavs[a[2].replace('DirectSoundWaveData_', '')]
            if kind.endswith('reverse'): x = x[::-1]; loop = None
            step = rate / SR * (np.ones(ntot) if 'no_resample' in kind else 2 ** (semis / 12))
            pos = np.cumsum(step) - step[0]
            if loop and loop[1] > loop[0]:
                ls, le = loop; over = pos >= le
                pos = np.where(over, ls + (pos - ls) % (le - ls), pos)
            ok = pos < len(x) - 1
            pi = np.minimum(pos.astype(int), len(x) - 2); fr = pos - pi
            y = (x[pi] * (1 - fr) + x[pi + 1] * fr) * ok
            env = ds_env(non, ntot, int(a[3]), int(a[4]), int(a[5]), int(a[6]))
            y = y * env * gain * 0.9
        elif kind.startswith('voice_square') or kind.startswith('voice_programmable'):
            if kind.startswith('voice_square_1'): sweep, duty, ad = int(a[2]), int(a[3]), a[4:8]
            else: sweep, duty, ad = 0, int(a[2]), a[3:7]
            f = 440 * 2 ** ((key + bend + pitch_mod - 69) / 12)
            if sweep & 0x70 and sweep & 7:
                # GB 소리1 쓸기: (sweep 시간/128 초) 마다 주기값 x 를 x>>shift 만큼 바꿈
                per = ((sweep >> 4) & 7) / 128; sh = sweep & 7; dn = sweep & 8
                xg = 2048 - 131072 / f[0]; fs = np.empty(ntot); k = 0
                for i in range(0, ntot, int(per * SR) or 1):
                    fs[i:i + int(per * SR)] = 131072 / max(1, 2048 - xg)
                    xg = xg - (int(xg) >> sh) if dn else xg + (int(xg) >> sh)
                    if xg >= 2047: fs[i:] = 0; break
                f = fs * 2 ** ((bend + pitch_mod) / 12)
            ph = np.cumsum(f / SR)
            y = np.where((ph % 1) < DUTY[duty & 3], 1.0, -1.0) * (f > 0)
            env = cgb_env(non, ntot, *[int(v) for v in ad], peak=1.0)
            y = y * env * gain * 0.35
        elif kind.startswith('voice_noise'):
            period, ad = int(a[2]), a[3:7]
            clk = np.minimum(524288, 4096 * 2 ** ((key + bend - 48) / 12))
            ph = np.cumsum(clk / SR); steps = int(ph[-1]) + 2
            nbits = 7 if period else 15; lfsr = (1 << nbits) - 1; seq = np.empty(steps, np.float32)
            for i in range(steps):
                b = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (b << (nbits - 1)); seq[i] = 1.0 if lfsr & 1 else -1.0
            y = seq[ph.astype(int)]
            env = cgb_env(non, ntot, *[int(v) for v in ad], peak=1.0)
            y = y * env * gain * 0.3
        else:
            continue
        pl = np.clip((pan - 64) / 64, -1, 1)
        out[n0:n0 + ntot, 0] += y * np.sqrt((1 - pl) / 2) * 1.2
        out[n0:n0 + ntot, 1] += y * np.sqrt((1 + pl) / 2) * 1.2
    # 울림 (-R50 · 짧은 메아리)
    dly = int(0.07 * SR); rv = out.copy()
    for k in range(1, 4): rv[dly * k:] += out[:-dly * k] * (0.18 / k)
    out = rv
    # 끝의 조용한 부분 자르기
    lvl = np.abs(out).max(1); nz = np.nonzero(lvl > 0.003)[0]
    out = out[: (nz[-1] + int(0.05 * SR)) if len(nz) else 1]
    pk = np.abs(out).max()
    if pk > 0.98: out *= 0.98 / pk
    return out

def main():
    src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True)
    vg = parse_vg(os.path.join(src, 'rs_sfx_2.inc'))
    wavs = {}
    for kind, a in vg:
        if kind.startswith('voice_directsound'):
            nm = a[2].replace('DirectSoundWaveData_', '')
            if nm not in wavs: wavs[nm] = read_wav(os.path.join(src, 'wav', nm + '.wav'))
    names = sys.argv[3:] or sorted(f[5:-4] for f in os.listdir(os.path.join(src, 'mid')) if f.startswith('se_m_'))
    for nm in names:
        y = render(os.path.join(src, 'mid', f'se_m_{nm}.mid'), vg, wavs)
        pcm = (np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', '-ar', '44100', '-b:a', '96k',
                        os.path.join(dst, f'{nm}.mp3')], input=pcm, check=True)
        print(nm, f'{len(y) / SR:.2f}s')

if __name__ == '__main__':
    main()
