# 流式打断四分类

AI 正在播报时，判断该接着说，还是停下来听用户。

## 系统架构

<img width="880" height="450" alt="全双工语音交互架构" src="https://github.com/user-attachments/assets/6e87954a-e42c-4f97-8f1a-1d58dbc4d643" />

| 分类 | 听到的声音 | 播报怎么处理 |
| --- | --- | --- |
| 0 · 无效 | 背景噪声或背景人声 | 继续播报 |
| 1 · 附和 | 「对对对」 | 停一拍，接着说 |
| 2 · 有效发言 | 「我想再查一下……」 | 连续判为有效后停播 |
| 3 · 明确打断 | 「等一下，我打断一下」 | 识别后停播，让用户说 |

[打开交互 Demo](https://eeexile.github.io/full-duplex-barge-in-demo/)

用户录音来自 [AliMeeting](https://www.openslr.org/119/) 的 R8002_M8002、R8009_M8022。

本地试跑：克隆仓库后，运行 `node replay.cjs`。
