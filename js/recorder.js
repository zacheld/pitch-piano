// Record and replay: captures the raw microphone signal (no compression, no codec) plus the pitch
// line, so a replay plays your voice back with the graph or staff redrawn in step with it.

const MAX_SECONDS = 120;

export class Recorder {
  constructor(ctx, dest) { this.ctx = ctx; this.dest = dest; this.ready = null; this.node = null; this.take = null; this.player = null; }

  async start(sourceNode) {
    if (!this.ready) this.ready = this.ctx.audioWorklet.addModule('js/rec-worklet.js');
    await this.ready;
    this.chunks = []; this.samples = 0; this.full = false;
    this.node = new AudioWorkletNode(this.ctx, 'pp-recorder');
    const mute = this.ctx.createGain(); mute.gain.value = 0; // keeps the worklet running; makes no sound
    this.mute = mute;
    sourceNode.connect(this.node); this.node.connect(mute).connect(this.ctx.destination);
    this.source = sourceNode;
    this.node.port.onmessage = (e) => {
      if (this.full) return;
      this.chunks.push(e.data); this.samples += e.data.length;
      if (this.samples >= MAX_SECONDS * this.ctx.sampleRate) { this.full = true; if (this.onFull) this.onFull(); }
    };
    this.startedAt = this.ctx.currentTime;
  }

  get recording() { return !!this.node; }
  get seconds() { return this.node ? this.ctx.currentTime - this.startedAt : 0; }

  /** Stop recording; returns { buffer, seconds } (also kept as this.take). */
  async stop() {
    if (!this.node) return this.take;
    this.node.port.postMessage('stop');
    await new Promise((r) => setTimeout(r, 120)); // let the last chunk arrive
    try { this.source.disconnect(this.node); } catch (e) { /* source already gone */ }
    this.node.disconnect(); this.mute.disconnect();
    this.node = null;
    if (!this.samples) return null;
    const buffer = this.ctx.createBuffer(1, this.samples, this.ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    let o = 0;
    for (const c of this.chunks) { ch.set(c, o); o += c.length; }
    this.chunks = [];
    this.take = { buffer, seconds: buffer.duration };
    return this.take;
  }

  /** Play the last take; onEnd fires when it finishes or is stopped. Returns the start time. */
  play(onEnd) {
    if (!this.take) return null;
    this.stopPlaying();
    const src = this.ctx.createBufferSource();
    src.buffer = this.take.buffer;
    const amp = this.ctx.createGain(); amp.gain.value = 1.6; // mic recordings are quiet next to the piano
    src.connect(amp).connect(this.dest);
    const at = this.ctx.currentTime + 0.05;
    src.start(at);
    src.onended = () => { if (this.player && this.player.src === src) { this.player = null; if (onEnd) onEnd(); } };
    this.player = { src, at };
    return at;
  }
  get playing() { return !!this.player; }
  get playPosition() { return this.player ? this.ctx.currentTime - this.player.at : 0; }
  stopPlaying() {
    if (!this.player) return;
    const p = this.player; this.player = null;
    try { p.src.stop(); } catch (e) { /* not started */ }
  }
}
