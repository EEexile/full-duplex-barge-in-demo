"""Chinese phone demo using the Japanese V6 weights, served over a loopback SSH tunnel."""
import argparse
import asyncio
import logging
import struct
from collections import deque
from pathlib import Path

import numpy as np
import torch
import uvicorn
from scipy.signal import resample_poly
from silero_vad import load_silero_vad
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from speech_interrupt import Bundle, Stream
from speech_interrupt.audio import load_audio

from japanese_engine import JapaneseEngine
from turnsense_adapter import load_turnsense

CHUNK_MS = 320
STEP = CHUNK_MS * 16
WEB = Path(__file__).resolve().parent
SAMPLES = {"backchannel": "ack.wav", "speech": "booking.wav"}
NOISE = "pure_noise_866e49ac4ec52e86.wav"



class Call:
    def __init__(self, engine, turn_predict, vad):
        self.engine = engine
        self.vad = vad
        self.vad.reset_states()
        self.stream = Stream(engine, CHUNK_MS)
        self.silence_run = 0
        self.turn_predict = turn_predict
        self.playback_id = 0
        self.stopped_id = 0
        self.streak = 0
        self.previous = None
        self.utterance = deque(maxlen=8000 // CHUNK_MS)
        self.quiet = 0

    def push(self, playback_id, pcm):
        # Browser capture and resampling can overshoot the nominal PCM range.
        pcm = np.nan_to_num(pcm, nan=0.0, posinf=0.0, neginf=0.0)
        np.clip(pcm, -1.0, 1.0, out=pcm)
        # Simulate an 8 kHz telephone channel and return to the model's 16 kHz input rate.
        pcm = resample_poly(resample_poly(pcm, 1, 2), 2, 1)
        pcm = np.clip(pcm, -1, 1).astype(np.float32, copy=False)
        with torch.inference_mode():
            vad_open = max(self.vad(torch.from_numpy(frame), 16000).item()
                           for frame in np.split(pcm, STEP // 512)) >= 0.5
        if not vad_open:
            self.silence_run += 1
            if self.silence_run == 2:
                self.stream = Stream(self.engine, CHUNK_MS)
            label, model_ms = "invalid", 0
        else:
            self.silence_run = 0
            event = self.stream.push(pcm)
            label, model_ms = event["label"], round(event["update_seconds"] * 1000)
        if self.playback_id != playback_id:
            self.playback_id = playback_id
            self.streak = 0
        speaking = playback_id > self.stopped_id
        result = {"type": "decision", "label": label, "playback_id": playback_id,
                  "model_ms": model_ms, "vad": vad_open, "action": "listen"}
        if speaking:
            self.streak = self.streak + 1 if label == "valid" else 0
            if self.streak == 2:
                self.stopped_id = playback_id
                self.utterance.clear()
                if self.previous is not None:
                    self.utterance.append(self.previous)
                self.utterance.append(pcm)
                self.quiet = 0
                result["action"] = "stop"
            else:
                result["action"] = "continue"
        else:
            result["validity"] = "invalid" if label == "invalid" else "valid"
            if label != "invalid":
                self.quiet = 0
                self.utterance.append(pcm)
            elif self.utterance and self.quiet < 2:
                self.quiet += 1
                self.utterance.append(pcm)
                if self.quiet == 2:
                    turn = self.turn_predict(np.concatenate(list(self.utterance)[:-2]))
                    result["turn"] = turn
                    if turn in ("complete", "invalid"):
                        self.utterance.clear()
                    if turn == "complete":
                        result["action"] = "reply"
        self.previous = pcm
        return result


def create_app(engine, turn_predict, vad, bundle):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    active_call = asyncio.Lock()
    assets = {name: WEB / name for name in ("app.js", "capture.js", "call.css", "greeting.m4a", "reply.m4a")}

    @app.get("/")
    def home():
        return FileResponse(WEB / "index.html", headers={"Cache-Control": "no-store"})

    @app.get("/health")
    def health():
        return {"model": bundle.spec["model_id"], "classes": bundle.spec["class_names"], "chunk_ms": CHUNK_MS}

    @app.get("/asset/{name}")
    def asset(name: str):
        if name not in assets:
            raise HTTPException(404)
        return FileResponse(assets[name], headers={"Cache-Control": "no-cache"})

    @app.get("/pcm/{kind}")
    def sample(kind: str):
        if kind == "noise":
            source = bundle.path.parent / "examples" / "audio" / NOISE
        elif kind in SAMPLES:
            source = WEB / SAMPLES[kind]
        else:
            raise HTTPException(404)
        return Response(np.clip(load_audio(source), -1, 1).astype("<f4").tobytes(), media_type="application/octet-stream")

    @app.websocket("/audio")
    async def audio(ws: WebSocket):
        if ws.headers.get("origin") != f"http://{ws.headers.get('host')}":
            await ws.close(code=1008)
            return
        await ws.accept()
        if active_call.locked():
            await ws.send_json({"type": "error", "message": "已有一通电话在使用模型。"})
            await ws.close()
            return
        async with active_call:
            call = Call(engine, turn_predict, vad)
            await ws.send_json({"type": "ready", "chunk_ms": CHUNK_MS})
            try:
                while True:
                    data = await ws.receive_bytes()
                    if len(data) != 4 + STEP * 4:
                        await ws.close(code=1003)
                        return
                    playback_id, = struct.unpack_from("<I", data)
                    pcm = np.frombuffer(data, dtype="<f4", offset=4)
                    result = await asyncio.to_thread(call.push, playback_id, pcm)
                    await ws.send_json(result)
            except WebSocketDisconnect:
                pass
            except Exception:
                logging.exception("Call failed")
                await ws.send_json({"type": "error", "message": "模型推理失败，请重新接通。"})
                await ws.close(code=1011)
    return app


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bundle", required=True, type=Path)
    p.add_argument("--turnsense", required=True, type=Path)
    p.add_argument("--port", default=18864, type=int)
    args = p.parse_args()
    bundle = Bundle.load(args.bundle)
    engine = JapaneseEngine(bundle)
    engine.predict(np.zeros(STEP, dtype=np.float32), 0, 4)
    turn_predict = load_turnsense(args.turnsense, args.turnsense / "models")
    vad = load_silero_vad(onnx=True)
    uvicorn.run(create_app(engine, turn_predict, vad, bundle), host="127.0.0.1", port=args.port, ws_max_size=32768)


if __name__ == "__main__":
    main()
