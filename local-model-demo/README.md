# 中文电话预约 Demo

点「接通电话」可以用中文插话，点「用录音体验」可以播放环境声、附和和改约样例。两个入口都把音频送到推理服务。中文播报、附和和改约样例为合成语音。

音频经过 Silero VAD，流式分类每 320 ms 输出无效、附和或有效发言。AI 播报期间，连续两块有效发言触发停播。进入监听后，TurnSense 判断用户是否说完，判定完整后播放中文回复。

中文交互使用日语 V6 三分类权重。当前只验证了演示样例，中文分类效果还需单独评估。

## 启动

1. 准备带 CUDA 的 Linux 机器和 Python 3.11 或 3.12。先安装适配显卡和驱动的 PyTorch，演示环境使用 PyTorch 2.6.0。然后在本目录执行 `python -m pip install -r requirements.txt`。[PyTorch 安装说明](https://pytorch.org/get-started/locally/)
2. 从 ModelScope 下载并解压 `speech-interrupt-inference-v0.1.0-preview-20261104.tar.gz`，用随包的 `.sha256` 文件校验。解压目录需包含 `bundle.json`、`src/`、模型和环境声样例。[Qwen3-ASR-Turn](https://modelscope.cn/datasets/huanmie/Qwen3-ASR-Turn)
3. 克隆 TurnSense 源码。下载 TurnSense 1.0 的 `model_int8.onnx` 和 `am.mvn`，放到其 `models/` 目录。[TurnSense 源码](https://github.com/Bairong-Xdynamics/TurnSense) · [TurnSense 1.0 权重](https://huggingface.co/brgroup/TurnSense/tree/main/TurnSense1.0)
4. 从本目录启动服务，将示例路径换成实际路径。

   ```bash
   PYTHONPATH="/path/to/speech-interrupt-inference/src" python server.py \
     --bundle /path/to/speech-interrupt-inference/bundle.json \
     --turnsense /path/to/TurnSense
   ```

在本机打开 [中文电话 Demo](http://127.0.0.1:18864/)。如果推理服务在另一台机器，在本机先启动 SSH 转发。

```bash
ssh -N -L 18864:127.0.0.1:18864 user@gpu-host
```
