# RandomPassword

> 一个纯前端、零依赖、零构建的随机密码生成器。打开网页即可使用，所有计算都在本地浏览器完成。

原项目是一个 Python 命令行脚本，现已改造为静态网站：保留原有的生成规则内核，把「输入长度 → 输出密码」的命令行循环升级为图形化配置界面。原始实现归档在 [`legacy/RandomPassword.py`](legacy/RandomPassword.py) 以便溯源。

## 在线预览

部署到 GitHub Pages 后可通过 `https://afewmoon.github.io/RandomPassword/` 访问（需先在仓库 Settings → Pages 中把 Source 设为 **GitHub Actions**）。

## 功能

- **密码生成** —— 沿用原脚本规则：启用大写时随机生成 1–3 位大写字母，其余长度由小写字母与数字补齐，最后整体打乱顺序（字符允许重复）。
- **长度调节** —— 滑块与数字输入框联动，范围 1–256，默认 16。
- **字符集开关** —— 大写字母、小写字母、数字、特殊符号可独立启用；启用多个类型时每种类型至少保留一位；全部关闭会被拦截并提示。
- **一键复制** —— 优先使用 `navigator.clipboard`，不可用时回退到 `execCommand`，兼容 `file://` 场景。
- **批量生成** —— 一次最多生成 50 条相互独立的密码，支持逐条复制。
- **强度提示** —— 按信息熵 `长度 × log2(字符池大小)` 计算，展示为弱 / 中 / 强 / 极强。
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

## 生成规则对照

| 规则 | 原 Python 实现 | 本静态站 |
| --- | --- | --- |
| 大写字母 | `random.randint(1, 3)` 位 | `randomInt(3) + 1` 位，即 1–3 位 |
| 其余字符 | `abcdefghijklmnopqrstuvwxyz0123456789` | 默认小写 + 数字，可选加入符号 |
| 打乱顺序 | `random.shuffle(lst)` | Fisher-Yates 洗牌 |
| 字符是否可重复 | 可重复（`random.choices`） | 可重复 |
| 随机源 | `random` 模块 | `crypto.getRandomValues` + 拒绝采样（消除取模偏差） |

默认配置（长度 16、大小写与数字开启、符号关闭）下生成语义与原脚本一致。

## 目录结构

```
RandomPassword/
├── index.html                    # 页面结构
├── styles.css                    # 样式（极简极客深色主题）
├── app.js                        # 全部逻辑：随机数、生成、评估、存储、交互、渲染
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
