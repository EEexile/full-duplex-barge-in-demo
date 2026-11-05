"use strict";

const DuplexDecision = (() => {
  const INVALID = 0;
  const BACKCHANNEL = 1;
  const VALID = 2;
  const INTERRUPT = 3;
  const CHUNK_MS = 240;
  const turnResults = ["complete", "incomplete", "invalid"];

  function parseEvents(source) {
    const events = [];
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (!Array.isArray(row) || row.length < 2 || row.length > 3) throw new Error();
        const [sample, digit, turn] = row;
        const validDigit = digit === null || (Number.isInteger(digit) && digit >= INVALID && digit <= INTERRUPT);
        if (typeof sample !== "string" || !sample.trim() || !validDigit || (turn != null && !turnResults.includes(turn))) {
          throw new Error();
        }
        events.push(row);
      } catch {
        throw new Error(`第 ${index + 1} 行格式有误。请填 ["说明", 0～3 或 null, 可选的 TurnSense 结果]。`);
      }
    }
    if (events.length === 0) throw new Error("至少输入一块分类结果。");
    return events;
  }

  class TurnController {
    constructor(mode = "speaking", threshold = 2) {
      if (mode !== "speaking" && mode !== "listening") throw new Error("起始状态必须是 speaking 或 listening。");
      if (threshold !== 2 && threshold !== 3) throw new Error("连续有效次数必须是 2 或 3。");
      this.mode = mode;
      this.threshold = threshold;
      this.consecutive = 0;
    }

    step(digit, turn) {
      if (digit === null) {
        this.consecutive = 0;
        return { action: "vad_inactive" };
      }
      if (this.mode === "speaking") {
        this.consecutive = digit === VALID ? this.consecutive + 1 : 0;
        if (digit === INTERRUPT || this.consecutive >= this.threshold) {
          const reason = digit === INTERRUPT ? "explicit" : "confirmed";
          this.mode = "listening";
          this.consecutive = 0;
          return { action: "stop", reason };
        }
        return { action: "continue" };
      }
      if (digit === INVALID) return { action: "ignore_audio", binary: "invalid" };
      if (turn === "complete") {
        this.mode = "speaking";
        return { action: "reply", binary: "valid", turn };
      }
      return { action: turn === "invalid" ? "ignore_turn" : "wait", binary: "valid", turn: turn ?? null };
    }
  }

  return { INVALID, BACKCHANNEL, VALID, INTERRUPT, CHUNK_MS, parseEvents, TurnController };
})();

if (typeof module !== "undefined") module.exports = DuplexDecision;
