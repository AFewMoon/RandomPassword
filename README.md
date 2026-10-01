# RandomPassword

> 一个纯前端、零依赖、零构建的随机密码生成器。打开网页即可使用，所有计算都在本地浏览器完成。

原项目是一个 Python 命令行脚本，现已改造为静态网站：保留原有的生成规则内核，把「输入长度 → 输出密码」的命令行循环升级为图形化配置界面。原始实现归档在 [`legacy/RandomPassword.py`](legacy/RandomPassword.py) 以便溯源。

## 在线预览

部署到 GitHub Pages 后可通过 `https://afewmoon.github.io/RandomPassword/` 访问（需先在仓库 Settings → Pages 中把 Source 设为 **GitHub Actions**）。

## 功能

- **按类计数生成** —— 四类字符集各自决定数量，取满后合并，整体随机排列（字符允许重复）。数量为 0 即该类不参与。
- **固定 / 随机 逐类切换** —— 每类旁的按钮可在「锁（固定数量）」与「骰子（区间随机）」之间切换，两类模式可自由混合。
- **总长双向同步** —— 总长 = 各类数量之和；修改总长会按当前占比重新分配回各类，随机类的区间随之等比缩放，旁边实时显示实际总长区间。
- **一键复制** —— 优先使用 `navigator.clipboard`，不可用时回退到 `execCommand`，兼容 `file://` 场景。
- **批量生成** —— 一次最多生成 50 条相互独立的密码（长度可能各不相同），支持逐条复制。
- **强度提示** —— 按实际生成的那条计算信息熵 `长度 × log2(字符池大小)`，展示为弱 / 中 / 强 / 极强。
- **历史记录** —— 保留最近 20 条，仅写入本机 `localStorage`，可一键清空。
- **隐私** —— 页面不发起任何网络请求，不引入任何第三方库、CDN 资源或外部字体。

## 使用

### 方式一：直接打开

双击 `index.html` 即可。项目未使用 ES Module，也不请求任何外部资源，因此在 `file://` 协议下可以正常运行。

### 方式二：本地静态服务器

```powershell
# 任选其一
python -m http.server 8080
npx serve .
```

然后访问 <http://localhost:8080>。

### 方式三：任意静态托管

把 `index.html`、`styles.css`、`app.js` 放到任意静态托管服务（GitHub Pages、Netlify、Vercel、对象存储等）即可，无需构建步骤。

## 生成规则

原脚本的规则是「大写固定 1–3 位，其余用小写+数字补齐」，本静态站已改为按类计数模型：

| 环节 | 原 Python 脚本 | 本静态站 |
| --- | --- | --- |
| 数量决定 | 大写 `randint(1, 3)` 位，其余补齐到指定长度 | 每类各自指定数量或区间，总长 = 各类之和 |
| 取字符 | `random.choices`（允许重复） | 同，允许重复 |
| 排列 | `random.shuffle(lst)` | Fisher-Yates 洗牌 |
| 随机源 | `random` 模块 | `crypto.getRandomValues` + 拒绝采样（消除取模偏差） |

### 生成流程

1. 逐类确定数量：固定类取设定值，随机类在 `[min, max]` 内均匀随机
2. 各类从自己的字符池中取满对应数量的字符（允许重复）
3. 所有字符合并后整体洗牌

### 总长分配规则

修改「总长」时按各类代表值（固定类取数量、随机类取区间上限）等比例分配：

- 各项按比例向下取整，**舍入余数补到小写类**；小写类不可用时补到第一个非零类
- 固定类直接写入分配值
- 随机类的区间等比缩放：`新上限 = 分配值`，`新下限 = round(旧下限 × 新上限 ÷ 旧上限)`；旧上限为 0 时新下限固定为 0

### 模式切换

- **随机 → 固定**：取区间下限作为固定数量
- **固定 → 随机**：初始区间为 `数量 … 数量+2`

### 默认状态

四类均为随机 1–3，即总长在 4–12 之间浮动，每次生成的密码长度都可能不同。

## 目录结构

```
RandomPassword/
├── index.html                    # 页面结构
├── styles.css                    # 样式（极简极客深色主题）
├── app.js                        # 全部逻辑：随机数、按类计数生成、总长分配、评估、存储、交互、渲染
├── legacy/RandomPassword.py      # 原始 Python 实现（归档，可选运行）
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署
├── LICENSE                       # MIT
└── .nojekyll                     # 关闭 Jekyll 处理
```

## 部署

仓库已内置 GitHub Actions 流水线 `.github/workflows/deploy.yml`：推送到 `main` 分支或手动触发 `workflow_dispatch` 即会自动发布。

首次启用需要到仓库 **Settings → Pages**，将 **Source** 设置为 **GitHub Actions**（只需设置一次）。

## 归档脚本（可选）

`legacy/RandomPassword.py` 是原来的命令行版本，仅依赖标准库。Windows 环境下建议使用 Anaconda 自带的 Python 运行：

```powershell
& "$env:USERPROFILE\anaconda3\python.exe" legacy\RandomPassword.py
```

## 许可

[MIT License](LICENSE)
