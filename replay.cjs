"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { CHUNK_MS, TurnController, parseEvents } = require("./decision.js");
const args = process.argv.slice(2);
const usage = "用法：node replay.cjs [结果.jsonl] [speaking|listening] [2|3]";

if (args[0] === "--help") {
  console.log(usage);
} else {
  try {
    if (args.length > 3) throw new Error(usage);
    const [file = join(__dirname, "example.jsonl"), initial = "speaking", threshold = "2"] = args;
    const controller = new TurnController(initial, Number(threshold));
    const events = parseEvents(readFileSync(file, "utf8"));
    for (const [index, [sample, digit, turn]] of events.entries()) {
      const before = controller.mode;
      const result = controller.step(digit, turn);
      console.log(JSON.stringify({ ms: (index + 1) * CHUNK_MS, sample, digit, before, ...result, after: controller.mode }));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
