// Shared admin alert tones (WebAudio, no assets).

function tone(freq: number, delayMs: number, durMs: number, vol: number) {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime + delayMs / 1000;
    o.start(t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);
    o.stop(t0 + durMs / 1000 + 0.05);
  } catch {}
}

export function playOrderPing() {
  tone(880, 0, 500, 0.14);
  tone(1320, 180, 300, 0.1);
}

export function playSoftTick() {
  tone(660, 0, 150, 0.07);
}
