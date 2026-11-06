"use strict";
const el = (id) => document.getElementById(id);
const speaker = el("speaker");
const sampleButtons = [...document.querySelectorAll("[data-sample]")];
const classNames = {invalid: "无效", backchannel: "附和", valid: "有效发言"};
const turnNames = {complete: "完整", incomplete: "未完整，继续等", invalid: "无效"};
const lines = {
  greeting: "您好，这里是预约服务。您预约的是今天下午三点。到店后，请到前台报一下您的姓名。如果时间有变，也可以在这通电话里告诉我，我来帮您查看可改约的时间。",
  reply: "好的，我听到了。我先帮您查看可改约的时间，请稍等。"
};
let call;

for (let i = 0; i < 19; i++) {
  const bar = document.createElement("i");
  bar.style.setProperty("--i", i);
  bar.style.setProperty("--height", (5 + (i * 11) % 29) + "px");
  el("wave").append(bar);
}

function time() {
  const seconds = Math.floor((performance.now() - call.started) / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
}

function log(message, kind) {
  const row = document.createElement("li");
  const stamp = document.createElement("time");
  const text = document.createElement("span");
  stamp.textContent = time();
  text.textContent = message;
  if (kind) row.dataset.kind = kind;
  row.append(stamp, text);
  el("events").append(row);
  if (el("events").children.length > 80) el("events").firstElementChild.remove();
  el("events").scrollTop = el("events").scrollHeight;
}

function status(phase, label) {
  el("orb").dataset.phase = phase;
  el("call-state").textContent = label;
}

function hangUp(message = "通话已结束") {
  if (!call) return;
  const state = call;
  call = undefined;
  clearInterval(state.clock);
  state.ws?.close();
  state.stream?.getTracks().forEach(track => track.stop());
  state.context?.close();
  speaker.pause();
  status("idle", message);
  el("input-state").textContent = "未接通";
  el("samples").hidden = true;
  sampleButtons.forEach(button => { button.disabled = false; });
  el("sample-mode").hidden = false;
  el("call").classList.remove("active");
  el("call").textContent = "再次接通";
}

function speak(name) {
  const state = call;
  state.playbackId = ++state.nextPlaybackId;
  speaker.src = "/asset/" + name + ".m4a";
  const item = document.createElement("li");
  item.textContent = lines[name];
  el("transcript").append(item);
  status("playing", "AI 正在说");
  speaker.play().catch(() => {
    if (call === state) hangUp("浏览器无法播放音频");
  });
}

function decision(result) {
  el("vad").textContent = result.vad ? "已检测到语音" : "未检测到语音";
  el("classification").textContent = result.validity ? "—" : classNames[result.label];
  if (result.label !== call.previousClass && result.label !== "invalid") {
    log(classNames[result.label] + " · " + result.model_ms + " ms");
  }
  call.previousClass = result.label;
  if (result.validity) {
    el("validity").textContent = result.validity === "valid" ? "有效" : "无效";
    if (!call.playbackId && !result.turn) {
      status(result.validity === "valid" ? "hearing" : "listening", result.validity === "valid" ? "你正在说" : "AI 正在听");
    }
  }
  if (result.turn) {
    el("turn-state").textContent = turnNames[result.turn];
    log("TurnSense：" + turnNames[result.turn]);
  }
  if (result.action === "reply" && !call.playbackId) {
    log("AI 接话");
    speak("reply");
  } else if (result.playback_id === call.playbackId && call.playbackId) {
    if (result.action === "stop") {
      call.playbackId = 0;
      speaker.pause();
      status("hearing", "已停播，继续听你说");
      log("连续有效发言 · 已停播", "stop");

    }
  }
}

async function begin(samples) {
  if (call) return;
  const state = {started: performance.now(), playbackId: 0, nextPlaybackId: 0, pending: 0};
  call = state;
  el("events").replaceChildren();
  el("transcript").replaceChildren();
  for (const id of ["vad", "classification", "validity", "turn-state"]) el(id).textContent = "—";
  el("elapsed").textContent = "00:00";
  state.clock = setInterval(() => { el("elapsed").textContent = time(); }, 250);
  el("call").classList.add("active");
  el("call").textContent = "挂断";
  el("sample-mode").hidden = true;
  el("input-state").textContent = "连接中";
  status("idle", "正在接通");
  try {
    const context = new AudioContext({sampleRate: 16000});
    state.context = context;
    await context.resume();
    if (!samples) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}
      });
      if (call !== state) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      state.stream = stream;
    }
    await context.audioWorklet.addModule("/asset/capture.js");
    if (call !== state) return;
    const ws = new WebSocket(new URL("/audio", location.href.replace(/^http/, "ws")));
    state.ws = ws;
    ws.onclose = () => { if (call === state) hangUp("模型连接已断开"); };
    ws.onmessage = ({data}) => {
      if (call !== state) return;
      const result = JSON.parse(data);
      if (result.type === "error") hangUp(result.message);
      if (result.type === "decision") {
        state.pending--;
        decision(result);
      }
      if (result.type !== "ready") return;
      const node = new AudioWorkletNode(context, "call-audio", {
        channelCount: 1, channelCountMode: "explicit",
        processorOptions: {chunkSize: result.chunk_ms * 16}
      });
      state.node = node;
      node.connect(context.destination); // Worklet output is silence.
      node.port.onmessage = ({data}) => {
        if (call !== state || ws.readyState !== WebSocket.OPEN) return;
        if (state.pending >= 8) {
          hangUp("模型处理超时，请重新接通");
          return;
        }
        const packet = new Uint8Array(4 + data.byteLength);
        new DataView(packet.buffer).setUint32(0, state.playbackId, true);
        if (state.sample) {
          const sample = state.sample;
          if (sample.offset === 0) sample.source.start();
          const output = new Float32Array(packet.buffer, 4);
          const chunk = sample.pcm.subarray(sample.offset, sample.offset + output.length);
          output.set(chunk);
          sample.offset += chunk.length;
          if (sample.offset === sample.pcm.length) state.sample = undefined;
        } else {
          packet.set(new Uint8Array(data), 4);
        }
        ws.send(packet);
        state.pending++;
      };
      if (samples) {
        const silence = new ConstantSourceNode(context, {offset: 0});
        silence.connect(node);
        silence.start();
        state.silence = silence;
        el("samples").hidden = false;
      } else {
        context.createMediaStreamSource(state.stream).connect(node);
      }
      el("input-state").textContent = samples ? "录音 · 实时推理" : "麦克风已接通";
      log("已接通");
      speak("greeting");
    };
  } catch (error) {
    if (call === state) hangUp(error.name === "NotAllowedError" ? "请允许麦克风访问" : "音频初始化失败");
  }
}

async function playSample(kind) {
  const state = call;
  if (!state?.node || state.samplePlaying) return;
  state.samplePlaying = true;
  sampleButtons.forEach(button => { button.disabled = true; });
  function finish() {
    if (call !== state) return;
    state.samplePlaying = false;
    sampleButtons.forEach(button => { button.disabled = false; });
  }
  try {
    const response = await fetch("/pcm/" + kind);
    if (!response.ok) throw new Error("Sample unavailable");
    const pcm = new Float32Array(await response.arrayBuffer());
    if (call !== state) return;
    const audio = state.context.createBuffer(1, pcm.length, 16000);
    audio.copyToChannel(pcm, 0);
    const source = new AudioBufferSourceNode(state.context, {buffer: audio});
    const volume = new GainNode(state.context, {gain: 0.65});
    source.connect(volume).connect(state.context.destination);
    source.onended = finish;
    state.sample = {source, pcm, offset: 0};
    log("播放" + sampleButtons.find(button => button.dataset.sample === kind).textContent.slice(2));
  } catch {
    finish();
    if (call === state) log("录音加载失败");
  }
}

speaker.addEventListener("ended", () => {
  if (!call) return;
  call.playbackId = 0;
  status("listening", "AI 正在听");
  log("播报结束");
});
el("call").addEventListener("click", () => { if (call) hangUp(); else begin(false); });
el("sample-mode").addEventListener("click", () => begin(true));
sampleButtons.forEach(button => button.addEventListener("click", () => playSample(button.dataset.sample)));
window.addEventListener("pagehide", () => hangUp());
