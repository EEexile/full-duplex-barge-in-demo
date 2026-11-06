"use strict";

(() => {
  const { CHUNK_MS, BACKCHANNEL, VALID, TurnController } = DuplexDecision;
  const get = (id) => document.getElementById(id);
  const ai = get("voice-ai");
  const user = get("voice-user");
  const button = get("audio-play");
  const status = get("audio-status");
  const log = get("audio-log");
  const timeline = get("audio-timeline");
  const clock = get("audio-time");
  const aiTrack = get("audio-track-ai");
  const userTrack = get("audio-track-user");
  const aiState = get("audio-state-ai");
  const userState = get("audio-state-user");
  const cut = get("audio-cut");
  const cues = [...get("audio-cues").children];
  const duration = 8000;
  const userClips = [[1920, 3600], [4800, 7500]];
  const chunks = [
    [10, BACKCHANNEL, "听到真人附和，继续播报"],
    [21, VALID, "听到用户发言，等下一块确认"],
    [22, VALID, "连续两块有效，停止播报"],
  ];
  let controller, next, frame, playing, pending, cutAt, phaseStatus, revision = 0;

  const progress = (ms) => `${Math.min(ms / duration, 1) * 100}%`;

  function draw(ms) {
    timeline.style.setProperty("--played", progress(ms));
    aiTrack.style.setProperty("--track-played", progress(cutAt ?? ms));
    const time = `${(Math.min(ms, duration) / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} 秒`;
    if (clock.textContent !== time) clock.textContent = time;
    const aiOn = playing && !ai.paused && cutAt === null;
    const userOn = playing && !user.paused &&
      userClips.some(([start, end]) => ms >= start && ms < end);
    aiTrack.toggleAttribute("data-active", aiOn);
    userTrack.toggleAttribute("data-active", userOn);
    const aiLabel = cutAt !== null ? "已停播" : aiOn ? "正在播报" : "合成语音";
    const userLabel = userOn ? "真人录音播放中" : "AliMeeting 真人语音";
    if (aiState.textContent !== aiLabel) aiState.textContent = aiLabel;
    if (userState.textContent !== userLabel) userState.textContent = userLabel;
  }

  function highlight(index) {
    cues.forEach((cue, i) => {
      if (i === index) cue.setAttribute("aria-current", "step");
      else cue.removeAttribute("aria-current");
    });
  }

  function pause() {
    revision++;
    playing = pending = false;
    cancelAnimationFrame(frame);
    ai.pause();
    user.pause();
    button.disabled = false;
    button.textContent = user.ended ? "重播示例" : user.currentTime ? "继续播放" : "播放示例";
    if (controller) draw(user.currentTime * 1000);
  }

  function reset() {
    pause();
    ai.currentTime = user.currentTime = 0;
    controller = new TurnController("speaking", 2);
    next = 0;
    cutAt = null;
    phaseStatus = "AI 正在播报";
    cut.hidden = true;
    highlight(0);
    button.textContent = "播放示例";
    status.textContent = "等待播放";
    log.replaceChildren();
    draw(0);
  }

  function tick() {
    const ms = user.currentTime * 1000;
    while (next < chunks.length && chunks[next][0] * CHUNK_MS <= ms) {
      const [chunk, digit, label] = chunks[next++];
      const result = controller.step(digit);
      phaseStatus = label;
      if (digit === BACKCHANNEL) highlight(1);
      if (result.action === "stop") {
        ai.pause();
        cutAt = chunk * CHUNK_MS;
        timeline.style.setProperty("--cut", progress(cutAt));
        cut.hidden = false;
        highlight(2);
        phaseStatus = "AI 已停播，用户可以继续说";
      }
      status.textContent = phaseStatus;
      const item = document.createElement("li");
      item.textContent = `${(chunk * CHUNK_MS / 1000).toFixed(2)} 秒 · ${label}`;
      log.append(item);
    }
    draw(ms);
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
      status.textContent = phaseStatus;
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
