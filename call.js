"use strict";

const speech = [
  ["call-greeting.m4a", "您好，我是预约助手。您约的是今天下午三点。到店以后，在前台报一下手机尾号。过号的话，我们可以帮您重新排队。"],
  ["call-reply.m4a", "好，我听清楚了。那我先帮您看看新的时间还有没有空位。"]
];
const recognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
const interruptWords = /^(?:(?:等|停)(?:一)?下|先(?:等|停)(?:一)?下|打断(?:一)?下|先别(?:说|讲)|别说了|暂停(?:一)?下)(?:[,，。\s]*(?:我)?打断(?:一)?下)?/;
const clean = (text) => text.replace(/[\p{P}\s]/gu, "");
const labels = ["无效", "附和", "有效发言", "明确打断"];
const classify = (text) => {
  const normalized = clean(text);
  if (!normalized || /^(?:咳|哈|呼|嘘)+$/.test(normalized)) return 0;
  if (interruptWords.test(text.trim())) return 3;
  if (/^(?:(?:对|嗯|恩|哦|喔|好|是的|好的|没错|明白|知道了))+$/u.test(normalized)) return 1;
  return 2;
};
const hasTime = (text) => /(?:早上|上午|中午|下午|晚上|傍晚|[零一二两三四五六七八九十百\d]+点)/.test(text);

const byId = (id) => document.getElementById(id);
const speaker = byId("speaker");
const callButton = byId("call");
const textButton = byId("text-call");
const form = byId("message");
const field = byId("message-text");
const events = byId("events");
const transcript = byId("transcript");
const wave = byId("wave");
for (let i = 0; i < 19; i++) {
  const bar = document.createElement("i");
  bar.style.setProperty("--i", i);
  bar.style.setProperty("--height", 5 + ((i * 11) % 29) + "px");
  wave.append(bar);
}

let active = false;
let mode = "voice";
let phase = "idle";
let userSpeaking = false;
let started = 0;
let clock;
let nextAction;
let recognizer;
let restart;
let spokenRow;
let replyUsed = false;
let detectedInterrupt = -1;
let playbackVersion = 0;

function elapsed() {
  const seconds = Math.floor((performance.now() - started) / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

function log(message, kind) {
  byId("empty-events").hidden = true;
  const item = document.createElement("li");
  const time = document.createElement("time");
  const detail = document.createElement("span");
  time.textContent = elapsed();
  detail.textContent = message;
  if (kind) item.dataset.kind = kind;
  item.append(time, detail);
  events.append(item);
  events.scrollTop = events.scrollHeight;
}

function addLine(author, text) {
  byId("empty-transcript").hidden = true;
  const item = document.createElement("li");
  const label = document.createElement("small");
  item.className = author === "你" ? "user" : "assistant";
  label.textContent = author;
  item.append(label, document.createTextNode(text));
  transcript.append(item);
  transcript.scrollTop = transcript.scrollHeight;
  return item;
}

function status(next = phase) {
  phase = next;
  byId("orb").dataset.phase = userSpeaking && next === "listening" ? "hearing" : next;
  byId("call-state").textContent = {
    idle: "等待接通",
    playing: "AI 正在说",
    paused: "AI 暂停",
    listening: userSpeaking ? "你正在说" : "AI 正在听",
    ended: "通话已结束"
  }[next];
}

function playback(action) {
  byId("playback-state").textContent = action;
}

function clearAction() {
  clearTimeout(nextAction);
  nextAction = undefined;
}

function later(action, delay) {
  clearAction();
  nextAction = setTimeout(() => {
    nextAction = undefined;
    if (active) action();
  }, delay);
}

function playCurrent() {
  const version = ++playbackVersion;
  status("playing");
  speaker.play().catch(() => {
    if (!active || playbackVersion !== version || phase !== "playing") return;
    status("listening");
    playback("音频无法播放");
    log("浏览器未能播放音频，请挂断后重试。");
  });
}

function speak(index) {
  const [audio, text] = speech[index];
  if (speaker.getAttribute("src") !== audio) speaker.src = audio;
  else speaker.currentTime = 0;
  spokenRow = addLine("AI · 播报台词", text);
  playback("播报中");
  playCurrent();
}

function stop(reason) {
  clearAction();
  ++playbackVersion;
  speaker.pause();
  if (spokenRow) {
    const marker = document.createElement("small");
    marker.className = "interrupted";
    marker.textContent = "已停播";
    spokenRow.append(marker);
  }
  spokenRow = undefined;
  playback("已停播");
  status("listening");
  log(reason, "stop");
}

function showClassification(digit) {
  byId("classification").textContent = digit + " · " + labels[digit];
}

function handleFinal(text, alreadyInterrupted = false) {
  if (!active || !text.trim()) return;
  addLine("你", text);
  const digit = alreadyInterrupted ? 3 : classify(text);
  showClassification(digit);

  if (digit === 0) {
    log("无效输入 · 保持当前状态");
    return;
  }
  if (digit === 1) {
    if (phase === "playing") {
      ++playbackVersion;
      speaker.pause();
      status("paused");
      playback("短暂停顿");
      log("附和 · 暂停当前播报");
      later(() => {
        playCurrent();
        playback("继续播报");
        log("从暂停处继续播报");
      }, 690);
    } else {
      log("附和 · 保持当前话轮");
    }
    return;
  }
  if (phase === "playing" || phase === "paused") {
    stop(digit === 3 ? "明确打断 · 已停播" : "有效发言 · 已停播");
  }

  clearAction();
  const request = text.trim().replace(interruptWords, "");
  if (!hasTime(clean(request))) {
    byId("turn-state").textContent = "未完整";
    if (digit !== 3) log("等你说完预约时间");
    return;
  }
  byId("turn-state").textContent = "完整";
  log("听到预约时间 · AI 接话");
  later(() => {
    replyUsed = true;
    speak(1);
  }, 530);
}

function showInput() {
  form.hidden = false;
  byId("shortcuts").hidden = false;
}

function microphoneFailure(message) {
  byId("mic-state").textContent = "不可用";
  byId("hint").textContent = message + "，可以在下方用文字继续。";
  mode = "text";
  userSpeaking = false;
  status();
  showInput();
  log("已切换到文字输入");
}

function startRecognition() {
  if (!recognitionClass) {
    microphoneFailure("这个浏览器不支持语音识别");
    return;
  }
  const instance = new recognitionClass();
  recognizer = instance;
  detectedInterrupt = -1;
  instance.lang = "zh-CN";
  instance.continuous = true;
  instance.interimResults = true;
  const live = () => active && recognizer === instance && mode === "voice";
  instance.onstart = () => {
    if (live()) byId("mic-state").textContent = "已开启";
  };
  instance.onspeechstart = () => {
    if (!live()) return;
    userSpeaking = true;
    status();
  };
  instance.onspeechend = () => {
    if (!live()) return;
    userSpeaking = false;
    status();
  };
  instance.onresult = (event) => {
    if (!live()) return;
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      const text = result[0].transcript.trim();
      const partial = byId("partial");
      partial.textContent = result.isFinal ? "" : text;
      if (result.isFinal) {
        userSpeaking = false;
        status();
        handleFinal(text, index === detectedInterrupt);
      } else if ((phase === "playing" || phase === "paused") && classify(text) === 3) {
        detectedInterrupt = index;
        showClassification(3);
        stop("明确打断 · 已停播");
      }
    }
  };
  instance.onnomatch = () => {
    if (!live()) return;
    showClassification(0);
    log("没听清 · 保持当前状态");
  };
  instance.onerror = (event) => {
    if (!live() || ["aborted", "no-speech"].includes(event.error)) return;
    const denied = ["not-allowed", "service-not-allowed"].includes(event.error);
    microphoneFailure(denied ? "麦克风或语音服务未授权" : "语音识别暂时不可用");
  };
  instance.onend = () => {
    if (!live()) return;
    userSpeaking = false;
    status();
    byId("partial").textContent = "";
    byId("mic-state").textContent = "重新连接中";
    restart = setTimeout(() => {
      if (live()) startRecognition();
    }, 420);
  };
  try {
    instance.start();
  } catch {
    microphoneFailure("语音识别未能启动");
  }
}

function begin(inputMode) {
  if (active) return;
  active = true;
  mode = inputMode;
  replyUsed = false;
  started = performance.now();
  for (const id of ["classification", "turn-state", "playback-state"]) byId(id).textContent = "—";
  events.replaceChildren();
  transcript.replaceChildren();
  byId("partial").textContent = "";
  byId("elapsed").textContent = "00:00";
  clock = setInterval(() => { byId("elapsed").textContent = elapsed(); }, 250);
  callButton.classList.add("active");
  callButton.querySelector("span").textContent = "挂断";
  textButton.hidden = true;
  if (mode === "voice") {
    byId("mic-state").textContent = "正在开启";
    byId("hint").textContent = "AI 说话时，你可以直接开口。";
    startRecognition();
  } else {
    byId("mic-state").textContent = "文字输入";
    byId("hint").textContent = "AI 说话时，点一句或发送自己的台词。";
    showInput();
  }
  log("电话已接通");
  speak(0);
}

function hangUp() {
  if (!active) return;
  active = false;
  clearAction();
  clearTimeout(restart);
  clearInterval(clock);
  if (recognizer) recognizer.abort();
  recognizer = undefined;
  userSpeaking = false;
  ++playbackVersion;
  speaker.pause();
  form.reset();
  form.hidden = true;
  byId("shortcuts").hidden = true;
  byId("partial").textContent = "";
  byId("mic-state").textContent = "未开启";
  byId("hint").textContent = "建议戴耳机。开启后，麦克风音频可能由浏览器的语音服务处理。";
  playback("—");
  status("ended");
  callButton.classList.remove("active");
  callButton.querySelector("span").textContent = "再次接通";
  textButton.hidden = false;
  log("电话已挂断");
}

speaker.addEventListener("ended", () => {
  if (!active || phase !== "playing" || !speaker.ended) return;
  spokenRow = undefined;
  playback("播报结束");
  status("listening");
  log(replyUsed ? "AI 已回复 · 继续听" : "播报结束 · 等你开口");
});

callButton.addEventListener("click", () => active ? hangUp() : begin("voice"));
textButton.addEventListener("click", () => begin("text"));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleFinal(field.value.trim());
  form.reset();
});
for (const button of byId("shortcuts").querySelectorAll("button")) {
  button.addEventListener("click", () => handleFinal(button.textContent));
}
window.addEventListener("pagehide", hangUp);
