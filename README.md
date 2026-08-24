<!-- Modified from shibing624/chinese-chess-ai: time-limited background search, difficulty presets, optional clock, responsive layout, varied moves, and timed visual hints, 2026. -->

# 🏮 中国象棋AI人机对弈网站

<div align="center">

![Chinese Chess](https://img.shields.io/badge/Game-Chinese%20Chess-red?style=for-the-badge&logo=chess)
![AI Algorithm](https://img.shields.io/badge/AI-Alpha--Beta%20Pruning-blue?style=for-the-badge&logo=brain)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-yellow?style=for-the-badge&logo=javascript)

**基于极小化极大算法 + Alpha-Beta剪枝的智能中国象棋对弈系统**

[🎮 演示网站](https://shibing624.github.io/chinese-chess-ai/)

</div>

---

## 🎯 核心功能
- 🎮 **完整象棋规则** - 支持所有棋子移动规则和特殊规则
- 🤖 **智能AI对手** - 四档检索难度，并从实力接近的候选走法中随机落子
- 🧠 **多维评估** - 综合棋子价值、位置、机动性等因素
- ⏱️ **可选计时** - 可按需启用双方计时，休闲对局默认关闭
- 💡 **智能提示** - 使用比当前难度更深的独立检索为玩家提供建议，低难度开局前三回合会进一步加深
- 📋 **完整记录** - 走法历史记录，支持悔棋功能

## 🎮 演示网站

[https://shibing624.github.io/chinese-chess-ai/](https://shibing624.github.io/chinese-chess-ai/)

## 🚀 快速开始

### 方法一：直接运行（推荐）
```bash
# 克隆项目
git clone https://github.com/shibing624/chinese-chess-ai.git
cd chinese-chess-ai

# 直接用浏览器打开 index.html 即可开始游戏！
open index.html  # macOS
# 或双击 index.html 文件
```

### 方法二：本地服务器
如果遇到CORS限制，可以启动本地服务器：

```bash
# 使用 Python
python -m http.server 8000

# 使用 Node.js
npx http-server -p 8000

# 然后访问 http://localhost:8000
```

## 🧠 核心算法

### 极小化极大算法 (Minimax)
```
function minimax(position, depth, maximizingPlayer):
    if depth == 0 or game_over:
        return evaluate(position)
    
    if maximizingPlayer:
        maxEval = -∞
        for each child of position:
            eval = minimax(child, depth-1, false)
            maxEval = max(maxEval, eval)
        return maxEval
    else:
        minEval = +∞
        for each child of position:
            eval = minimax(child, depth-1, true)
            minEval = min(minEval, eval)
        return minEval
```

### Alpha-Beta剪枝优化
- **剪枝效率**: 最优情况下搜索节点数从 O(b^d) 降至 O(b^(d/2))
- **迭代加深**: 在各档思考时间内逐层搜索，超时返回最后完整完成的一层
- **搜索上限**: 由极速、标准、困难、大师四档难度控制
- **移动排序**: 优先搜索吃子和强子移动，提高剪枝效率
- **候选深化**: 浅层覆盖全部走法，深层集中检索排名靠前的候选
- **走法变化**: 在分差合理的近优候选中加权随机选择，难度越高越偏向强招

### 智能评估函数

| 评估维度 | 权重 | 说明 |
|---------|------|------|
| **物质价值** | 最高 | 将10000、车1000、炮550、马400、相/士250、兵150 |
| **位置价值** | 高 | 不同棋子在不同位置的战略价值 |
| **机动性** | 中 | 可移动位置数量，反映灵活性 |
| **控制力** | 中 | 威胁对方棋子的能力 |
| **将军威胁** | 高 | 进攻和防守将/帅的能力 |


## 📁 项目结构

```
chinese-chess-ai/
├── 📄 index.html          # 主页面 - 游戏界面
├── 🎨 style.css           # 样式文件 - 棋盘和UI样式
├── 🎮 main.js             # 主控制器 - 游戏流程控制
├── ♟️  chess.js           # 象棋引擎 - 规则和逻辑
├── 🤖 ai.js               # AI模块 - 算法实现
├── 🔌 ai-client.js        # 搜索客户端 - Worker生命周期和回退
├── 🧵 ai-worker.js        # 后台线程 - 限时执行搜索
├── 🔊 audio.js            # 音效管理 - 声音效果
├── 🖼️  ui.js              # UI渲染 - 界面渲染
├── 📋 README.md           # 项目文档
└── 📜 LICENSE             # 开源协议
```

## 🎮 使用说明

### 基本操作
1. **🔴 红方先行** - 玩家控制红方棋子
2. **👆 点击选择** - 点击己方棋子进行选中
3. **✨ 高亮提示** - 选中后显示可移动位置
4. **🎯 移动棋子** - 点击高亮位置完成移动
5. **⚔️ 吃子操作** - 点击对方棋子位置进行吃子

### 功能按钮

| 按钮 | 功能 | 说明 |
|------|------|------|
| 🆕 **新游戏** | 重新开始 | 重置棋盘，开始新的对局 |
| ↩️ **悔棋** | 撤销走法 | 撤销最近两步（玩家+AI各一步） |
| 💡 **提示** | 增强建议 | 比当前难度多检索一层；低难度开局前三回合再增加一层，减少浅层固定套路 |
| 🔊 **音效** | 声音开关 | 开启/关闭游戏音效 |
| 🎚️ **难度** | 检索强度 | 可选择极速、标准、困难或大师 |
| ⏱️ **计时** | 对局时钟 | 可选的双方15分钟计时 |

### 🎵 音效系统

我们的音效系统使用 Web Audio API 实时生成，包含：

- 🎶 **选中音效** - 轻快的提示音 (440Hz)
- 🎵 **移动音效** - 清脆的落子声 (330Hz)
- 💥 **吃子音效** - 低沉的碰撞声 (220Hz)
- ⚠️ **将军音效** - 紧急警告音 (880Hz)
- 🎉 **胜利音效** - 上升旋律 (C大调)
- 😔 **失败音效** - 下降旋律
- 🤝 **和棋音效** - 平稳音调
- ↩️ **悔棋音效** - 倒退音效
- 🆕 **新游戏** - 清脆开始音

## ⚙️ 自定义配置

### 调整AI难度
在页面的“难度”选项中选择极速、标准、困难或大师。标准为默认档位；更高档位拥有更长的思考时间、更深的搜索上限和更严格的近优筛选，但仍会保留少量走法变化。

### 自定义评估权重
在 `ai.js` 的 `evaluatePosition` 方法中调整：

```javascript
// 评估权重配置
const weights = {
    material: 1.0,      // 物质价值权重
    position: 0.3,      // 位置价值权重
    mobility: 0.2,      // 机动性权重
    control: 0.15,      // 控制力权重
    kingThreat: 0.4     // 将军威胁权重
};
```

## 🔧 开发指南

### 添加新功能
1. **修改规则** → 编辑 `chess.js`
2. **改进AI** → 编辑 `ai.js`
3. **美化界面** → 编辑 `style.css`
4. **扩展功能** → 编辑 `main.js`

### 调试AI算法
打开浏览器控制台查看详细信息：
- 🔍 搜索深度和候选走法
- 📊 每个走法的评分
- 🎯 最佳走法选择
- 📈 搜索节点统计
- ✂️ 剪枝效率统计
- ⏱️ 搜索耗时分析

## 🤔 常见问题

<details>
<summary><strong>❓ AI响应太慢怎么办？</strong></summary>

在页面的“难度”选项中选择“标准”或“极速”，可以显著缩短等待时间。
</details>

<details>
<summary><strong>❓ AI太强/太弱怎么调整？</strong></summary>

通过页面选项切换难度：“极速”适合快速体验，“标准”适合休闲对局，“困难”和“大师”适合更有挑战性的对局。
</details>

<details>
<summary><strong>❓ 如何提高AI棋力？</strong></summary>

1. 增加搜索深度（最直接）
2. 优化评估函数权重
3. 改进移动排序策略
4. 添加开局库和残局库
</details>

<details>
<summary><strong>❓ 为什么选择纯前端实现？</strong></summary>

- ✅ 部署简单，无需服务器
- ✅ 响应速度快，无网络延迟
- ✅ 隐私保护，数据不上传
- ✅ 离线可用，随时随地对弈
</details>

## 🎯 性能优化

- **🔄 Alpha-Beta剪枝** - 平均减少60-90%的搜索节点
- **📊 移动排序** - 优先搜索有希望的走法，提高剪枝效率
- **⏳ 限时迭代** - 始终使用最后完整完成的搜索层，避免强行跑满深度
- **⚡ 后台计算** - Web Worker执行搜索，不阻塞棋盘和页面交互
- **🎲 近优随机** - 根据难度加权选择质量接近的候选，减少固定套路

## 🏆 技术亮点

1. **🧠 经典算法** - 使用经过数十年验证的博弈算法
2. **⚡ 高效剪枝** - 通过移动排序大幅提升剪枝效率
3. **🎯 智能评估** - 多维度综合评估，棋力强劲
4. **🚀 纯前端** - 无服务器依赖，部署简单
5. **🔧 完整引擎** - 支持所有象棋规则和特殊情况
6. **📊 详细调试** - 丰富的调试信息，便于优化
7. **🎵 实时音效** - Web Audio API动态生成，响应迅速

## 📈 算法性能

检索耗时取决于当前局面的可选走法数量及设备性能。各档设置了思考时间上限：极速和标准适合手机端快速对局，困难通常在约两秒内返回，大师最多思考约五秒。提示会在当前档位上增加一层搜索上限并使用更长的独立预算；极速和标准在开局前三个红方回合还会再增加一层，以减少浅层评分造成的固定炮路。复杂局面不强求跑满搜索上限，中残局分支减少后会自动完成更深层次。

## 📧 联系方式

- 问题反馈（建议）
  ：[![GitHub issues](https://img.shields.io/github/issues/shibing624/chinese-chess-ai.svg)](https://github.com/shibing624/chinese-chess-ai/issues)
- 邮箱联系: xuming: xuming624@qq.com
- 微信联系: 添加我的 *微信号: xuming624，备注：姓名-公司-技术交流* 加入技术交流群。

<img src="https://github.com/shibing624/agentica/blob/main/docs/wechat.jpeg" width="200" />


## 📄 开源协议

本项目采用教育用途开源协议，仅供学习和研究使用。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

<div align="center">

**🎮 享受智能象棋对弈的乐趣！**

Made with ❤️ by AI Chess Team

[⬆️ 回到顶部](#-中国象棋ai对弈系统)

</div>
