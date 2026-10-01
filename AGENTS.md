# AGENTS.md

面向在本仓库工作的 AI 助手与协作者的实操笔记。内容来自「Python CLI → 静态网站」这次改造，只记录会再次踩到的坑，不重复 README 已有的功能介绍。

## 一、项目定位

纯前端单页静态站：`index.html` + `styles.css` + `app.js`，直接在仓库根目录，无构建步骤、无依赖清单、无包管理器。`legacy/RandomPassword.py` 是原始命令行版本，仅作归档与对照，不参与网站运行。

## 二、改代码前必须知道的硬约束

1. **不要引入任何外部资源。** 不用 CDN、不用外部字体、不引 npm 包、不引框架。破坏这条会同时破坏下一条。
2. **必须保证 `file://` 直接双击可用。** 因此：
   - 不用 ES Module（`type="module"`、`import`/`export`），`file://` 下会被 CORS 拦掉；
   - 不发起 `fetch`/`XHR`，不加载同目录 JSON；
   - 用普通 `<script src="app.js">`，`app.js` 用 IIFE + `var` 风格包起来，不污染全局。
3. **不删 `.codebuddy/`。** 它是 IDE 的项目数据目录，已在 `.gitignore` 中忽略，但必须留在磁盘上。

## 三、生成模型：全项目最容易改错的地方

现行模型（v2）是**按类计数**：每类字符集各持一份配置 `{ mode: 'fixed' | 'random', min, max }`，`fixed` 时恒有 `min === max`（即「数量」），`random` 时 `min ≤ max` 表示每次生成的取值区间。

生成流程：逐类定数量（固定取 `min`，随机取 `randomInt(max - min + 1) + min`）→ 各类从自己的池里取满该数量 → 全部合并 → Fisher-Yates 洗牌。

**五条铁律**（违反任意一条都会产生难查的状态不一致）：

1. `fixed` 必须 `min === max`。界面在固定态隐藏了上限输入框，但 `getConfig()` 仍要归一化 `max = min`；漏掉这步会让总长按重复值累加。
2. **总长输入是派生值，不是独立状态。** 它等于各类代表值之和（固定类取数量，随机类取**上限**）。任何改动各类数量的操作结束后都必须调用 `syncTotalFromConfig()`，否则界面与内部状态立刻脱节。
3. **分配余数只补小写类。** `applyTotal()` 先按比例向下取整，再把余数（可能为负）补到 `lower`；`lower` 为 0 时补到第一个非零类，全为 0 时退回 `lower` 或第 0 项。改动这个归属，就会出现「改完总长对不上」这类反复出现的 bug。
4. **随机类区间缩放要防除零。** 旧上限为 0 时，新下限固定为 0（`新下限 = round(旧下限 × 新上限 ÷ 旧上限)` 的分母就是它）。
5. **归一化时不要回写正在编辑的输入框。** 用户清空输入框后会继续输入，若此时把 `0` 写回去就会打断输入；只回写它的兄弟输入框。

历史提醒：v1 的规则是「大写严格 1–3 位，其余从小写+数字补齐」，那时最容易犯的错是把填充池写成全部启用类型的并集，导致大写突破 3 位。**该规则已被 v2 取代**，不要再按 v1 去改 `app.js`。

**改完必须抽样验证**，不能靠肉眼看几眼：

```javascript
// agent-browser eval，默认配置（四类随机 1–3）跑 200 次
var b=document.getElementById(`btn-generate`),p=document.getElementById(`password`),o=[];
for(var i=0;i<200;i++){b.click();o.push(p.textContent);}
// 断言：四类各自的数量都落在 1–3、总长落在 4–12、200 条互不重复
```

注意用例里的字符串字面量要写成反引号，原因见第七节。

## 四、随机数

用 `crypto.getRandomValues` + 拒绝采样，不用 `Math.random`，也不要用 `取模` 直接截断（有取模偏差）。`randomInt(maxExclusive)` 里的 `limit = 2^32 - (2^32 % maxExclusive)` 就是消除偏差的关键，别简化掉。

## 五、本机环境（Windows + PowerShell）

| 事项 | 结论 |
| --- | --- |
| Python | 用 Anaconda：`& "C:\Program\anaconda3\python.exe"`。`python`/`python3` 在 PATH 里指向别的解释器，不要用 |
| GitHub 直连 | **不通**（报 `Operation too slow. Less than 1000 bytes/sec`）。必须走代理 |
| 代理 | `http://127.0.0.1:7890` |
| 终端 | PowerShell，多行命令不要带换行符，用 `;` 串联 |

## 六、Git 纪律

1. **代理只做单次注入，不写进配置。** 用 `-c` 传参，命令结束后环境自动干净：

   ```powershell
   git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push origin main
   ```

   收尾时核验三处均无残留：`git config --global --get http.proxy`、`git config --local --get http.proxy`、`$env:HTTP_PROXY`。
2. **禁止对 `main` 强制推送。** 远端已有历史时，走「保留历史的合并」而不是覆盖：

   ```powershell
   git fetch origin main
   git merge origin/main --allow-unrelated-histories -X ours --no-commit
   git commit -m "Merge origin/main: ..."   # 冲突一律取本地（静态站版本）
   git push origin main                      # 结果是快进推送，无需 force
   ```

   本次远端 2 个提交全部保留，`37fb4d2..4013e41` 快进完成。
3. **提交前先看 `git status`。** 首次 `git add -A` 会把 `.codebuddy/plans/*.md` 一起带进去。误提交后的正确清理是 `git rm -r --cached .codebuddy`（保留磁盘文件）再补一条 commit，**不要** `--amend`，也不要用 `reset --hard` 抹掉。
4. `push` 前设 `$env:GIT_TERMINAL_PROMPT="0"`，凭据缺失时快速失败，避免命令卡死等待交互输入。本机 credential helper 是 `manager`，正常情况下可静默完成。
5. 只做用户明确要求的 Git 写操作（commit / push）。改完文件不等于要提交。

## 七、浏览器验证（agent-browser）

启动与收尾：

```powershell
agent-browser open "file:///C:/Users/afewm/Documents/Projects/RandomPassword/index.html"
agent-browser screenshot "C:\Users\afewm\AppData\Local\Temp\rp-check.png"
agent-browser close    # 无论成功失败都要执行，否则残留 daemon 和 Chromium 进程
agent-browser errors   # 收尾前必查页面错误
```

**最大的坑是 PowerShell 的引号传递**：`agent-browser eval` 的 JS 参数里只要含双引号，就会被 PowerShell 的 native 参数转发机制吃掉，报 `SyntaxError: Invalid or unexpected token`。

解法：**JS 里的字符串字面量一律用反引号**（模板字符串），整段 JS 用 PowerShell 单引号包裹：

```powershell
agent-browser eval 'document.getElementById(`btn-generate`).click()'
```

其他要点：

- 截图后自己 `read_file` 看一眼，不要只看命令退出码；
- 截图存到 `$env:TEMP`，验证完删掉，别污染仓库；
- 交互测试里用 `.click()` 而不是直接改 `.checked` / `.value`，前者才会触发事件；
- 复制功能的成败取决于「是否有真实用户手势」：`eval` 里调用会被拒绝并走降级提示，用 `agent-browser click "#btn-copy"` 才是真实路径。

## 八、样式与交互的三个具体教训

1. **移动端 `order` 要限定作用域。** 媒体查询里写 `.num { order: 1 }` 会连带把批量生成行的数量输入框挤到按钮后面，视觉顺序错乱。改用 `#total-length` 这样的 ID 选择器精确限定。
2. **切换模式只改 CSS 是不够的。** 固定态隐藏上限输入框靠 `.charset-row.is-fixed input[data-role="max"]`，但真正的状态同步在 `getConfig()` / `writeConfig()`；只改样式会造成界面与内部配置脱节。
3. **数字输入框的上下微调箭头会破坏极简观感**，用 `appearance: textfield` 与 `::-webkit-*-spin-button { appearance: none }` 去掉；同时把单类数量框压到 42px 宽才够紧凑。

## 九、改动后的验证清单

- [ ] 双击 `index.html`（`file://`）能正常运行，无 CORS / 网络报错
- [ ] 连续生成 200 次：四类数量都落在各自区间内、总长落在 `Σmin – Σmax`、结果无重复
- [ ] 把某一类切为固定并设值后，该类在每条密码中的数量恒定
- [ ] 改总长 → 各类数量按比例变化且 `Σ上限` 恰好等于总长；改各类数量 → 总长输入同步
- [ ] 区间下限为 0 时不产生空串；四类全部为 0 时被拦截并提示
- [ ] 复制按钮真实点击后写入剪贴板并给出「已复制」反馈
- [ ] 批量生成、历史记录上限（20 条）、二次确认清空均正常
- [ ] 390px 视口下布局不串行、不重叠
- [ ] `agent-browser errors` 无输出

## 十、已知取舍与待办

- **GitHub Pages 的 Source 需在仓库 Settings → Pages 手动设为 GitHub Actions**，这一步无法由代码完成，部署失败时先查这里。
- 历史记录写入 `localStorage` 失败时（隐私模式等）自动降级为内存数组，刷新即丢失，属预期行为。
- 复制在无用户手势的自动化环境下必然走失败分支，不要误判为 bug。
