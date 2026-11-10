# 全双工语音通话 Demo

一个可以在 AI 说话时直接插话的语音对话 Demo，支持实时字幕、附和续播和打断停播。你还没说完时，系统会等待后面的内容。

[在线体验](https://eeexile-duplex-qwen-20261109.sublimeshell4.chatgpt.site)

## 试着说几句

| 场景 | 示例 |
| --- | --- |
| 正常对话 | 「我想预约明天下午三点」 |
| 附和续播 | AI 说话时说「嗯嗯，你继续」 |
| 插话打断 | AI 说话时说「等一下，我想改个时间」 |
| 分段表达 | 先说「我想改到……」，再补充「明天下午四点」 |

允许麦克风权限后即可通话，建议戴耳机。也可以先播放网页里的语句判断示例，或用文字体验。当前在线体验需登录已授权账号，每次最多三分钟。

## 模型分工

- **Qwen**：实时转写、识别附和与打断、生成回答和语音。
- **TurnSense**：听取语音，判断用户是否说完。

Qwen 通过百炼 API 调用，TurnSense 使用公开模型在网页运行，无需启动本机服务。首次加载模型需要一点时间。

[在线版源码](qwen-online-worker.mjs) · [TurnSense 公开模型](https://huggingface.co/brgroup/TurnSense/tree/main/TurnSense1.0) · [开源组件许可](THIRD_PARTY_NOTICES.txt)
