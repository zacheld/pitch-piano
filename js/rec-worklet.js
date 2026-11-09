// Audio worklet for recording: passes the microphone signal to the page in ~85 ms chunks.
class PPRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = true; this.buf = new Float32Array(4096); this.n = 0;
    this.port.onmessage = (e) => { if (e.data === 'stop') { this.flush(); this.on = false; } };
  }
  flush() { if (this.n) { this.port.postMessage(this.buf.slice(0, this.n)); this.n = 0; } }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (this.on && ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) this.flush();
      }
    }
    return this.on;
  }
}
registerProcessor('pp-recorder', PPRecorder);
