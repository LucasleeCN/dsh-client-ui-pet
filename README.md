# dsh-client-ui-pet

DeepSeek Harness 官方 Web UI 的客户端宠物插件：在界面右下角注入一只**可拖拽的桌宠**，
参考 Codex Pets 的陪伴式交互与状态叠加层设计。宠物会跟随会话状态切换动作（思考 / 工作 /
完成 / 报错 / 睡觉…），支持点击抚摸、喂食、玩耍等轻养成互动，并提供一个完整的
**宠物设置面板**和 **window.dshPet 开发者 API**。

当前内置 1 只宠物——由用户提供的状态图生成的 JPG 宠物（WebP 内嵌，免主机重启）：

| id | 宠物 | 说明 |
| --- | --- | --- |
| `deepseek-whale` | **鲸鱼娘（原图）** | 由 `assets/deepseek-whale/` 下 8 个状态 PNG 抠背景、压缩为 WebP 后内嵌生成 |

> 手绘 SVG 内置宠（鲸鱼娘 / 橘猫 / 柴犬 / 史莱姆）已按用户要求移除；
> 如需恢复，取裁剪前的历史 `client.js`，或通过开发者工作室重新导入任意 SVG / raster 定义。

## 功能

### Codex 式状态陪伴

宠物通过 MutationObserver 感知 Harness Web UI 的真实活动信号：

- 在 `[data-composer-seat]` / `textarea` 中输入 → `typing`（注视键盘）
- 出现 `button[aria-label="停止生成"]` / `[data-state="running"]` → `thinking`（思考）
- 出现 `[data-streaming]` → `working`（忙碌）
- 运行结束 → `done`（完成庆祝，心情 +2、亲密度 +1）
- 出现 `[data-error]` → `error`（担心，心情 -3）
- 空闲超过设定时间 → `sleep`（睡觉 + Zzz 粒子）；任何活动或互动会唤醒

### 轻养成

- 心情（0-100）：随时间缓慢衰减，互动会恢复；低于 30 宠物会主动求关注。
- 亲密度（0-100）：只增不减，记录你们共同工作的羁绊。
- 互动统计：抚摸 / 喂食 / 玩耍次数。
- 数据按宠物独立保存到浏览器 `localStorage`。

### 用户自定义界面

设置面板（宠物工具栏齿轮按钮）包含 5 个页签：

1. **宠物**：图库选择内置 / 自定义宠物；一键四角定位、复位、隐藏。
2. **外观**：昵称、体型滑杆、每个宠物声明自己的调色板（`<input type="color">` 换色）。
3. **行为**：状态跟随 / 气泡台词 / 粒子特效 / 自动睡觉开关，入睡时间可选 1/3/5/10 分钟；
   每个状态都有手动预览按钮。
4. **养成**：心情与亲密度进度条、互动统计、重置数据。
5. **工作室**：粘贴 JSON 校验并导入自定义宠物、导出当前宠物定义、管理已导入列表。

宠物本身可以**直接拖拽**；同时提供四角定位按钮，满足 WCAG 2.2 对拖拽操作
必须有单指针替代方案的要求。宠物可聚焦，Enter / Space 抚摸，工具栏按钮均为 44px 触控目标，
`prefers-reduced-motion` 下自动关闭全部动画。

### JPG 主图宠物（raster 模式）

不想要手绘 SVG？把一张 JPG/PNG/WebP 交给插件即可作为宠物：引擎会在图片外套上
状态动画（呼吸 / 点头 / 弹跳 / 拖拽 / 睡觉…），气泡、粒子、互动、养成与设置面板全部复用。
JPG 宠物不支持换色（保留原图配色），其余外观选项照常可用。

```jsonc
{
  "id": "my-jpg-pet",
  "name": "我的 JPG 宠物",
  "mode": "raster",                    // 启用图片模式
  "image": "/plugins/dsh-client-ui-pet/assets/my-pet/idle.webp",
  // 可选：为不同状态指定不同图片；缺省的状态回退到 image
  "images": { "sleep": "/plugins/dsh-client-ui-pet/assets/my-pet/sleep.webp" },
  "states": { "idle": { "hold": true } },
  "behaviors": []
}
```

`image` / `images` 只接受三种来源（其余会被校验拒绝）：`data:image/...;base64`、
`http(s)://`、或 `/` 开头的同源路径。把图片放在本包 `assets/<宠物>/` 目录下，
Host 半侧会自动把它们发布到 `/plugins/dsh-client-ui-pet/assets/<宠物>/<文件>`
（Host 半侧代码更新后需要重启一次 Harness Web 才会生效）。

**免重启内嵌路线**（当前 `deepseek-whale` 用的就是它）：

```powershell
python scripts\make-raster-pet.py assets\<宠物id> --name "宠物名" --embed
node scripts\embed-pet.mjs assets\<宠物id>\<宠物id>.embed.definition.json
```

第一条命令抠背景 / 缩放 / 压缩为 WebP 并内联成 `data:image/webp;base64`；
第二条把定义嵌入 `lib/client.js` 的内置宠物列表。同步 `client.js` 后刷新页面即可。


### 开发者完全自定义：dshPetDefinition

动作、行为、表现全部由定义数据驱动。定义是一个 JSON 对象：

```jsonc
{
  "id": "pudding-ghost",          // /^[a-z0-9][a-z0-9_-]{1,39}$/i
  "name": "布丁幽灵",
  "version": "1.0.0",
  "author": "you",
  "description": "示例宠物",
  "size": { "min": 64, "max": 240, "default": 112 },
  "colors": [
    { "key": "primary", "label": "身体", "default": "#c084fc" }
  ],
  // 内联 SVG 标记。颜色用 var(--dsh-pet-c-<key>, 默认色) 引用，
  // 这样设置面板的换色器会自动生效。
  "svg": "<g class=\"p-body\">…</g>",
  // 只作用于本 SVG 的 CSS：关键帧 + 状态选择器。
  // 引擎会把 data-state 同步到 .dsh-pet-root 分组和 svg 元素上。
  "style": ".dsh-pet-root[data-state=\"idle\"] .p-body { animation: pet-bob 3s infinite; } …",
  "states": {
    "idle":  { "label": "空闲", "hold": true },
    "happy": { "label": "开心", "durationMs": 1800 }
  },
  "behaviors": [
    {
      "trigger": "activity:done",   // 或数组；见下方触发器表
      "state": "happy",
      "bubbles": ["完成啦！"],
      "effect": "sparkles",         // 内置：hearts/sparkles/food/note/zzz/drop/star
      "mood": 2,                    // 心情变化
      "affinity": 1,                // 亲密度变化
      "hold": false,                // true = 事件持续期间保持状态
      "cooldownMs": 0
    }
  ],
  "interactions": {
    "pet":  { "state": "happy", "effect": "hearts", "mood": 5, "affinity": 1 },
    "feed": { "state": "happy", "effect": "food",   "mood": 12, "affinity": 2 },
    "play": { "state": "happy", "effect": "sparkles", "mood": 8, "affinity": 2 }
  },
  "bubbles": { "idle": ["我在这里～"] }
}
```

约定与扩展点：

- `states` 必须包含 `idle`；`durationMs=0` + `hold:true` 表示常驻状态。
- `style` 里的选择器使用 `.dsh-pet-root[data-state="<状态>"] .部分类名` 为不同状态绑定关键帧。
- 表情切换：在 `svg` 中放置 `<g class="dsh-pet-expr" data-expr-default>` 和
  `<g class="dsh-pet-expr" data-expr="happy">`，在 `style` 中按状态切换 `display`。
- `effects` 可扩展自定义粒子（`{ id: { svg, durationMs } }`）。
- 开发者定义的 SVG / CSS 会经过消毒（移除脚本、事件属性和 `javascript:`）。

内置触发器：`activity:typing`、`activity:thinking`、`activity:working`、
`activity:done`、`activity:error`、`sleep`、`wake`、`birth`、`mood:low`、
`interaction:pet`、`interaction:feed`、`interaction:play`；
另外可随时通过 `window.dshPet.trigger("your:custom-trigger")` 触发自定义行为。

### 开发者 API

```js
window.dshPet.version                 // 插件版本
window.dshPet.listPets()              // [{ id, name, version, builtin }]
window.dshPet.registerPet(def, opts)  // 注册自定义宠物（opts.persist=false 仅本次会话）
window.dshPet.unregisterPet(id)       // 删除自定义宠物
window.dshPet.getDefinition(id?)      // 深拷贝当前/指定宠物定义
window.dshPet.selectPet(id)
window.dshPet.setState("happy", { hold: true, bubbles: false, text: "…", effect: "hearts" })
window.dshPet.trigger("interaction:pet")
window.dshPet.importPet(json, opts)   // 接受 JSON 字符串或对象
window.dshPet.exportCurrentPet()      // 返回格式化 JSON 字符串
window.dshPet.current()               // { id, state }
window.dshPet.getState()              // 当前状态名
window.dshPet.on("state", handler)    // "state" | "trigger" | "select" | "register" | "unregister"
```

## 安装

该插件是标准 `dsh.client` 双面包：Host 半侧为空 Loader 入口，Browser 半侧注入全部 UI。

### 方法 A：profile bundle（推荐）

编辑 `<DSH_HOME>/profiles/web/package.json`：

```json
{
  "dependencies": {
    "dsh-client-ui-pet": "file:D:/Softwares/CodeSoftWares/Agents/dsh-client-ui-pet"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-client-ui-pet"
      ]
    }
  }
}
```

安装依赖后重启 DeepSeek Harness Web（已打开的页面刷新即可）。

### 方法 B：手动插入 Loader 行

1. 将插件目录复制到 `<DSH_HOME>/profiles/web/node_modules/dsh-client-ui-pet`。
2. 编辑 `<DSH_HOME>/profiles/web/cordis.patch.yml`：

   ```yaml
   - insert:
       - id: ui-pet
         name: 'dsh-client-ui-pet'
         config:
           enabled: true
   ```

3. 刷新 Harness Web 页面（或重启 Web）。

验证：右下角出现 DeepSeek 鲸鱼娘，点击可抚摸，悬停出现工具栏，齿轮打开设置面板。

## 目录结构

```text
dsh-client-ui-pet/
├─ package.json
├─ cordis.patch.yml
├─ LICENSE
├─ README.md
├─ lib/
│  ├─ index.js                # Host 半侧（assets 静态资源路由）
│  └─ client.js               # Browser 半侧（引擎 + 内置鲸鱼娘 + 面板 + API）
├─ assets/
│  ├─ README.txt              # 图片放置说明
│  └─ deepseek-whale/         # 鲸鱼娘（原图）素材 + 生成的 WebP + 定义 JSON
├─ scripts/
│  ├─ make-raster-pet.py      # JPG/PNG → 抠背景 → WebP → 定义 JSON
│  ├─ embed-pet.mjs           # 把 --embed 定义写入 client.js 内置列表
│  ├─ prune-builtins.mjs      # 移除手绘 SVG 内置宠（保留 raster 槽）
│  ├─ verify-live.mjs         # CDP 真机探针（8787）
│  └─ verify-raster-live.mjs  # CDP raster 注入探针
├─ test/
│  └─ client.test.mjs         # node:vm 假 DOM 自动化测试（17 个用例）
├─ preview/
│  ├─ index.html              # 独立预览页（可模拟 Harness 活动信号）
│  ├─ raster-demo.html        # JPG 宠物渲染验证页（?pet=<id>&embed=1）
│  ├─ server.mjs              # 本地静态服务器（npm run preview）
│  ├─ preview.png             # 手绘版预览截图
│  └─ deepseek-whale.png      # 鲸鱼娘（原图）预览截图
├─ examples/
│  └─ pudding-ghost.json      # 自定义宠物定义示例（可直接导入工作室）
└─ .github/workflows/
   ├─ check.yml
   └─ release.yml
```

## 开发

```powershell
npm run check    # 语法检查 + 自动化测试
npm run preview  # 打开 http://127.0.0.1:4173/preview/ 独立预览
```

预览页可模拟「停止生成」按钮、`[data-streaming]`、`[data-state="running"]`、
`[data-error]` 与 composer 输入，用来观察宠物状态切换；URL hash 可直接切状态，如
`/preview/#happy`。

## 隐私

纯浏览器端插件：不读取 API Key，不修改模型输入，不上传任何数据。
设置、养成数据和导入的自定义宠物只保存在本机浏览器 `localStorage`。

## License

MIT
