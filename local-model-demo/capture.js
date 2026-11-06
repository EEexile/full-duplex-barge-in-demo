class CallAudio extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSize = options.processorOptions.chunkSize;
    this.block = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    for (let start = 0; start < input.length;) {
      const length = Math.min(input.length - start, this.block.length - this.offset);
      this.block.set(input.subarray(start, start + length), this.offset);
      start += length;
      this.offset += length;
      if (this.offset === this.block.length) {
        this.port.postMessage(this.block.buffer, [this.block.buffer]);
        this.block = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("call-audio", CallAudio);
