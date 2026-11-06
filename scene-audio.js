"use strict";

(() => {
  const { CHUNK_MS, BACKCHANNEL, VALID, TurnController } = DuplexDecision;
  const get = (id) => document.getElementById(id);
  const ai = get("voice-ai");
  const user = get("voice-user");
  const button = get("audio-play");
  const status = get("audio-status");
  const log = get("audio-log");
  const chunks = [
    [10, BACKCHANNEL, "听到真人附和，继续播报"],
    [21, VALID, "听到用户发言，等下一块确认"],
    [22, VALID, "连续两块有效，停止播报"],
  ];
  let controller, next, frame, playing, pending, revision = 0;

  function pause() {
    revision++;
    playing = pending = false;
    cancelAnimationFrame(frame);
    ai.pause();
    user.pause();
    button.disabled = false;
    button.textContent = user.ended ? "重播示例" : user.currentTime ? "继续播放" : "播放示例";
  }

  function reset() {
    pause();
    ai.currentTime = user.currentTime = 0;
    controller = new TurnController("speaking", 2);
    next = 0;
    button.textContent = "播放示例";
    status.textContent = "等待播放";
    log.replaceChildren();
  }

  function tick() {
    const ms = user.currentTime * 1000;
    while (next < chunks.length && chunks[next][0] * CHUNK_MS <= ms) {
      const [chunk, digit, label] = chunks[next++];
      const result = controller.step(digit);
      if (result.action === "stop") {
        ai.pause();
        status.textContent = "AI 已停播，用户可以继续说";
      }
      const item = document.createElement("li");
      item.textContent = `${(chunk * CHUNK_MS / 1000).toFixed(2)} 秒 · ${label}`;
      log.append(item);
    }
    if (playing) frame = requestAnimationFrame(tick);
  }

  function fail() {
    pause();
    status.textContent = "音频没能播放，请刷新页面重试。";
  }

  button.addEventListener("click", async () => {
    if (pending) return;
    if (playing) {
      pause();
      status.textContent = "已暂停";
      return;
    }
    if (user.ended) reset();
    const attempt = ++revision;
    pending = button.disabled = true;
    try {
      const speak = controller.mode === "speaking";
      if (speak) ai.currentTime = user.currentTime;
      await Promise.all([user.play(), speak ? ai.play() : Promise.resolve()]);
      if (attempt !== revision) return;
      pending = button.disabled = false;
      playing = true;
      button.textContent = "暂停";
      status.textContent = speak ? "AI 正在播报" : "AI 已停播，用户可以继续说";
      tick();
    } catch {
      if (attempt === revision) fail();
    }
  });

  user.addEventListener("ended", () => {
    pause();
    tick();
    status.textContent = "播放结束";
  });
  user.addEventListener("error", fail);
  ai.addEventListener("error", fail);
  get("audio-reset").addEventListener("click", reset);
  reset();
})();
