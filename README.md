# 流式打断四分类 · Streaming Barge-in Classification

AI 播报时，系统按声音类型决定继续、暂缓还是停播。

## 演示示例

[打开在线 Demo](https://eeexile.github.io/full-duplex-barge-in-demo/)

| 分类 | 听到的声音 | 播报怎么处理 |
| --- | --- | --- |
| 0 · 无效 | 背景噪声或背景人声 | 继续播报 |
| 1 · 附和 | 「对对对」 | 停一拍，接着说 |
| 2 · 有效发言 | 「我想再查一下……」 | 连续判为有效后停播 |
| 3 · 明确打断 | 「等一下，我打断一下」 | 识别后停播，让用户说 |

页面可试听附和和明确打断。点「背景噪声」或普通发言的例子，可以展开规则回放。

页面下方可用 [示例标签](example.jsonl) 逐块查看交互规则。

用户录音来自 [AliMeeting](https://www.openslr.org/119/) 的 R8002_M8002、R8009_M8022。

## 系统架构

![全双工语音交互架构：播报时用流式打断四分类决定是否停播，监听时先判断声音是否有效，再用 TurnSense 判断有没有说完](architecture.svg)

## 快速开始

使用 Node.js 18 或更新版本运行命令行示例，无需额外依赖。

```bash
git clone https://github.com/EEexile/full-duplex-barge-in-demo.git
cd full-duplex-barge-in-demo
node replay.cjs
```

命令每行输出一个决策，包含输入类别、前后状态和动作。示例依次输出 `continue`、`stop`、`wait`、`reply`。离线浏览器演示可直接打开仓库中的 `index.html`。

```bash
node replay.cjs example.jsonl speaking 2
```

最后两个参数分别是起始状态 `speaking` / `listening`，以及连续有效发言的停播阈值 `2` / `3`。浏览器和命令行共用 `decision.js`。

## 用自己的分类结果回放

展开「逐块看停播规则」里的「用自己的分类结果试跑」，选择起始状态。每行填一块的结果，载入后可单步推进或自动回放。

```text
["嗯嗯", 1]
["等一下", 3]
["我想查一下……", 2, "incomplete"]
["上个月的账单", 2, "complete"]
```

每行依次填写显示说明、四分类编号和可选的 TurnSense 结果。编号为 `0` 无效、`1` 附和、`2` 有效发言、`3` 明确打断，`null` 表示 VAD 未激活。TurnSense 结果可填 `complete`、`incomplete` 或 `invalid`。播报时只使用四分类结果。监听时，有效音频缺少 TurnSense 结果就继续听。

这个仓库提供可运行的交互策略演示。音频推理在外部完成，页面读取预设示例或你导入的结果。想单独运行真实音频的轮次判断，可以参考 [TurnSense 官方仓库的快速开始](https://github.com/Bairong-Xdynamics/TurnSense#-快速开始)。

## 团队成果

团队围绕全双工语音交互中的误打断问题，构建了覆盖噪声、附和、有效发言和明确打断的场景数据，迭代了流式打断判别模型，并结合停播策略开展场景评测。这个演示进一步串联了播报侧的打断判断和监听侧的轮次判断。

## 试一遍

1. 展开「逐块看停播规则」，选择「账单对话（文字示例）」，点击「单步推进」。勾选「显示 VAD 和分类」可以查看每块的技术细节。
2. AI 正在播报时听到「嗯嗯」，继续播。听到「等一下」，触发停播并转入监听。
3. 用户说「我想查一下……」，通过有效性判断，但 TurnSense 判为未完整，AI 继续等。
4. 用户补完「上个月的账单」，TurnSense 判为完整，AI 开始回复并回到播报状态。

页面支持 240 ms 模拟更新，逐步显示 VAD、四分类、二分类、TurnSense 和动作。播报噪声示例还可和持续激活 500 ms 的 VAD 基线对照。
