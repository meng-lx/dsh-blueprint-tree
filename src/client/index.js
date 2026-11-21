// dsh-blueprint-tree 客户端 bundle —— 第一层：**项目**。
//
// 用户 2026-11-15（原话）：
//   「开始做界面吧，界面做到侧边栏，和后台的沟通全走做的几个方法，
//    进入插件的地方也放在侧边栏，一层一层做，先做项目相关」
//
// ⇒ 这一层只做一件事：侧边栏一个「蓝图」标签，打开是**项目列表**，
//   能新建 / 打开 / 删除。所有数据走 Host 的一条 HTTP 路由，
//   Client 侧不碰磁盘（浏览器也碰不到）。
//
// 为什么是 .js 而不是 .ts：Client 半边跑在**浏览器**里，没有 Node 的类型擦除，
// 所以这里只能是纯 JS + React.createElement（无 JSX）。
//
// ⚠ 本文件里**唯一的插件名字面量**是下面那行 PKG —— 它必须等于 package.json
//   的 `name`（客户端模块注册表的键就是它）。其余标识全部从它派生。

var PKG = 'dsh-blueprint-tree'

window.__ModuleLoader__.load({
  id: PKG,
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    exports.name = PKG
    exports.inject = ['slots']

    /** Host 侧注册的那条路由（见 src/host/index.ts） */
    var API_PATH = '/blueprint-tree/api'
    /** 面板标题 */
    var 标题 = '蓝图'
    /** 座位 key = 标签类型 id */
    var TAB_ID = PKG
    /** 页地址（写进 tab 记录，别随便改） */
    var TAB_KIND = 'blueprint-tree-blueprint'

    // ═══════════════════════════════════════════════════════════
    // 跟 Host 说话
    // ═══════════════════════════════════════════════════════════

    /**
     * 调一条命令。
     * @param {string} command 命令名（project.list / project.create / ...）
     * @param {object} params  参数
     * @returns {Promise<{ok:boolean, 数据?:object, 错误?:{类型:string,消息:string}}>}
     */
    function 调(command, params) {
      return fetch(API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cmd: command, 参数: params || {} }),
      })
        .then(function (r) {
          return r.json()
        })
        .catch(function (e) {
          return { ok: false, 错误: { 类型: '网络', 消息: String(e) } }
        })
    }

    // ═══════════════════════════════════════════════════════════
    // 毛玻璃底色（用户 2026-11-18）
    //   「把页面底色改成毛玻璃的，只改目前白色的那部分，透明度雾化保真度，
    //    三个先放设置json文件里」
    //
    // ⇒ 只作用在**面板底色**这一层（原来是 var(--dsw-alias-bg-primary, #fff)），
    //   三个参数先放插件根目录的 主题设置.json，读不到就用这里的默认值。
    //   配方参考同机已装的美化插件 dsh-plugin-wallpaper-engine-glass：
    //   大半径模糊 + 固定饱和度 + brightness/contrast 提亮，再叠一层自上而下的
    //   高光渐变（那层高光才是「像玻璃」的关键，纯模糊只会糊成灰）。
    // ═══════════════════════════════════════════════════════════

    /**
     * 默认值（json 读不到 / 缺字段时兜底）。
     *
     * 分组：根 = 面板底色；画布 = 蓝图页画布底；单元 / 共享单元 = 单元填充。
     * 「颜色」收 6 位或 8 位十六进制（`#rrggbb` / `#rrggbbaa`，`#` 可省）；
     * 8 位里的 aa 会**乘**在「透明度」上，所以两个都能单独调。
     *
     * 性能（用户 m12673 提醒）：真正吃 GPU 的是 backdrop-filter，它是 O(合成面积)，
     * 而且**嵌套会叠加**（子元素再模糊父层已经模糊过的东西）。这套里只有「根」
     * 默认挂滤镜，画布和单元默认 滤镜:false —— 它们靠在半透明色 + 高光渐变上出玻璃感。
     * 单元数量一多（几百个）再给每个单元挂 blur，滚动/缩放会掉帧，所以默认关。
     */
    var 玻璃默认 = {
      颜色: '#ffffff',
      透明度: 0.55,
      雾化: 18,
      保真度: 1.4,
      滤镜: true,
      画布: { 颜色: '#ffffff', 透明度: 0.55, 雾化: 18, 保真度: 1.4, 滤镜: false },
      // 单元「类型 → 形状」不可设置；这里只管另外两条：
      // 外框 = 标签（强制/广播/并发/无），填充 = 状态（正常/提醒/报错/废弃/失效）
      外框: {
        粗细: 3,
        透明度: 0.95,
        雾化: 6,
        保真度: 1.2,
        滤镜: false,
        强制: '#2563eb',
        广播: '#bf8700',
        并发: '#8250df',
        无: '#8c959f',
      },
      填充: {
        // 用户 2026-11-22：状态颜色对比度要更明显 ⇒ 透明度抬到 0.9、六种状态改成六种色相
        // 正常=蓝灰 / 提醒=琥珀 / 报错=红 / 废弃=紫灰 / 失效=深灰 / 断联=浅灰
        透明度: 0.9,
        雾化: 18,
        保真度: 1.4,
        滤镜: false,
        正常: '#c9d7e8',
        提醒: '#ffd166',
        报错: '#f28482',
        废弃: '#b9a7d9',
        失效: '#9aa0a6',
        断联: '#e5e8eb',
      },
      // 向量箭头跟外框同一套做法：颜色 + 粗细 + 透明度/雾化/保真度
      向量: {
        粗细: 1.6,
        透明度: 0.85,
        雾化: 6,
        保真度: 1.2,
        滤镜: false,
        颜色: '#57606a',
        循环颜色: '#cf222e',
      },
    }
    var 玻璃 = 玻璃合(玻璃默认, {})
    /** 设置读回来后通知重画（面板挂载时登记，卸载时撤销） */
    var 玻璃听众 = []

    /** 深合并一层（根字段 + 四个分组），null/非对象不覆盖 */
    function 玻璃合(底, 上) {
      var 出 = {}
      for (var k in 底) 出[k] = 底[k]
      for (var k2 in 上 || {}) {
        var v = 上[k2]
        if (v && typeof v === 'object' && !Array.isArray(v)) 出[k2] = 玻璃合(底[k2] || {}, v)
        else if (v !== undefined && v !== null && v !== '') 出[k2] = v
      }
      return 出
    }

    function 玻璃夹(值, 低, 高) {
      if (值 === undefined || 值 === null || 值 === '') return null
      var n = Number(值)
      if (!isFinite(n)) return null
      return Math.min(高, Math.max(低, n))
    }

    /** 取某组的设置（组名：'' = 根 / '画布' / '外框' / '填充' / '向量'） */
    function 玻璃组(组) {
      if (!组) return 玻璃
      return 玻璃[组] || 玻璃默认[组] || {}
    }

    /** `#rrggbb` / `#rrggbbaa` → { r, g, b, a }；认不出就返回 null */
    function 拆色(值) {
      var s = String(值 === undefined || 值 === null ? '' : 值).trim()
      if (s.charAt(0) === '#') s = s.slice(1)
      if (s.length !== 6 && s.length !== 8) return null
      if (!/^[0-9a-fA-F]+$/.test(s)) return null
      var r = parseInt(s.slice(0, 2), 16)
      var g = parseInt(s.slice(2, 4), 16)
      var b = parseInt(s.slice(4, 6), 16)
      var a = s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1
      return { r: r, g: g, b: b, a: a }
    }

    /** 组件底色：颜色 × 透明度（8 位码的 aa 会乘上去） */
    function 玻璃色(组) {
      var 值 = 玻璃组(组)
      var 色 = 拆色(值.颜色) || 拆色((组 ? 玻璃默认[组] : 玻璃默认).颜色) || { r: 255, g: 255, b: 255, a: 1 }
      var 透 = 玻璃夹(值.透明度, 0, 1)
      if (透 === null) 透 = 玻璃夹(玻璃默认.透明度, 0, 1)
      var a = Math.max(0, Math.min(1, 色.a * 透))
      return 'rgba(' + 色.r + ',' + 色.g + ',' + 色.b + ',' + a.toFixed(3) + ')'
    }

    /** 底色渐变：同色三段（上厚下薄），那层高光才是「像玻璃」的关键 */
    function 玻璃底(组) {
      var 值 = 玻璃组(组)
      var 色 = 拆色(值.颜色) || 拆色((组 ? 玻璃默认[组] : 玻璃默认).颜色) || { r: 255, g: 255, b: 255, a: 1 }
      var 透 = 玻璃夹(值.透明度, 0, 1)
      if (透 === null) 透 = 玻璃夹(玻璃默认.透明度, 0, 1)
      var a = Math.max(0, Math.min(1, 色.a * 透))
      var 上 = Math.min(1, a * 1.25 + 0.08)
      var 下 = Math.max(0, a * 0.82)
      function c(x) {
        return 'rgba(' + 色.r + ',' + 色.g + ',' + 色.b + ',' + x.toFixed(3) + ')'
      }
      return 'linear-gradient(180deg, ' + c(上) + ' 0%, ' + c(a) + ' 46%, ' + c(下) + ' 100%)'
    }

    /** 雾化 + 保真度 → backdrop-filter */
    function 玻璃滤镜(组, 倍) {
      var 值 = 玻璃组(组)
      var 雾 = 玻璃夹(值.雾化, 0, 80)
      if (雾 === null) 雾 = 玻璃默认.雾化
      var 保 = 玻璃夹(值.保真度, 0, 4)
      if (保 === null) 保 = 玻璃默认.保真度
      return (
        'blur(' + (雾 * (倍 || 1)).toFixed(1) + 'px) saturate(' + 保.toFixed(2) + ') ' +
        'brightness(1.04) contrast(1.01)'
      )
    }

    /** 一层的玻璃样式；`滤镜` 为 false 时只上色、不挂 backdrop-filter（省 GPU） */
    function 玻璃层样式(组, 倍) {
      var 值 = 玻璃组(组)
      var 开 = 值.滤镜 !== false && !(值.滤镜 === '否' || 值.滤镜 === 0)
      var 出 = { background: 玻璃底(组) }
      if (开) {
        出.backdropFilter = 玻璃滤镜(组, 倍)
        出.WebkitBackdropFilter = 玻璃滤镜(组, 倍)
      }
      return 出
    }

    /** 面板根节点的玻璃样式（叠在 样式.根 上） */
    function 玻璃根样式() {
      return Object.assign({}, 玻璃层样式('', 1), {
        // 顶边一道 1px 反光 + 外投影，玻璃才有厚度
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.72), 0 8px 30px rgba(15,23,42,.08)',
      })
    }

    /** 画布那层原来是不透的 #f6f8fa，换成画布组（默认不挂滤镜） */
    function 玻璃画布样式() {
      return 玻璃层样式('画布', 1)
    }

    /** 某组里某个键的颜色 → rgba（alpha = 颜色自带 aa × 组的透明度）；缺色用兜底 */
    function 组色(组, 键, 兜底) {
      var 值 = 玻璃组(组)
      var 色 = 拆色(值[键]) || 拆色(兜底) || { r: 140, g: 149, b: 159, a: 1 }
      var 透 = 玻璃夹(值.透明度, 0, 1)
      if (透 === null) 透 = 1
      return 'rgba(' + 色.r + ',' + 色.g + ',' + 色.b + ',' + Math.min(1, 色.a * 透).toFixed(3) + ')'
    }

    /** 组里的数值项（粗细之类） */
    function 组数(组, 键, 低, 高, 兜底) {
      var v = 玻璃夹(玻璃组(组)[键], 低, 高)
      return v === null ? 兜底 : v
    }

    /** 外框 = 标签（用户 m12745：标签对应边框，可设颜色，粗细与毛玻璃属性共用） */
    function 外框色(标签) {
      return 组色('外框', 标签 || '无', 玻璃默认.外框.无)
    }
    function 外框粗细() {
      return 组数('外框', '粗细', 0.5, 8, 2)
    }

    /** 填充 = 状态（用户 m12745：状态对应填充，不同状态不同颜色） */
    function 填充色(状态) {
      return 组色('填充', 状态 || '正常', 玻璃默认.填充.正常)
    }

    /** 向量箭头：和外框同一套做法 */
    function 向量色(红) {
      return 组色('向量', 红 ? '循环颜色' : '颜色', 红 ? 玻璃默认.向量.循环颜色 : 玻璃默认.向量.颜色)
    }
    function 向量粗细() {
      return 组数('向量', '粗细', 0.5, 8, 1.6)
    }

    /**
     * 外框 / 向量 这类「线条」的毛玻璃属性：SVG 线条没有 backdrop-filter 可挂，
     * 所以 滤镜:true 时用一层很浅的投影当玻璃边的柔光（雾化 = 半径，保真度 = 浓度）。
     */
    function 组滤镜(组) {
      var 值 = 玻璃组(组)
      if (值.滤镜 !== true) return undefined
      var 雾 = 玻璃夹(值.雾化, 0, 60)
      var 浓 = 玻璃夹(值.保真度, 0.5, 3)
      if (雾 === null) 雾 = 6
      if (浓 === null) 浓 = 1
      return { filter: 'drop-shadow(0 1px ' + 雾 + 'px rgba(0,0,0,' + Math.min(0.45, 0.12 * 浓).toFixed(2) + '))' }
    }

    /**
     * 读 主题设置.json。客户端不许碰磁盘，也不能读插件目录，
     * 所以走的是「插件资源路径」；这个地址拿不到（部署形态不同）就保持默认值，
     * 功能不受影响 —— 三个值仍然在 json 里，改完刷新页面生效。
     */
    function 读玻璃设置() {
      var 地址们 = [
        '/?dsh-blueprint-tree/主题设置.json',
        '/plugins/?dsh-blueprint-tree/主题设置.json',
        '/plugins/dsh-blueprint-tree/主题设置.json',
        '/plugins/' + PKG + '/主题设置.json',
      ]
      function 试(i) {
        if (i >= 地址们.length) return Promise.resolve(false)
        return fetch(地址们[i], { cache: 'no-store' })
          .then(function (r) {
            return r.ok ? r.json() : null
          })
          .then(function (j) {
            var 玻 = j && (j.玻璃 || j)
            if (!玻 || typeof 玻 !== 'object') return 试(i + 1)
            玻璃 = 玻璃合(玻璃默认, 玻)
            玻璃听众.slice().forEach(function (f) {
              try {
                f()
              } catch (e) {}
            })
            return true
          })
          .catch(function () {
            return 试(i + 1)
          })
      }
      return 试(0)
    }

    // ═══════════════════════════════════════════════════════════
    // 样式（全部走主题 token，深浅色自动跟随）
    // ═══════════════════════════════════════════════════════════

    var 样式 = {
      根: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        font: '13px/1.5 var(--dsw-font-family, system-ui, sans-serif)',
        color: 'var(--dsw-alias-text-primary, #1f2328)',
        background: 'var(--dsw-alias-bg-primary, #fff)',
      },
      头: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,.08))',
        flex: '0 0 auto',
      },
      项目名: {
        flex: '1 1 auto',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: 600,
      },
      按钮: {
        flex: '0 0 auto',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,.12))',
        background: 'var(--dsw-alias-bg-secondary, rgba(0,0,0,.03))',
        color: 'inherit',
        borderRadius: 6,
        padding: '3px 9px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 12,
      },
      列表: {
        flex: '1 1 auto',
        overflow: 'auto',
        padding: 8,
      },
      行: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 9px',
        borderRadius: 8,
        cursor: 'pointer',
        // 按住 Shift 点选区间时，浏览器默认会把文字也划上（用户 2026-11-16）
        userSelect: 'none',
        WebkitUserSelect: 'none',
      },
      行选中: {
        background: 'var(--dsw-alias-bg-active, rgba(59,130,246,.12))',
      },

      // 蓝图页的工具栏（用户 2026-11-16：蓝笔画的地方）
      工具条: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '5px 10px',
        borderBottom: '1px solid var(--dsw-alias-border, #d0d7de)',
        flexShrink: 0,
        flexWrap: 'wrap',
        fontSize: 12,
      },
      小按钮: {
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '18px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border, #d0d7de)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      小按钮亮: {
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '18px',
        borderRadius: 6,
        border: '1px solid #0969da',
        background: 'rgba(59,130,246,.12)',
        color: '#0969da',
        cursor: 'pointer',
      },
      小按钮灰: {
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '18px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border, #d0d7de)',
        background: 'transparent',
        color: '#8c959f',
        cursor: 'not-allowed',
        opacity: 0.6,
      },
      行名: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      空: {
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--dsw-alias-text-tertiary, #8b949e)',
        lineHeight: 1.8,
      },
      状态: {
        padding: '6px 12px',
        fontSize: 12,
        color: 'var(--dsw-alias-text-tertiary, #8b949e)',
        borderTop: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,.08))',
        flex: '0 0 auto',
      },
      遮罩: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,.28)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      },
      弹窗: {
        width: 'min(360px, 86%)',
        background: 'var(--dsw-alias-bg-primary, #fff)',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,.12))',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,.18)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      输入: {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,.14))',
        background: 'var(--dsw-alias-bg-secondary, rgba(0,0,0,.03))',
        color: 'inherit',
        borderRadius: 6,
        padding: '6px 9px',
        font: 'inherit',
      },
      弹窗按钮行: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
    }

    // ═══════════════════════════════════════════════════════════
    // 图标
    // ═══════════════════════════════════════════════════════════

    function 图标(props) {
      var size = (props && props.size) || 16
      return React.createElement(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('rect', {
          x: 1.5,
          y: 1.5,
          width: 5,
          height: 4,
          rx: 1,
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        React.createElement('rect', {
          x: 9.5,
          y: 1.5,
          width: 5,
          height: 4,
          rx: 1,
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        React.createElement('rect', {
          x: 5.5,
          y: 10.5,
          width: 5,
          height: 4,
          rx: 1,
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        React.createElement('path', {
          d: 'M4 5.5v2.2h8V5.5M8 7.7v2.8',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
        }),
      )
    }

    // ═══════════════════════════════════════════════════════════
    // 蓝图层 —— 形状 + 填充色 + 边框 + 箭头
    //
    // 用户 2026-11-15 原话：
    //   「蓝图会按照形状和颜色区分单元，用箭头表示向量，双击子蓝图单元会进入子蓝图，
    //    上方用类似目录的方式展示主蓝图>>子蓝图1>>子蓝图2这种，
    //    形状上开始是倒三角，结束正三角，软单元是圆，硬单元方，选择单元菱形，
    //    标签是填充颜色，状态是边框，其中失效是灰白色的边框+填充，其他颜色你看着办吧」
    // ═══════════════════════════════════════════════════════════

    // 用户 m12745 定下映射：类型→形状（不可设）、标签→边框、状态→填充、向量→同边框
    // 颜色/粗细/透明度都在 主题设置.json 的 外框 / 填充 / 向量 三组里，这里只取用

    /** 一个单元怎么画（形状由「类型」定，参数是中心点） */
    /** 单元图形下沿的 y（创建向量的小圆圈要压在图形边缘上，用户 2026-11-16） */
    function 形下沿(u, cy) {
      if (u.类型 === '开始') return cy + 23
      if (u.类型 === '结束') return cy + 19
      if (u.类型 === '软') return cy + 22
      if (u.类型 === '选择') return cy + 24
      if (u.类型 === '子蓝图') return cy + 23
      return cy + 22
    }

    /** 单元图形上沿的 y（向量从正上方垂直进来） */
    function 形上沿(u, cy) {
      if (u.类型 === '开始') return cy - 19
      if (u.类型 === '结束') return cy - 23
      if (u.类型 === '软') return cy - 22
      if (u.类型 === '选择') return cy - 24
      if (u.类型 === '子蓝图') return cy - 23
      return cy - 22
    }

    /** 从 a 朝 b 走 距离，用于把多边形顶点切成圆角 */
    function 沿线(a, b, 距离) {
      var dx = b.x - a.x
      var dy = b.y - a.y
      var 长 = Math.sqrt(dx * dx + dy * dy) || 1
      var 取 = Math.min(距离, 长 / 2)
      return { x: a.x + (dx / 长) * 取, y: a.y + (dy / 长) * 取 }
    }

    /** 多边形 → 圆角路径（每个顶点用二次曲线切一下，用户 m12881「都加一点圆角」） */
    function 圆角路径(点们, 半径) {
      var n = 点们.length
      var d = ''
      for (var i = 0; i < n; i++) {
        var 前 = 点们[(i - 1 + n) % n]
        var 当 = 点们[i]
        var 后 = 点们[(i + 1) % n]
        var 入 = 沿线(当, 前, 半径)
        var 出 = 沿线(当, 后, 半径)
        d += (i === 0 ? 'M' : 'L') + 入.x.toFixed(2) + ',' + 入.y.toFixed(2)
        d += 'Q' + 当.x.toFixed(2) + ',' + 当.y.toFixed(2) + ' ' + 出.x.toFixed(2) + ',' + 出.y.toFixed(2)
      }
      return d + 'Z'
    }

    /** 向量的两端：正下方出、正上方进 */
    function 出点(u, c) {
      return { x: c.x, y: 形下沿(u, c.y) }
    }
    function 入点(u, c) {
      return { x: c.x, y: 形上沿(u, c.y) }
    }

    function 单元图形(u, cx, cy, 点, 选中) {
      var 类型 = u.类型
      // 填充 = 状态色，边框 = 标签色（用户 m12745）；颜色与透明度都来自 主题设置.json
      var 描边 = { fill: 填充色(u.状态), stroke: 外框色(u.标签), strokeWidth: 外框粗细() }

      var 形
      if (类型 === '开始') {
        // 倒三角（用户 m12881：三角加大、加圆角）
        形 = React.createElement('path', {
          d: 圆角路径(
            [
              { x: cx - 28, y: cy - 19 },
              { x: cx + 28, y: cy - 19 },
              { x: cx, y: cy + 23 },
            ],
            9,
          ),
          style: 描边,
        })
      } else if (类型 === '结束') {
        // 正三角
        形 = React.createElement('path', {
          d: 圆角路径(
            [
              { x: cx, y: cy - 23 },
              { x: cx + 28, y: cy + 19 },
              { x: cx - 28, y: cy + 19 },
            ],
            9,
          ),
          style: 描边,
        })
      } else if (类型 === '软') {
        // 圆
        形 = React.createElement('circle', { cx: cx, cy: cy, r: 22, style: 描边 })
      } else if (类型 === '选择') {
        // 菱形
        形 = React.createElement('path', {
          d: 圆角路径(
            [
              { x: cx, y: cy - 24 },
              { x: cx + 30, y: cy },
              { x: cx, y: cy + 24 },
              { x: cx - 30, y: cy },
            ],
            8,
          ),
          style: 描边,
        })
      } else if (类型 === '子蓝图') {
        // 正六边形（用户 m12881：六边形改正六边形）
        var 半径 = 27
        var 竖 = 半径 * 0.8660254
        形 = React.createElement('path', {
          d: 圆角路径(
            [
              { x: cx - 半径, y: cy },
              { x: cx - 半径 / 2, y: cy - 竖 },
              { x: cx + 半径 / 2, y: cy - 竖 },
              { x: cx + 半径, y: cy },
              { x: cx + 半径 / 2, y: cy + 竖 },
              { x: cx - 半径 / 2, y: cy + 竖 },
            ],
            7,
          ),
          style: 描边,
        })
      } else if (类型 === '循环向量') {
        // 往回指的弧形小箭（回边变成节点）
        形 = React.createElement('circle', {
          cx: cx,
          cy: cy,
          r: 14,
          style: 描边,
          strokeDasharray: '5 3',
        })
      } else {
        // 硬（默认）：方
        形 = React.createElement('rect', { x: cx - 32, y: cy - 22, width: 64, height: 44, rx: 10, style: 描边 })
      }

      return React.createElement(
        'g',
        {
          key: u.名,
          onClick: 点,
          style: Object.assign({}, 点 ? { cursor: 'pointer' } : null, 组滤镜('外框')),
        },
        // 选中标记（用户 2026-11-16）：虚线框套在外面
        选中
          ? React.createElement('rect', {
              x: cx - 34,
              y: cy - 30,
              width: 68,
              height: 60,
              rx: 8,
              fill: 'none',
              stroke: '#0969da',
              strokeWidth: 1.5,
              strokeDasharray: '4 3',
              style: { pointerEvents: 'none' },
            })
          : null,
        React.createElement('title', null, u.名 + '（' + 类型 + ' / ' + (u.标签 || '无') + ' / ' + (u.状态 || '?') + '）'),
        形,
        React.createElement(
          'text',
          {
            x: cx,
            y: cy + 4,
            textAnchor: 'middle',
            fontSize: 11,
            fill: u.状态 === '失效' || u.状态 === '断联' ? '#3d444d' : '#1f2328',
            style: { pointerEvents: 'none', userSelect: 'none' },
          },
          名短(u.名),
        ),
      )
    }

    /** 名字太长就截断（完整名字在 <title> 里） */
    function 名短(s) {
      if (!s) return ''
      return s.length <= 8 ? s : s.slice(0, 7) + '…'
    }

    /**
     * 自动布局：从「开始」往下分层，每层横着排。
     * 没连到的单元放到最后一层（用户没要求手排，先自动，以后接拖拽）。
     */
    function 算布局(图) {
      var 单元们 = (图 && 图.单元) || []
      var 表 = {}
      for (var i = 0; i < 单元们.length; i++) 表[单元们[i].名] = 单元们[i]

      var 起点 = (图 && 图.开始) || ''
      if (!起点) {
        for (var j = 0; j < 单元们.length; j++) {
          if (单元们[j].类型 === '开始') { 起点 = 单元们[j].名; break }
        }
      }

      var 层 = {}
      var 队 = []
      if (起点 && 表[起点]) { 层[起点] = 0; 队.push(起点) }
      while (队.length) {
        var 名 = 队.shift()
        var u = 表[名]
        var 下层 = (u && u.下层) || []
        for (var k = 0; k < 下层.length; k++) {
          var 下 = 下层[k]
          if (下 === '$结束' || !表[下]) continue
          // 循环向量不占层：把它当一根线，直接透传到它指向的目标（用户 m05844）
          if (表[下].类型 === '循环向量') {
            var 再 = 表[下].下层 || []
            for (var q = 0; q < 再.length; q++) {
              var 真 = 再[q]
              if (真 === '$结束' || !表[真]) continue
              if (层[真] === undefined) { 层[真] = 层[名] + 1; 队.push(真) }
            }
            continue
          }
          if (层[下] === undefined) { 层[下] = 层[名] + 1; 队.push(下) }
        }
      }

      // 没被走到过的 → 最后一层
      // ⚠️ 先定死「最后一层」再赋值：原来一边赋值一边抬最大层，
      // 后面那些没被走到过的会被推到 最大层+1、+2…，而「分层」数组已经按旧值建好了 ⇒ 越界崩
      var 最大层 = 0
      for (var a in 层) if (层[a] > 最大层) 最大层 = 层[a]
      var 落单层 = 最大层 + 1
      for (var b = 0; b < 单元们.length; b++) {
        var 名2 = 单元们[b].名
        if (层[名2] === undefined) 层[名2] = 落单层
      }
      if (落单层 > 最大层) 最大层 = 落单层

      // 每层放进一个数组
      var 分层 = []
      for (var n = 0; n <= 最大层; n++) 分层.push([])
      for (var c = 0; c < 单元们.length; c++) {
        // 循环向量画成红色箭头，不占格子（用户 m05844）
        if (单元们[c].类型 === '循环向量') continue
        var 该层 = 层[单元们[c].名]
        if (分层[该层] === undefined) 分层[该层] = []
        分层[该层].push(单元们[c].名)
      }

      // 坐标
      var 结果 = {}
      var 宽 = 150
      var 高 = 110
      for (var m = 0; m < 分层.length; m++) {
        var 行 = 分层[m]
        for (var p = 0; p < 行.length; p++) {
          结果[行[p]] = { x: 60 + p * 宽, y: 50 + m * 高 }
        }
      }

      // 蓝图里存了坐标就按坐标摆（用户 2026-11-16：「自动排列」会把坐标写进蓝图）
      for (var d = 0; d < 单元们.length; d++) {
        var 存 = 单元们[d].坐标
        if (存 && 存.length === 2 && 结果[单元们[d].名]) {
          结果[单元们[d].名] = { x: 存[0], y: 存[1] }
        }
      }

      var 右 = 0
      var 下边 = 0
      for (var e in 结果) {
        if (结果[e].x > 右) 右 = 结果[e].x
        if (结果[e].y > 下边) 下边 = 结果[e].y
      }

      return {
        坐标: 结果,
        宽: Math.max(400, 右 + 160, 60 + 最大(分层.map(function (r) { return r.length })) * 宽),
        高: Math.max(300, 下边 + 140, 50 + (最大层 + 1) * 高),
      }
    }

    function 最大(nums) {
      var m = 0
      for (var i = 0; i < nums.length; i++) if (nums[i] > m) m = nums[i]
      return m
    }

    /** 画一条从甲到乙的箭头（从甲图形边缘到乙图形边缘近似） */
    /**
     * 向量：弧形（用户 2026-11-16：「向量做成弧形,固定从正下方垂直出,正上方垂直进」）
     *
     * 甲 的 `出` 给了就从图形正下方出发，乙 的 `入` 给了就落到图形正上方；
     * 两端切线都竖直，中间用三次贝塞尔接起来。
     */
    function 连线(甲, 乙, 红, 元) {
      if (!甲 || !乙) return null
      var 起 = 甲.出 || 甲
      var 止 = 乙.入 || 乙
      var d
      if (红) {
        // 循环向量（用户 2026-11-16：「加最小弧度,优先从左侧过」「别扭成麻花」「再加点」）
        // 形状是一颗挂在左边的气球：从正下方出去 → 往左绕成圆 → 从正上方回来。
        // 关键有两点：①最左那点用**竖直切线**，才是圆的左端，不会捏成梭形；
        //             ②出门和进门都用竖直切线，跟普通向量的端点风格一致。
        var 弧 = Math.max(160, Math.abs(止.x - 起.x) * 0.5 + 80)
        var 中x = Math.min(起.x, 止.x) - 弧
        var 中y = (起.y + 止.y) / 2
        var 垂 = Math.max(40, Math.abs(止.y - 起.y) * 0.45)
        var 拱 = 弧 * 0.6
        d =
          'M' + 起.x + ' ' + 起.y +
          ' C' + 起.x + ' ' + (起.y + 垂) +
          ' ' + 中x + ' ' + (中y + 拱) +
          ' ' + 中x + ' ' + 中y +
          ' C' + 中x + ' ' + (中y - 拱) +
          ' ' + 止.x + ' ' + (止.y - 垂) +
          ' ' + 止.x + ' ' + 止.y
      } else {
        // 普通向量：两端竖直切线，中间一段贝塞尔
        var 垂2 = Math.max(40, Math.abs(止.y - 起.y) * 0.5)
        d =
          'M' + 起.x + ' ' + 起.y +
          ' C' + 起.x + ' ' + (起.y + 垂2) +
          ' ' + 止.x + ' ' + (止.y - 垂2) +
          ' ' + 止.x + ' ' + 止.y
      }
      var 亮 = 元 && 元.选中
      var 线 = React.createElement('path', {
        key: '线',
        d: d,
        fill: 'none',
        stroke: 亮 ? '#0969da' : 向量色(红),
        strokeWidth: 亮 ? 3 : 向量粗细() + (红 ? 0.4 : 0),
        strokeDasharray: 红 ? '6 4' : undefined,
        markerEnd: 红 ? 'url(#blueprint-tree-arrow-red)' : 'url(#blueprint-tree-arrow)',
      })
      // 没传元就不带热区（老调用点照旧）
      if (!元) return 线
      // 细线点不中，所以overlay一条透明粗线专门接点击（stroke 宽 16）
      var 热区 = React.createElement('path', {
        key: '热区',
        d: d,
        fill: 'none',
        stroke: 'transparent',
        strokeWidth: 16,
        pointerEvents: 'stroke',
        style: { cursor: 'pointer' },
        onClick: 元.点击,
      })
      return React.createElement('g', { key: 元.键 }, 线, 热区)
    }

      // 提示 / 报错 / 确认统一用弹窗（用户 2026-11-16）
    // 传了「确认」就是确认框（取消 / 确定），没传就是提示框（知道了）
    function 提示弹窗(文字, 关, 确认) {
      if (!文字) return null
      return React.createElement(
        'div',
        {
          style: {
            // 只在插件面板内部弹（用户 2026-11-16：「弹窗都在插件界面弹,别扩大到DSH界面」）
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(27,31,36,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
          },
          onClick: 关,
        },
        React.createElement(
          'div',
          {
            style: {
              minWidth: 280,
              maxWidth: 460,
              background: '#fff',
              borderRadius: 10,
              boxShadow: '0 8px 32px rgba(27,31,36,0.28)',
              padding: '18px 20px',
            },
            onClick: function (e) { e.stopPropagation() },
          },
          React.createElement(
            'div',
            { style: { fontSize: 13, lineHeight: 1.75, color: '#1f2328', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
            文字,
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
            确认
              ? [
                  React.createElement('button', { key: '取消', style: 样式.小按钮, onClick: 关 }, '取消'),
                  React.createElement(
                    'button',
                    {
                      key: '确定',
                      style: Object.assign({}, 样式.小按钮, {
                        background: '#cf222e',
                        color: '#fff',
                        borderColor: '#cf222e',
                      }),
                      onClick: function () {
                        关()
                        确认()
                      },
                    },
                    '确定',
                  ),
                ]
              : React.createElement('button', { style: 样式.小按钮, onClick: 关 }, '知道了'),
          ),
        ),
      )
    }

    /**
     * 输入弹窗（用户 2026-11-16：「蓝图页面新建单元功能无效」）。
     *
     * 根因：Electron 里 `window.prompt` 是被禁用的，永远返回 null，
     * 所以以前那版点「新建」什么都不发生。改成插件自己的输入框。
     */
    function 输入弹窗(标题, 默认, 关, 确定) {
      var 值 = 默认 || ''
      var 提交 = function () {
        var v = String(值 || '').trim()
        关()
        确定(v)
      }
      return React.createElement(
        'div',
        {
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(27,31,36,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
          },
          onClick: 关,
        },
        React.createElement(
          'div',
          {
            style: {
              minWidth: 300,
              maxWidth: 460,
              background: '#fff',
              borderRadius: 10,
              boxShadow: '0 8px 32px rgba(27,31,36,0.28)',
              padding: '18px 20px',
            },
            onClick: function (e) { e.stopPropagation() },
          },
          React.createElement('div', { style: { fontSize: 13, color: '#1f2328', marginBottom: 10 } }, 标题),
          React.createElement('input', {
            defaultValue: 值,
            autoFocus: true,
            onChange: function (e) { 值 = e.target.value },
            onKeyDown: function (e) {
              if (e.key === 'Enter') 提交()
              if (e.key === 'Escape') 关()
            },
            style: {
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 10px',
              fontSize: 13,
              border: '1px solid #d0d7de',
              borderRadius: 6,
              outline: 'none',
              fontFamily: 'inherit',
            },
          }),
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
            React.createElement('button', { key: '取消', style: 样式.小按钮, onClick: 关 }, '取消'),
            React.createElement(
              'button',
              {
                key: '确定',
                style: Object.assign({}, 样式.小按钮, {
                  background: '#1f883d',
                  color: '#fff',
                  borderColor: '#1f883d',
                }),
                onClick: 提交,
              },
              '确定',
            ),
          ),
        ),
      )
    }
    var 蓝图视图 = (function () {
      // 单元详情：点单元在右边弹出（用户 2026-11-15：「点单元后弹出详情」）

    function 详情面板(u, 关) {
        function 行(键, 值) {
          return React.createElement(
            'div',
            { key: 键, style: { display: 'flex', gap: 8, padding: '3px 0', fontSize: 12 } },
            React.createElement('span', { style: { color: '#8c959f', width: 48, flexShrink: 0 } }, 键),
            React.createElement(
              'span',
              { style: { wordBreak: 'break-all' } },
              值 === undefined || 值 === null || 值 === '' ? '-' : String(值),
            ),
          )
        }
        return React.createElement(
          'div',
          {
            // 面板自己的点击别冒泡到画布（否则点两下就关了）
            onClick: function (e) { e.stopPropagation() },
            // 在面板上按左键也不该拖动画布
            onMouseDown: function (e) { e.stopPropagation() },
            // 面板内部滚轮是滚面板，不该缩放画布
            onWheel: function (e) { e.stopPropagation() },
            style: {
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 260,
              background: 'var(--dsw-alias-bg-elevated, #fff)',
              borderLeft: '1px solid var(--dsw-alias-border, #d0d7de)',
              boxShadow: '-4px 0 12px rgba(140,149,159,0.12)',
              padding: '10px 12px',
              overflow: 'auto',
              zIndex: 10,
            },
          },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 } },
            React.createElement('span', { style: { fontWeight: 600, fontSize: 13, flex: 1 } }, u.名),
            React.createElement('button', { style: 样式.按钮, onClick: 关 }, '关闭'),
          ),
          行('类型', u.类型),
          行('标签', u.标签),
          行('状态', u.状态),
          行('下层', (u.下层 || []).join('、')),
          行('坐标', u.坐标 ? u.坐标.join(',') : ''),
          行('功能', u.功能),
        )
      }

      function 组件(props) {
        var useState = React.useState
        var useEffect = React.useEffect
        var useRef = React.useRef

        var _图 = useState(null)
        var 图 = _图[0]
        var 设图 = _图[1]

        // 面包屑：路径栈，最后一个是当前图（用户 m05702：主蓝图>>子蓝图1>>子蓝图2）
        var _路径 = useState([props.蓝图 || '主蓝图'])
        var 路径 = _路径[0]
        var 设路径 = _路径[1]
        var 当前图 = 路径[路径.length - 1]

        // 「读取中…」不再弹窗（用户 2026-11-16：改成鼠标转圈）
        var _提示 = useState('')
        var 提示 = _提示[0]
        var 设提示 = _提示[1]
        var _读中 = useState(true)
        var 读中 = _读中[0]
        var 设读中 = _读中[1]

        // 点单元弹详情（用户 m05702 提到的「点单元后弹出详情」）
        var _详情 = useState(null)
        var 详情 = _详情[0]
        var 设详情 = _详情[1]

        // 确认框（用户 2026-11-16：「删除的确认也是一样的弹窗,尽量用同一个弹窗方法」）
        var _确认框 = useState(null)
        var 确认框 = _确认框[0]
        var 设确认框 = _确认框[1]

        // 输入弹窗（用户 2026-11-16）：Electron 禁掉了 window.prompt，只能自己弹
        var _输入 = useState(null)
        var 输入 = _输入[0]
        var 设输入 = _输入[1]

        // 单元选中（用户 2026-11-16：未选中时工具栏是「新建」，选中后变成
        // 「类型 / 标签 / 删除」；单选能改，多选变灰只留删除）
        var _选 = useState([])
        var 选 = _选[0]
        var 设选 = _选[1]
        // 向量选中（用户 m07334：「加对页面上选中的向量的删除」）
        // 选线 = {从, 到, 红, 环?}：红=true 是循环向量那条边，环 是循环向量单元名
        var _选线 = useState(null)
        var 选线 = _选线[0]
        var 设选线 = _选线[1]

        // 单元内容弹窗（用户 m07860：双击单元弹出，占蓝图页 70%；上面是「说明」，
        // 下面是「方法」；内容多时可滚轮；不要遮挡上面的状态/标签工具栏）
        // 内容 = { 名, 功能, 方法, 有方法, 读中, 存中, 错 } | null
        var _内容 = useState(null)
        var 内容 = _内容[0]
        var 设内容 = _内容[1]

        // 测试 / 运行（用户 2026-11-18：「现在给页面加上测试和运行吧，三个按钮」）
        //  跑中 = 正在跑的命令名（按钮置灰 + 左上角显示进度）
        //  结果 = { 标题, 文字 } | null（跑完弹窗给结果）
        var _跑中 = useState('')
        var 跑中 = _跑中[0]
        var 设跑中 = _跑中[1]
        var _结果 = useState(null)
        var 结果 = _结果[0]
        var 设结果 = _结果[1]

        var _锚 = useState(null)
        var 锚 = _锚[0]
        var 设锚 = _锚[1]

        // 换蓝图/换项目时清掉选中
        function 清选() { 设选([]); 设锚(null); 设详情(null); 设选线(null) }

        // 双击单元 = 打开编辑弹窗（用户 m15373 草图：单元名 / 上游折叠 / 描述 / 方法 / 取消 保存）
        // 「方法」框里只有正文可编辑：函数头、取数行、结尾的 `}` 都是插件生成的，页面不提交它们
        function 拆方法(文本) {
          var 行 = String(文本 || '').replace(/\r\n/g, '\n').split('\n')
          var 标 = -1
          for (var i = 0; i < 行.length; i++) {
            if (行[i].indexOf('/*从这里开始***') >= 0) { 标 = i; break }
          }
          if (标 < 0) return { 头: '', 体: 行.join('\n').replace(/^\n+|\s+$/g, ''), 尾: '' }
          var 尾 = -1
          for (var j = 行.length - 1; j > 标; j--) {
            if (行[j].trim() === '}') { 尾 = j; break }
          }
          if (尾 < 0) 尾 = 行.length
          return {
            头: 行.slice(0, 标 + 1).join('\n'),
            体: 行.slice(标 + 1, 尾).join('\n'),
            尾: 行.slice(尾).join('\n'),
          }
        }

        function 读上游(名单) {
          var 表 = {}
          单元们.forEach(function (x) { 表[x.名] = x })
          return (名单 || []).map(function (n) {
            var u = 表[n]
            return { 名: n, 功能: (u && u.功能) || '', 来源: '本图' }
          })
        }

        function 开内容(名, 模式) {
          if (!名) return
          设内容({
            模式: 模式 || '编辑',
            名: 名,

            功能: '',
            头: '', 体: '', 尾: '',
            有方法: false,
            上层: [],
            项目描述: '',
            蓝图单元: '', 蓝图描述: '',
            展开: {},
            读中: true, 存中: false, 错: '',
          })
          调('unit.get', { 项目: props.项目, 蓝图: 当前图, 单元: 名 }).then(function (r) {
            if (!r || !r.ok) {
              var 消息 = (r && r.错误 && r.错误.消息) || '读不到这个单元'
              设内容(function (旧) { return 旧 ? Object.assign({}, 旧, { 读中: false, 错: 消息 }) : 旧 })
              return
            }
            var 数据 = r.数据 || {}
            var 单元 = 数据.单元 || {}
            var 拆 = 拆方法(数据.方法 || '')
            设内容({
              模式: 模式 || '编辑',
              名: 名,
              功能: 单元.功能 || '',
              头: 拆.头,
              体: 拆.体,
              原体: 拆.体,
              尾: 拆.尾,
              有方法: !!数据.方法,
              上层: 数据.上游 && 数据.上游.length ? 数据.上游 : 读上游(单元.上层),
              项目描述: 数据.项目描述 || '',
              蓝图单元: 数据.蓝图单元 || '',
              蓝图描述: 数据.蓝图描述 || '',
              展开: {},
              读中: false, 存中: false, 错: '',
            })
          })
        }

        // 保存：描述走 unit.update；正文改动走 method.write（发整段：头 + 正文 + 尾）
        // 新建态下只存描述 —— 骨架刚生成、还没到改正文的时候
        function 存内容() {
          if (!内容 || 内容.存中 || 内容.读中) return
          var 名 = 内容.名
          var 说明 = 内容.功能 || ''
          var 模式 = 内容.模式 || '编辑'
          var 体 = 内容.体 || ''
          var 原体 = 内容.原体 == null ? 体 : 内容.原体
          设内容(function (旧) { return 旧 ? Object.assign({}, 旧, { 存中: true, 错: '' }) : 旧 })

          调('unit.update', { 项目: props.项目, 蓝图: 当前图, 单元: 名, 改: { 功能: 说明 } })
            .then(function (r) {
              if (!r || !r.ok) throw new Error((r && r.错误 && r.错误.消息) || '描述没存上')
              if (模式 === '新建') return null
              if (体 === 原体) return null
              // 空正文 = 把方法重置成插件骨架（用户 2026-11-22：单元强制绑定方法，不能删）
              if (!体.trim() && !内容.头) return null
              var 全文 = 体.trim() ? (内容.头 ? 内容.头 + '\n' + 体 + '\n' + (内容.尾 || '') : 体) : ''
              return 调('method.write', { 项目: props.项目, 蓝图: 当前图, 单元: 名, 方法: 全文 }).then(function (r2) {
                if (!r2 || !r2.ok) throw new Error((r2 && r2.错误 && r2.错误.消息) || '方法没写进去')
                return r2
              })
            })
            .then(function (r2) {
              var 重置了 = !!(r2 && r2.数据 && r2.数据.已重置)
              if (模式 === '新建') {
                开内容(名, '编辑')
                return 重读图()
              }
              设内容(null)
              return 重读图().then(function () {
                if (重置了) 设提示('方法已重置成骨架 —— 正文空了，旧版本已进历史')
              })
            })
            .catch(function (e) {
              var 消息 = (e && e.message) || String(e)
              设内容(function (旧) { return 旧 ? Object.assign({}, 旧, { 存中: false, 错: 消息 }) : 旧 })
            })
        }

        useEffect(function () {
          设读中(true)
        调('blueprint.graph', { 项目: props.项目, 蓝图: 路径[路径.length - 1] }).then(function (r) {
            设读中(false)
            if (r && r.ok) {
              设图(r.数据)
              设提示('')
            } else {
              设提示('读不到蓝图：' + ((r && r.错误 && r.错误.消息) || '未知'))
            }
          })
        }, [props.项目, 路径])

        // 刷新（用户 2026-11-18）：人点「刷新」按钮、AI 调 page.refresh，都只把服务端序号 +1；
        // 这里每 2.5 秒问一次 page.signal，发现序号变了就重读当前图。
        // 用 useRef 记住基准值，首次读到的当作起点，避免刚挂载就白白重读一遍。
        var 号箱 = useRef(null)
        useEffect(function () {
          var 停 = false
          function 问一次() {
            调('page.signal')
              .then(function (r) {
                if (停 || !r || !r.ok) return
                var 号 = Number((r.数据 || {}).序号)
                if (!isFinite(号)) return
                if (号箱.current === null) {
                  号箱.current = 号
                  return
                }
                if (号 !== 号箱.current) {
                  号箱.current = 号
                  重读图()
                }
              })
              .catch(function () {})
          }
          问一次()
          var 定时 = setInterval(问一次, 2500)
          return function () {
            停 = true
            clearInterval(定时)
          }
        }, [props.项目])

        var 布 = 算布局(图)
        var 单元们 = (图 && 图.单元) || []

        // 画布视图：滚轮缩放 + 左键拖空白平移（用户 2026-11-16「现在做一个滚轮
        // 缩放和左键点按空白拖动的功能」）。缩放以光标为中心，范围 0.2× ~ 3×。
        var _视图 = useState({ k: 1, x: 0, y: 0 })
        var 视图 = _视图[0]
        var 设视图 = _视图[1]
        var 拖 = useRef(null)
        var 刚拖过 = useRef(0)
        // 按下才显示手（用户 2026-11-16：空白处正常箭头，点下变手形）
        var _拖中 = useState(false)
        var 拖中 = _拖中[0]
        var 设拖中 = _拖中[1]

        // 拖动单元 = 改它的坐标（用户 2026-11-16「加一个拖动单元的功能,这个会改
        // 单元坐标,记得换算」）。拖动中用临时坐标覆盖，松手才写盘。
        var _拖位 = useState(null)
        var 拖位 = _拖位[0]
        var 设拖位 = _拖位[1]
        var 单元拖 = useRef(null)

        // 画的时候用 位 代替 布.坐标，这样拖动过程中箭头也跟着动
        var 位 = 布.坐标
        if (拖位) {
          位 = Object.assign({}, 布.坐标)
          位[拖位.名] = { x: 拖位.x, y: 拖位.y }
        }

        // —— 创建向量（用户 2026-11-16：「鼠标移动到单元时,单元图形下方中部出现
        //    小圆圈,点按圆圈拖动到单元上(可能是别的单元,也有可能是自己)就是创建向量」）
        var _悬 = useState(null)
        var 悬 = _悬[0]
        var 设悬 = _悬[1]
        var _拉线 = useState(null) // { 从, x, y } 正在拖的那根线
        var 拉线 = _拉线[0]
        var 设拉线 = _拉线[1]
        var 画布盒 = useRef(null)

        // 屏幕坐标 → 画布坐标
        function 画坐标(e) {
          var 框 = 画布盒.current ? 画布盒.current.getBoundingClientRect() : { left: 0, top: 0 }
          return { x: (e.clientX - 框.left - 视图.x) / 视图.k, y: (e.clientY - 框.top - 视图.y) / 视图.k }
        }

        // 找离 (x,y) 最近的、能当终点的单元（画布坐标，吸附半径 46）
        function 落点单元(x, y, 除了) {
          var 最好 = null
          var 最近 = 46
          for (var i = 0; i < 单元们.length; i++) {
            var u = 单元们[i]
            if (u.类型 === '循环向量') continue
            if (除了 && u.名 === 除了) continue
            var c = 位[u.名]
            if (!c) continue
            var d = Math.sqrt((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y))
            if (d < 最近) {
              最近 = d
              最好 = u.名
            }
          }
          return 最好
        }

        // 小圆圈按下 = 开始拉线
        function 开始拉线(e, 名) {
          if (e.button !== 0) return
          e.stopPropagation()
          var p = 画坐标(e)
          设拉线({ 从: 名, x: p.x, y: p.y })
        }

        // 松手 = 真的建一条向量（后端 unit.update 会处理成环/自连）
        function 建向量(从, 到) {
          var 源 = 单元们.filter(function (x) { return x.名 === 从 })[0]
          if (!源) return
          var 旧 = (源.下层 || []).slice()
          if (旧.indexOf(到) !== -1) {
            设提示('「' + 从 + '」已经指向「' + 到 + '」了')
            return
          }
          旧.push(到)
          设拉线(null)
          设悬(null)
          调('unit.update', {
            项目: props.项目,
            蓝图: 当前图,
            单元: 从,
            改: { 下层: 旧 },
          }).then(function (r) {
            if (!r || !r.ok) {
              设提示('建向量失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
              return
            }
            return 重读图()
          })
        }

        // 开始拖某个单元：记住起点和它原来的坐标（屏幕坐标换算成画布坐标
        // 要除以缩放比，见下面的 移动）
        function 拖单元(e, u) {
          if (e.button !== 0) return
          e.stopPropagation()
          var c = 位[u.名]
          if (!c) return
          单元拖.current = { 名: u.名, 起X: e.clientX, 起Y: e.clientY, 原X: c.x, 原Y: c.y, 动过: false }
          设拖位({ 名: u.名, x: c.x, y: c.y })
          设拖中(true)
        }

        function 缩放(e) {
          e.preventDefault()
          var 框 = e.currentTarget.getBoundingClientRect()
          var mx = e.clientX - 框.left
          var my = e.clientY - 框.top
          var 系数 = e.deltaY < 0 ? 1.12 : 1 / 1.12
          var 新k = Math.min(3, Math.max(0.2, 视图.k * 系数))
          var 比 = 新k / 视图.k
          设视图({ k: 新k, x: mx - (mx - 视图.x) * 比, y: my - (my - 视图.y) * 比 })
        }

        function 按下(e) {
          if (e.button !== 0) return
          // 面板里的按钮、输入框不开始拖
          var t = e.target
          if (t && t.closest && t.closest('button, input, textarea')) return
          拖.current = { x: e.clientX, y: e.clientY, 原X: 视图.x, 原Y: 视图.y, 动过: false }
          设拖中(true)
        }

        function 移动(e) {
          // 正在拉向量：线的末端跟着鼠标走
          if (拉线) {
            var p = 画坐标(e)
            设拉线({ 从: 拉线.从, x: p.x, y: p.y })
            return
          }
          // 拖单元：鼠标位移除以缩放比，才是画布里的位移
          var u = 单元拖.current
          if (u) {
            var ux = (e.clientX - u.起X) / 视图.k
            var uy = (e.clientY - u.起Y) / 视图.k
            if (!u.动过 && Math.abs(ux) + Math.abs(uy) < 3) return
            u.动过 = true
            设拖位({ 名: u.名, x: Math.round(u.原X + ux), y: Math.round(u.原Y + uy) })
            return
          }
          var d = 拖.current
          if (!d) return
          var dx = e.clientX - d.x
          var dy = e.clientY - d.y
          if (!d.动过 && Math.abs(dx) + Math.abs(dy) < 4) return
          d.动过 = true
          设视图({ k: 视图.k, x: d.原X + dx, y: d.原Y + dy })
        }

        function 松开(e) {
          // 松手：落点有单元就建向量，否则取消
          if (拉线) {
            var 从 = 拉线.从
            var 落点 = e && typeof e.clientX === 'number' ? 画坐标(e) : null
            设拉线(null)
            设悬(null)
            if (!落点) return
            var 到 = 落点单元(落点.x, 落点.y, null)
            if (!到) return
            建向量(从, 到)
            return
          }
          var u = 单元拖.current
          if (u) {
            var 落 = 拖位
            单元拖.current = null
            设拖位(null)
            设拖中(false)
            if (u.动过 && 落) {
              // 拖动后直接取消所有选中（用户 2026-11-16），同时挡住松手后
              // 浏览器补发的那个 click，免得又把刚拖的单元选回来
              刚拖过.current = Date.now()
              设选([])
              设锚(null)
              调('unit.update', {
                项目: props.项目,
                蓝图: 路径[路径.length - 1],
                单元: u.名,
                改: { 坐标: [落.x, 落.y] },
              }).then(function (r) {
                if (r && r.ok) {
                  设提示('')
                  重读图()
                } else {
                  设提示('坐标没存上：' + ((r && r.错误 && r.错误.消息) || '未知'))
                }
              })
            }
            return
          }
          var d = 拖.current
          if (d && d.动过) 刚拖过.current = Date.now()
          拖.current = null
          设拖中(false)
        }

        // 重读当前图（改完单元后刷新画布）
        function 重读图() {
          设读中(true)
          return 调('blueprint.graph', { 项目: props.项目, 蓝图: 路径[路径.length - 1] }).then(function (r) {
            设读中(false)
            if (r && r.ok) 设图(r.数据)
            else 设提示('读不到蓝图：' + ((r && r.错误 && r.错误.消息) || '未知'))
          })
        }

        // 点单元 = 选中（Ctrl 切换 / Shift 区间 / 单击单选）
        function 点单元(e, 名) {
          e.stopPropagation()
          // 刚拖完这个单元（松手后浏览器还会补一个 click）⇒ 不选中
          // 用户 2026-11-16：「拖动后不要选中单元」
          if (Date.now() - 刚拖过.current < 300) return
          if (e.ctrlKey || e.metaKey) {
            var 有 = 选.indexOf(名) !== -1
            设选(有 ? 选.filter(function (x) { return x !== 名 }) : 选.concat([名]))
            设锚(名)
            return
          }
          if (e.shiftKey && 锚) {
            var 名们 = 单元们.map(function (x) { return x.名 })
            var 起 = 名们.indexOf(锚)
            var 止 = 名们.indexOf(名)
            if (起 < 0 || 止 < 0) return
            if (起 > 止) { var t = 起; 起 = 止; 止 = t }
            设选(名们.slice(起, 止 + 1))
            return
          }
          设选([名])
          设锚(名)
        }

        // ── 工具栏的三个动作 ──
        var 可改类型 = ['硬', '软', '选择']
        var 可改标签 = ['无', '强制', '广播', '并发']

        function 改单元(名, 改) {
          return 调('unit.update', { 项目: props.项目, 蓝图: 当前图, 单元: 名, 改: 改 }).then(function (r) {
            if (!r || !r.ok) {
              设提示('改失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
              return
            }
            设提示('')
            return 重读图()
          })
        }

        // 删除：先弹确认框（用户 2026-11-16：「删除的确认也是一样的弹窗」）
        function 删选中() {
          if (!选.length) return
          var 副本 = 选.slice()
          设确认框({
            文字: '删掉这 ' + 副本.length + ' 个单元？\n\n' + 副本.join('、'),
            动作: function () { 真的删(副本) },
          })
        }

        function 真的删(副本) {
          var 队列 = 副本.slice()
          var 失败 = []
          var 走 = function () {
            if (!队列.length) {
              清选()
              设提示(失败.length ? 失败.join('；') : '')
              return 重读图()
            }
            var 名 = 队列.shift()
            return 调('unit.remove', { 项目: props.项目, 蓝图: 当前图, 单元: 名 }).then(function (r) {
              if (!r || !r.ok) {
                失败.push((r && r.错误 && r.错误.消息) || ('删「' + 名 + '」失败'))
              }
              return 走()
            })
          }
          return 走()
        }

        // 删向量（用户 m07334：「通过修改单元下层和删除循环向量实现」）
        // 普通向量 = 把目标从源的「下层」里摘掉；循环向量 = 先摘掉源下层里的那个循环向量名，
        // 再把循环向量单元本身删掉，否则会留下一个孤儿单元。
        function 真的删线(元) {
          var 源 = null
          for (var i = 0; i < 单元们.length; i++) {
            if (单元们[i].名 === 元.从) { 源 = 单元们[i]; break }
          }
          if (!源) return 设提示('找不到源单元「' + 元.从 + '」')

          var 旧 = 源.下层 || []
          var 新 = []
          var 去掉 = 元.红 ? 元.环 : 元.到
          for (var j = 0; j < 旧.length; j++) if (旧[j] !== 去掉) 新.push(旧[j])

          var 收尾 = function (r) {
            if (!r || !r.ok) {
              设提示('删除失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
              return
            }
            if (!元.红) {
              设提示('')
              设选线(null)
              return 重读图()
            }
            return 调('unit.remove', { 项目: props.项目, 蓝图: 当前图, 单元: 元.环 }).then(function (r2) {
              if (!r2 || !r2.ok) {
                设提示('线已断开，但「' + 元.环 + '」没删掉：' + ((r2 && r2.错误 && r2.错误.消息) || '未知'))
              } else {
                设提示('')
              }
              设选线(null)
              return 重读图()
            })
          }

          return 调('unit.update', {
            项目: props.项目,
            蓝图: 当前图,
            单元: 元.从,
            改: { 下层: 新 },
          }).then(收尾)
        }

        function 新建(类型) {
          // 不用 window.prompt —— Electron 里被禁用，永远返回 null，
          // 这就是「新建单元功能无效」的原因（用户 2026-11-16）
          设输入({
            标题: '新单元的名字（类型：' + 类型 + '）',
            动作: function (名) {
              if (!名) return
              调('unit.add', {
                项目: props.项目,
                蓝图: 当前图,
                单元: { 名: 名, 类型: 类型 },
              }).then(function (r) {
                if (!r || !r.ok) {
                  设提示('新建失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
                  return
                }
                设提示('')
                return 重读图().then(function () {
                  开内容(名, '新建')
                })
              })
            },
          })
        }

        // 工具栏（用户 2026-11-16）：未选中 = 新建；选中 = 类型 / 标签 / 删除
        function 工具栏() {
          var 单选 = 选.length === 1 ? 单元们.filter(function (x) { return x.名 === 选[0] })[0] : null
          var 可改 = !!单选

          var 块 = function (标题, 子) {
            return React.createElement(
              'span',
              { key: 标题, style: { display: 'flex', alignItems: 'center', gap: 4 } },
              React.createElement('span', { style: { color: '#8c959f', fontSize: 11 } }, 标题),
              子,
            )
          }

          // 自动排列按钮不在工具栏里 —— 用户 2026-11-16：
          // 「自动排列按钮是悬浮的,工具栏还是加自动排列之前的样子」
          // ⇒ 工具栏恢复原样，按钮在画布右上角悬浮（见下面的 悬浮排列()）

          if (!选.length) {
            // 选中向量时：工具栏变成「删除向量」（用户 m07334）
            if (选线) {
              return React.createElement(
                'div',
                { style: 样式.工具条 },
                块(
                  '向量',
                  [
                    React.createElement(
                      'button',
                      {
                        key: '删',
                        style: 样式.小按钮,
                        onClick: function () { 真的删线(选线) },
                      },
                      '删除',
                    ),
                    React.createElement(
                      'button',
                      { key: '取消', style: 样式.小按钮, onClick: function () { 设选线(null) } },
                      '取消选择',
                    ),
                  ],
                ),
              )
            }
            return React.createElement(
              'div',
              { style: 样式.工具条 },
              块(
                '新建',
                可改类型.concat(['子蓝图']).map(function (t) {
                  return React.createElement(
                    'button',
                    { key: t, style: 样式.小按钮, onClick: function () { 新建(t) } },
                    t,
                  )
                }),
              ),
            )
          }

          return React.createElement(
            'div',
            { style: 样式.工具条 },
            块(
              '类型',
              可改类型.map(function (t) {
                var 当前 = 可改 && 单选.类型 === t
                return React.createElement(
                  'button',
                  {
                    key: t,
                    style: 可改 ? (当前 ? 样式.小按钮亮 : 样式.小按钮) : 样式.小按钮灰,
                    onClick: function () { if (可改) 改单元(单选.名, { 类型: t }) },
                  },
                  t,
                )
              }),
            ),
            块(
              '标签',
              可改标签.map(function (t) {
                var 当前 = 可改 && 单选.标签 === t
                return React.createElement(
                  'button',
                  {
                    key: t,
                    style: 可改 ? (当前 ? 样式.小按钮亮 : 样式.小按钮) : 样式.小按钮灰,
                    onClick: function () { if (可改) 改单元(单选.名, { 标签: t }) },
                  },
                  t,
                )
              }),
            ),
            React.createElement('span', { style: { flex: 1 } }),
            React.createElement(
              'span',
              { style: { color: '#8c959f', fontSize: 11, marginRight: 6 } },
              '选了 ' + 选.length + ' 个',
            ),
            React.createElement(
              'button',
              {
                style: Object.assign({}, 样式.小按钮, { color: '#cf222e', borderColor: '#cf222e' }),
                onClick: 删选中,
              },
              '删除',
            ),
          )
        }

        // 先画箭头，再画单元（保证单元压在箭头上面）
        var 箭头们 = []
        for (var i = 0; i < 单元们.length; i++) {
          var u = 单元们[i]
          var 我 = 位[u.名]
          var 下层 = u.下层 || []
          for (var j = 0; j < 下层.length; j++) {
            var 下 = 下层[j]
            if (下 === '$结束') {
              // 用户 m12881：子蓝图单元的 $结束 不画（它接父图下游，画出来只是噪声）；
              // 用户 m14040：单蓝图单元（其它类型）的出口仍要显示 —— 短竖线 + 小圆点。
              if (u.类型 !== '子蓝图' && 我) {
                var 桩起 = 形下沿(u, 我.y) + 4
                var 桩止 = 桩起 + 26
                箭头们.push(
                  React.createElement('line', {
                    key: '结束桩-' + u.名,
                    x1: 我.x,
                    y1: 桩起,
                    x2: 我.x,
                    y2: 桩止,
                    style: { stroke: 向量色(false), strokeWidth: 向量粗细() },
                  }),
                )
                箭头们.push(
                  React.createElement('circle', {
                    key: '结束点-' + u.名,
                    cx: 我.x,
                    cy: 桩止,
                    r: 3.5,
                    style: { fill: 向量色(false) },
                  }),
                )
              }
              continue
            }

            // 循环向量：不画节点，直接画一条红色箭头（用户 m05844：
            // 「循环按向量展示，红色的向量」）
            var 下单元 = null
            for (var t = 0; t < 单元们.length; t++) {
              if (单元们[t].名 === 下) { 下单元 = 单元们[t]; break }
            }
            if (下单元 && 下单元.类型 === '循环向量') {
              var 环目标 = (下单元.下层 || [])[0]
              var 环单元 = null
              for (var t2 = 0; t2 < 单元们.length; t2++) {
                if (单元们[t2].名 === 环目标) { 环单元 = 单元们[t2]; break }
              }
              if (环目标 && 位[环目标]) {
                箭头们.push(
                  连线(
                    { x: 我.x, y: 我.y, 出: 出点(u, 我) },
                    { x: 位[环目标].x, y: 位[环目标].y, 入: 入点(环单元 || u, 位[环目标]) },
                    true,
                    (function (从名, 到名, 环名) {
                      return {
                        键: '环:' + 从名 + '>' + 到名,
                        选中: !!(选线 && 选线.红 && 选线.从 === 从名 && 选线.环 === 环名),
                        点击: function (e) {
                          e.stopPropagation()
                          设选([])
                          设锚(null)
                          设详情(null)
                          设选线({ 从: 从名, 到: 到名, 红: true, 环: 环名 })
                        },
                      }
                    })(u.名, 环目标, 下),
                  ),
                )
              }
              continue
            }

            // 坐标缺一个就画不了（比如循环向量不占格子）
            if (!我 || !位[下]) continue
            箭头们.push(
              连线(
                { x: 我.x, y: 我.y, 出: 出点(u, 我) },
                { x: 位[下].x, y: 位[下].y, 入: 入点(下单元 || u, 位[下]) },
                u.类型 === '循环向量',
                (function (从名, 到名) {
                  return {
                    键: '线:' + 从名 + '>' + 到名,
                    选中: !!(选线 && !选线.红 && 选线.从 === 从名 && 选线.到 === 到名),
                    点击: function (e) {
                      e.stopPropagation()
                      设选([])
                      设锚(null)
                      设详情(null)
                      设选线({ 从: 从名, 到: 到名, 红: false })
                    },
                  }
                })(u.名, 下),
              ),
            )
          }
        }

        // 自动排列：悬浮在画布右上角，不占工具栏（用户 2026-11-16：
        // 「自动排列按钮是悬浮的,工具栏还是加自动排列之前的样子」）
        // 位置用 absolute 钉在画布区域上方 —— 面包屑 ~33px + 工具栏 ~36px
        var 悬浮排列 = function () {
          return React.createElement(
            'button',
            {
              key: '自动排列',
              style: Object.assign({}, 样式.小按钮, {
                position: 'absolute',
                top: 78,
                right: 14,
                zIndex: 20,
                background: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }),
              onClick: function (e) {
                e.stopPropagation()
                调('blueprint.arrange', { 项目: props.项目, 蓝图: 当前图 }).then(function (r) {
                  if (!r || !r.ok) {
                    设提示('自动排列失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
                    return
                  }
                  return 重读图()
                })
              },
            },
            '自动排列',
          )
        }

        // 刷新（用户 2026-11-18：「自动排列下面加个刷新按钮」）：
        // 刷新 = 重读当前页面（蓝图页重读这张图），同时把服务端序号 +1，
        // 让别的窗口 / AI 那边也知道页面该重读了。
        var 悬浮刷新 = function () {
          return React.createElement(
            'button',
            {
              key: '刷新',
              title: '刷新当前页面（AI 也可以调 page.refresh 触发）',
              style: Object.assign({}, 样式.小按钮, {
                position: 'absolute',
                top: 116,
                right: 14,
                zIndex: 20,
                background: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }),
              onClick: function (e) {
                e.stopPropagation()
                调('page.refresh', { 页面: '蓝图', 项目: props.项目, 蓝图: 当前图 })
                return 重读图()
              },
            },
            '刷新',
          )
        }

        // ── 测试 / 运行（用户 2026-11-18）──────────────────────────
        // 「第一个是测试，如果选中一个或多个单元，点测试就是单元（此时可选择测试次数，
        //   结束后弹窗给结果），否则是测试当前蓝图，没次数选择，结束后弹窗给结果。
        //   第二个是项目测试，测试全项目（没次数选择，结束后给弹窗提醒）。第三个是运行。」
        function 截断(文字, 上限) {
          var 上限2 = 上限 || 6000
          var s = String(文字 == null ? '' : 文字)
          return s.length > 上限2 ? s.slice(0, 上限2) + '\n…（还有 ' + (s.length - 上限2) + ' 字没显示）' : s
        }

        function 串(值) {
          try { return JSON.stringify(值, null, 2) } catch (e) { return String(值) }
        }

        // 把命令返回折成「先一行结论，再附数据」的一段话
        function 概括结果(标题, r) {
          var 行 = [标题]
          if (!r || !r.ok) {
            行.push('✗ 失败：' + ((r && r.错误 && r.错误.消息) || '未知错误'))
            if (r && r.错误 && r.错误.类型) 行.push('类型：' + r.错误.类型)
            if (r && r.数据) 行.push('', 截断(串(r.数据)))
            return 行.join('\n')
          }
          var d = r.数据 || {}
          var 耗 = d.耗时毫秒 || {}
          if (d.单元) {
            行.push((d.失败 ? '✗' : '✓') + ' 单元「' + d.单元 + '」 ' + (d.成功 || 0) + '/' + (d.次数 || 1) + (d.并发 ? '（并发）' : '（串行）'))
            if (d.耗时毫秒) {
              行.push('耗时：总 ' + (耗.总 || 0) + ' ms / 平均 ' + (耗.平均 || 0) + ' ms / 最快 ' + (耗.最快 || 0) + ' / 最慢 ' + (耗.最慢 || 0))
            }
            if (d.错误 && d.错误.length) 行.push('错误：' + d.错误.join('；'))
            if (d.没方法的上下游 && d.没方法的上下游.length) 行.push('没有方法、没给随机的上游：' + d.没方法的上下游.join('、'))
            if (d.输出 !== undefined) 行.push('输出：' + 截断(串(d.输出), 1500))
            return 行.join('\n')
          }
          if (d.蓝图 || d.入口) {
            var 跑过 = d.跑了 || []
            行.push((d.失败 ? '✗' : '✓') + ' 蓝图「' + (d.蓝图 || '') + '」 结局 ' + (d.结局 || '—') + '，跑了 ' + (跑过.length || 0) + ' 格')
            if (d.耗时毫秒) 行.push('耗时：总 ' + (耗.总 || 0) + ' ms / 平均 ' + (耗.平均 || 0) + ' ms')
            if (d.错误) 行.push('错误：' + d.错误)
            if (d.日志) 行.push('日志：' + d.日志 + '（项目目录下）')
            if (跑过.length) 行.push('跑过的单元：' + 跑过.join(' → '))
            return 行.join('\n')
          }
          if (d.结局) {
            行.push((d.结局 === '完成' ? '✓' : '✗') + ' 结局：' + d.结局 + '，跑了 ' + ((d.跑过 && d.跑过.length) || 0) + ' 格')
            if (d.跑到上限) 行.push('（到了步数上限，可能是循环没出口）')
            if (d.剩下 && d.剩下.length) 行.push('卡住的单元：' + d.剩下.slice(0, 20).join('；'))
            if (d.错误) 行.push('错误：' + d.错误)
            return 行.join('\n')
          }
          return 行.join('\n') + '\n\n' + 截断(串(d))
        }

        // 统一入口：设「跑中」→ 调命令 → 弹结果
        // 用户 m14135：测试/运行结束后自动刷一次画布 —— 命令返回时状态已经落盘，
        // 前端只按返回时机重读图，不用改后端。
        function 跑命令(标题, 命令, 参数) {
          if (跑中) return null
          设跑中(标题)
          设结果(null)
          return 调(命令, 参数)
            .then(function (r) {
              设跑中('')
              设结果({ 标题: 标题, 文字: 概括结果(标题, r) })
              重读图()
            })
            .catch(function (e) {
              设跑中('')
              设结果({ 标题: 标题, 文字: 标题 + '\n✗ ' + (e && e.message ? e.message : String(e)) })
              重读图()
            })
        }

        // ① 测试：选中单元 ⇒ 逐个 test.unit（先问次数）；没选中 ⇒ test.blueprint
        function 点测试() {
          if (跑中) return
          if (!选.length) {
            return 跑命令('测试蓝图 · ' + 当前图, 'test.blueprint', { 项目: props.项目, 蓝图: 当前图 })
          }
          var 名们 = 选.slice()
          设输入({
            标题: '测试次数（选中 ' + 名们.length + ' 个单元，默认 1）',
            默认: '1',
            动作: function (值) {
              var 次 = parseInt(String(值 || '1'), 10)
              if (!次 || 次 < 1) 次 = 1
              if (次 > 1000) 次 = 1000
              var 行们 = []
              var 序 = 0
              设结果(null)
              var 跑下一个 = function () {
                if (序 >= 名们.length) {
                  设跑中('')
                  设结果({ 标题: '测试单元（' + 名们.length + ' 个 × ' + 次 + ' 次）', 文字: 行们.join('\n\n') })
                  重读图()
                  return
                }
                var 名 = 名们[序]
                序 += 1
                设跑中('测试 ' + 名 + '（' + 序 + '/' + 名们.length + '）')
                return 调('test.unit', { 项目: props.项目, 蓝图: 当前图, 单元: 名, 次数: 次 })
                  .then(function (r) { 行们.push(概括结果('单元「' + 名 + '」', r)) })
                  .catch(function (e) { 行们.push('单元「' + 名 + '」\n✗ ' + (e && e.message ? e.message : String(e))) })
                  .then(跑下一个)
              }
              跑下一个()
            },
          })
        }

        // 结果弹窗（跑完给结果，长内容能滚）
        function 结果弹窗() {
          if (!结果) return null
          return React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(27,31,36,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 310,
              },
              onClick: function () { 设结果(null) },
            },
            React.createElement(
              'div',
              {
                style: {
                  width: 'min(720px, 90%)',
                  maxHeight: '76%',
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#fff',
                  borderRadius: 10,
                  boxShadow: '0 10px 36px rgba(27,31,36,0.28)',
                  padding: '14px 16px',
                  boxSizing: 'border-box',
                },
                onClick: function (e) { e.stopPropagation() },
              },
              React.createElement('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 8 } }, 结果.标题),
              React.createElement(
                'pre',
                {
                  style: {
                    flex: 1,
                    minHeight: 80,
                    overflow: 'auto',
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.65,
                    color: '#1f2328',
                    background: '#f6f8fa',
                    borderRadius: 8,
                    padding: '10px 12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  },
                },
                结果.文字,
              ),
              React.createElement(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
                React.createElement('button', { style: 样式.小按钮, onClick: function () { 设结果(null) } }, '关闭'),
              ),
            ),
          )
        }

        // 悬浮的三个按钮（左上角，和右上角的自动排列/刷新对称）
        var 悬浮跑 = function () {
          var 钮 = function (键, 文字, 颜色, 点) {
            return React.createElement(
              'button',
              {
                key: 键,
                title: 文字,
                disabled: !!跑中,
                style: Object.assign(
                  {},
                  样式.小按钮,
                  { background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
                  颜色 ? { color: 颜色, borderColor: 颜色 } : {},
                  跑中 ? { opacity: 0.55, cursor: 'progress' } : {},
                ),
                onClick: function (e) {
                  e.stopPropagation()
                  if (!跑中) 点()
                },
              },
              文字,
            )
          }
          return React.createElement(
            'div',
            {
              key: '跑组',
              style: {
                position: 'absolute',
                top: 78,
                left: 14,
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              },
            },
            跑中 ? React.createElement('span', { style: { fontSize: 11, color: '#6e7781', marginRight: 2 } }, 跑中) : null,
            钮('测试', 选.length ? '测试（' + 选.length + '）' : '测试', null, 点测试),
            钮('项目测试', '项目测试', null, function () {
              跑命令('项目测试 · ' + props.项目, 'test.project', { 项目: props.项目 })
            }),
            钮('运行', '运行', '#1a7f37', function () {
              跑命令('运行 · ' + props.项目, 'run', { 项目: props.项目 })
            }),
            // 用户 m13239「现在终止命令能用吗」：正在跑的时候才出现「停止」。
            // 它不走「跑命令」（那会把「跑中」再设一遍），直接发 run.stop：
            // 服务端往目标项目的 运行记录.json 写 要求结束，状态机每轮读一次就中止。
            跑中
              ? React.createElement(
                  'button',
                  {
                    key: '停止',
                    title: '终止：跑到下一个单元边界就停（已经跑完的单元不回滚）',
                    style: Object.assign({}, 样式.小按钮, {
                      background: '#ffffff',
                      color: '#cf222e',
                      borderColor: '#cf222e',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                    }),
                    onClick: function (e) {
                      e.stopPropagation()
                      调('run.stop', { 项目: props.项目 }).then(function (r) {
                        设提示(r && r.ok ? '已发送终止请求，跑到下一个单元边界就停' : '终止失败：' + ((r && r.错误 && r.错误.消息) || '未知原因'))
                      })
                    },
                  },
                  '停止',
                )
              : null,
          )
        }

        // ── 单元编辑弹窗（用户 m15373 草图）──────────────────────────
        // 「方法」框分三段：函数头 + 取数行（只读）、正文（可编辑）、结尾 `}`（只读）
        var 内容弹窗 = function () {
          if (!内容) return null
          var 新建态 = 内容.模式 === '新建'
          var 可编辑 = !新建态 && !内容.读中
          var 只读字 = { color: '#57606a', background: '#f6f8fa' }

          var 上游行 = function (项) {
            var 开 = !!内容.展开[项.名]
            return React.createElement(
              'div',
              { key: 项.名, style: { flexShrink: 0 } },
              React.createElement(
                'div',
                {
                  style: {
                    fontSize: 12,
                    color: '#1f2328',
                    cursor: 'pointer',
                    padding: '2px 0',
                    userSelect: 'none',
                  },
                  onClick: function () {
                    设内容(function (旧) {
                      if (!旧) return 旧
                      var 展 = Object.assign({}, 旧.展开)
                      展[项.名] = !展[项.名]
                      return Object.assign({}, 旧, { 展开: 展 })
                    })
                  },
                },
                '上游单元 ' + 项.名 + (项.来源 === '父图' ? '（父图的子蓝图单元）' : '') + (开 ? ' ▼' : ' ▶'),
              ),
              开
                ? React.createElement(
                    'div',
                    {
                      style: {
                        marginLeft: 16,
                        paddingLeft: 8,
                        borderLeft: '1px dashed #d0d7de',
                        fontSize: 12,
                        color: '#6e7781',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '18px',
                      },
                    },
                    项.功能 || '（这个上游还没写功能描述）',
                  )
                : null,
            )
          }

          var 方法块 = function () {
            return React.createElement(
              'div',
              {
                style: {
                  flex: '1 1 auto',
                  minHeight: 120,
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px dashed #d0d7de',
                  borderRadius: 6,
                  overflow: 'auto',
                  background: '#ffffff',
                  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                  fontSize: 12,
                  lineHeight: '18px',
                },
              },
              React.createElement(
                'div',
                {
                  style: Object.assign({}, 只读字, {
                    padding: '8px 10px 0',
                    whiteSpace: 'pre',
                    borderBottom: '1px dashed #d0d7de',
                    paddingBottom: 6,
                  }),
                },
                内容.读中 ? '（读方法中…）' : 内容.头 || '// 这个单元还没有方法骨架',
              ),
              React.createElement('textarea', {
                value: 内容.体,
                placeholder: 新建态
                  ? '新建时先只写描述 —— 保存后插件会按上游生成骨架，再双击单元进来改正文'
                  : '正文写这里 —— 可以用上面 输入 里的上游数据，最后 return 一个对象',
                spellCheck: false,
                readOnly: !可编辑,
                onChange: function (e) {
                  if (!可编辑) return
                  var 值 = e.target.value
                  设内容(function (旧) { return 旧 ? Object.assign({}, 旧, { 体: 值 }) : 旧 })
                },
                style: {
                  width: '100%',
                  flex: '1 1 auto',
                  minHeight: 80,
                  resize: 'none',
                  boxSizing: 'border-box',
                  padding: '6px 10px',
                  border: 'none',
                  background: 可编辑 ? '#ffffff' : '#f6f8fa',
                  color: 可编辑 ? '#1f2328' : '#57606a',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  lineHeight: '18px',
                  outline: 'none',
                },
              }),
              React.createElement(
                'div',
                {
                  style: Object.assign({}, 只读字, {
                    padding: '0 10px 8px',
                    whiteSpace: 'pre',
                    borderTop: '1px dashed #d0d7de',
                    paddingTop: 6,
                  }),
                },
                内容.尾 || '}',
              ),
            )
          }

          // 顶部描述：主蓝图显示项目描述；子蓝图显示父图那个子蓝图单元的描述（用户 2026-11-21）
          var 描述块 = function () {
            var 是子蓝图 = !!内容.蓝图单元
            var 文字 = 是子蓝图 ? 内容.蓝图描述 : 内容.项目描述
            return React.createElement(
              'div',
              {
                style: {
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: '#f6f8fa',
                  border: '1px solid #d0d7de',
                },
              },
              React.createElement(
                'span',
                { style: { fontSize: 11, color: '#6e7781' } },
                是子蓝图 ? '子蓝图单元「' + 内容.蓝图单元 + '」的描述' : '项目描述',
              ),
              React.createElement(
                'span',
                { style: { fontSize: 12, color: '#1f2328', whiteSpace: 'pre-wrap', lineHeight: '18px' } },
                文字 ||
                  (是子蓝图
                    ? '（父图里这个子蓝图单元还没写描述）'
                    : '（还没有项目描述 —— 在项目文件夹里放一个 项目描述.txt）'),
              ),
            )
          }

          return React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                background: 'rgba(27,31,36,0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 200,
              },
              onWheel: function (e) { e.stopPropagation() },
              onMouseDown: function (e) { e.stopPropagation() },
              onClick: function (e) { e.stopPropagation() },
            },
            React.createElement(
              'div',
              {
                style: {
                  width: 'min(760px, 92%)',
                  height: '72%',
                  background: '#ffffff',
                  borderRadius: 10,
                  boxShadow: '0 10px 36px rgba(27,31,36,0.28)',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '12px 16px',
                  gap: 8,
                  boxSizing: 'border-box',
                },
              },
              // 标题行：单元名 + 关闭
              React.createElement(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 } },
                React.createElement('span', { style: { fontWeight: 600, fontSize: 14 } }, 内容.名),
                新建态 ? React.createElement('span', { style: { fontSize: 11, color: '#9a6700' } }, '新建') : null,
                React.createElement('span', { style: { flex: 1 } }),
                内容.存中 ? React.createElement('span', { style: { fontSize: 11, color: '#6e7781' } }, '保存中…') : null,
                React.createElement(
                  'button',
                  { style: 样式.小按钮, onClick: function () { 设内容(null) } },
                  '关闭',
                ),
              ),
              // 描述块：项目描述 / 子蓝图单元描述（用户 2026-11-21）
              描述块(),
              // 上游单元（折叠）
              内容.上层 && 内容.上层.length
                ? React.createElement(
                    'div',
                    { style: { flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 } },
                    内容.上层.map(上游行),
                  )
                : React.createElement('div', { style: { fontSize: 12, color: '#8c959f', flexShrink: 0 } }, '（没有上游）'),
              React.createElement(
                'div',
                { style: { fontSize: 12, color: '#6e7781', flexShrink: 0 } },
                '此单元描述',
              ),
              React.createElement('textarea', {
                value: 内容.功能,
                placeholder: '这一步要做什么（写方法、跑 AI 都要看它）',
                onChange: function (e) {
                  var 值 = e.target.value
                  设内容(function (旧) { return 旧 ? Object.assign({}, 旧, { 功能: 值 }) : 旧 })
                },
                style: {
                  width: '100%',
                  minHeight: 56,
                  maxHeight: 140,
                  resize: 'none',
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  font: 'inherit',
                  fontSize: 13,
                  lineHeight: '20px',
                  borderRadius: 6,
                  border: '1px dashed #d0d7de',
                  overflow: 'auto',
                  flexShrink: 0,
                },
              }),
              React.createElement(
                'div',
                { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 } },
                React.createElement('span', { style: { fontSize: 12, color: '#6e7781' } }, '方法'),
                React.createElement('span', { style: { fontSize: 11, color: '#9a6700' } },
                  新建态 ? '保存后会生成骨架，才能改正文' : '函数头 / 取数行 / 结尾的 } 由插件生成，不能改',
                ),
              ),
              方法块(),
              内容.错
                ? React.createElement(
                    'div',
                    { style: { fontSize: 12, color: '#cf222e', flexShrink: 0, whiteSpace: 'pre-wrap' } },
                    内容.错,
                  )
                : null,
              // 底部：取消 / 保存
              React.createElement(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 } },
                React.createElement(
                  'button',
                  { style: 样式.小按钮, onClick: function () { 设内容(null) } },
                  '取消',
                ),
                React.createElement(
                  'button',
                  {
                    style: Object.assign({}, 样式.小按钮, {
                      background: 内容.存中 || 内容.读中 ? '#8c959f' : '#1f883d',
                      borderColor: 内容.存中 || 内容.读中 ? '#8c959f' : '#1f883d',
                      color: '#ffffff',
                      cursor: 内容.存中 || 内容.读中 ? 'default' : 'pointer',
                    }),
                    onClick: 存内容,
                  },
                  内容.存中 ? '保存中…' : '保存',
                ),
              ),
            ),
          )
        }

        return React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' } },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', padding: '6px 10px', fontSize: 12, borderBottom: '1px solid var(--dsw-alias-border, #d0d7de)', flexShrink: 0 } },
            路径.map(function (名, 序) {
              return React.createElement(
                'span',
                { key: 名 + 序 },
                序 ? React.createElement('span', { style: { margin: '0 6px', color: '#8c959f' } }, '>>') : null,
                React.createElement(
                  'span',
                  {
                    style: 序 === 路径.length - 1 ? { fontWeight: 600 } : { cursor: 'pointer', color: '#0969da' },
                    onClick: function () { 设路径(路径.slice(0, 序 + 1)) },
                  },
                  名,
                ),
              )
            }),
          ),
          工具栏(),
          // 悬浮在画布右上角的「自动排列」（用户 2026-11-16）
          悬浮排列(),
          // 自动排列下面的「刷新」（用户 2026-11-18）
          悬浮刷新(),
          // 左上角：测试 / 项目测试 / 运行（用户 2026-11-18）
          悬浮跑(),
          // 提示 / 报错统一弹窗（用户 2026-11-16）
          提示弹窗(提示, function () { 设提示('') }),
          确认框 ? 提示弹窗(确认框.文字, function () { 设确认框(null) }, 确认框.动作) : null,
          输入 ? 输入弹窗(输入.标题, 输入.默认, function () { 设输入(null) }, 输入.动作) : null,
          // 测试 / 运行跑完的结果（用户 2026-11-18）
          结果弹窗(),
          React.createElement(
                'div',
                {
                  ref: 画布盒,
                  style: Object.assign(
                    {
                      flex: 1,
                      overflow: 'hidden',
                      position: 'relative',
                      // 读取中转圈；按住了才是手；其余是普通箭头（用户 2026-11-16）
                      cursor: 读中 ? 'progress' : 拖中 ? 'grabbing' : 'default',
                    },
                    // 画布底色跟着一起玻璃化（用户 2026-11-18：只改原来白色那部分）
                    玻璃画布样式(),
                  ),
                  onClick: function () {
                    // 拖完松手会顺带触发一次 click，别把选中清掉（300ms 内算拖动）
                    if (Date.now() - 刚拖过.current < 300) return
                    清选()
                  },
                  onWheel: 缩放,
                  onMouseDown: 按下,
                  onMouseMove: 移动,
                  onMouseUp: 松开,
                  onMouseLeave: function (e) {
                    // 拉线时鼠标一离开画布就算放弃，免得在画布外松手也算建向量
                    if (拉线) {
                      设拉线(null)
                      设悬(null)
                      return
                    }
                    松开(e)
                  },
                },
                详情
                  ? (function () {
                      var 找 = 单元们.filter(function (x) { return x.名 === 详情 })[0]
                      return 找 ? 详情面板(找, function () { 设详情(null) }) : null
                    })()
                  : null,
                React.createElement(
                  'svg',
                  {
                    width: 布.宽,
                    height: 布.高,
                    style: {
                      display: 'block',
                      // 缩放 + 平移都落在这个 svg 上（用户 2026-11-16）
                      transform: 'translate(' + 视图.x + 'px,' + 视图.y + 'px) scale(' + 视图.k + ')',
                      transformOrigin: '0 0',
                    },
                  },
                  React.createElement(
                    'defs',
                    null,
                    React.createElement(
                      'marker',
                      {
                        id: 'blueprint-tree-arrow',
                        viewBox: '0 0 10 10',
                        refX: 9,
                        refY: 5,
                        markerWidth: 6,
                        markerHeight: 6,
                        orient: 'auto-start-reverse',
                      },
                      React.createElement('path', { d: 'M0 0 L10 5 L0 10 z', fill: 向量色(false) }),
                    ),
                    React.createElement(
                      'marker',
                      {
                        id: 'blueprint-tree-arrow-red',
                        viewBox: '0 0 10 10',
                        refX: 9,
                        refY: 5,
                        markerWidth: 6,
                        markerHeight: 6,
                        orient: 'auto-start-reverse',
                      },
                      React.createElement('path', { d: 'M0 0 L10 5 L0 10 z', fill: 向量色(true) }),
                    ),
                    React.createElement(
                      'marker',
                      {
                        id: 'blueprint-tree-arrow-blue',
                        viewBox: '0 0 10 10',
                        refX: 9,
                        refY: 5,
                        markerWidth: 6,
                        markerHeight: 6,
                        orient: 'auto-start-reverse',
                      },
                      React.createElement('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#0969da' }),
                    ),
                  ),
                  React.createElement('g', null, 箭头们),
                  // 正在拉的那根线（用户 2026-11-16 创建向量）
                  拉线 && 位[拉线.从]
                    ? (function () {
                        var 源 = 单元们.filter(function (x) { return x.名 === 拉线.从 })[0]
                        return React.createElement('line', {
                          x1: 位[拉线.从].x,
                          y1: 形下沿(源 || { 类型: '硬' }, 位[拉线.从].y),
                          x2: 拉线.x,
                          y2: 拉线.y,
                          stroke: '#0969da',
                          strokeWidth: 1.6,
                          strokeDasharray: '5 4',
                          markerEnd: 'url(#blueprint-tree-arrow-blue)',
                        })
                      })()
                    : null,
                  React.createElement(
                    'g',
                    null,
                    单元们.map(function (u) {
                      // 循环向量画成红色箭头，不画节点（用户 m05844）
                      if (u.类型 === '循环向量') return null
                      var c = 位[u.名]
                      if (!c) return null
                      // 单击选中（子蓝图也能选，双击仍然进子图）
                      var 点 = function (e) { e.stopPropagation(); 点单元(e, u.名) }
                      var g = 单元图形(u, c.x, c.y, 点, 选.indexOf(u.名) !== -1)
                      // 悬停（或正在从它拉线）时，下方中部露一个小圆圈
                      var 露 = 悬 === u.名 || (拉线 && 拉线.从 === u.名)
                      // 按住拖动 = 改坐标；子蓝图双击还要进子图
                      return React.createElement(
                        'g',
                        {
                          key: u.名 + '-hit',
                          onMouseDown: function (e) { 拖单元(e, u) },
                          onMouseEnter: function () { 设悬(u.名) },
                          onMouseLeave: function () {
                            if (悬 === u.名) 设悬(null)
                          },
                          onDoubleClick:
                            u.类型 === '子蓝图'
                              ? function () { 设路径(路径.concat(u.名)) }
                              : function (e) { e.stopPropagation(); 开内容(u.名) },
                          style: { cursor: 拖位 && 拖位.名 === u.名 ? 'grabbing' : 'pointer' },
                        },
                        g,
                        露
                          ? React.createElement('circle', {
                              key: 'out',
                              cx: c.x,
                              cy: 形下沿(u, c.y),
                              r: 5,
                              fill: '#0969da',
                              stroke: '#ffffff',
                              strokeWidth: 1.5,
                              onMouseDown: function (e) { 开始拉线(e, u.名) },
                              onMouseEnter: function () { 设悬(u.名) },
                              style: { cursor: 'crosshair' },
                            })
                          : null,
                      )
                    }),
                  ),
                ),
                内容弹窗(),
              ),
        )
      }
      return 组件
    })()

    // ═══════════════════════════════════════════════════════════
    // 面板
    // ═══════════════════════════════════════════════════════════

    function 面板() {
      var useState = React.useState
      var useEffect = React.useEffect

      var _项目们 = useState([])
      var 项目们 = _项目们[0]
      var 设项目们 = _项目们[1]

      // 毛玻璃设置（主题设置.json）读回来后重画一次（用户 2026-11-18）
      var _玻璃版 = useState(0)
      // 根节点盒子：挂上 backdrop-filter 后它会变成 fixed 后代的包含块，
      // 右键菜单这类按视口坐标摆放的东西要减掉它的原点（用户 2026-11-18）。
      var 根盒 = React.useRef(null)
      function 面板原点() {
        if (!根盒.current) return { left: 0, top: 0 }
        return 根盒.current.getBoundingClientRect()
      }
      useEffect(function () {
        var 收 = function () {
          _玻璃版[1](function (n) {
            return n + 1
          })
        }
        玻璃听众.push(收)
        读玻璃设置()
        return function () {
          var i = 玻璃听众.indexOf(收)
          if (i !== -1) 玻璃听众.splice(i, 1)
        }
      }, [])

      // 读取中：不弹窗，鼠标转圈（用户 2026-11-16）
      var _读中 = useState(true)
      var 读中 = _读中[0]
      var 设读中 = _读中[1]

      var _选中 = useState(null)
      var 选中 = _选中[0]
      var 设选中 = _选中[1]

      // 多选（用户 2026-11-16：类似 Windows 资源管理器 —— 单击选中、
      // Ctrl 单击切换、Shift 单击选区间、双击进入、右键出菜单）
      var _选 = useState([])
      var 选 = _选[0]
      var 设选 = _选[1]
      var _锚 = useState(null)
      var 锚 = _锚[0]
      var 设锚 = _锚[1]

      // 右键菜单：{ x, y, 名 } | null
      var _菜单 = useState(null)
      var 菜单 = _菜单[0]
      var 设菜单 = _菜单[1]

      var _提示 = useState('')
      var 提示 = _提示[0]
      var 设提示 = _提示[1]

      // 确认框（用户 2026-11-16：「删除的确认也是一样的弹窗」）
      var _确认框 = useState(null)
      var 确认框 = _确认框[0]
      var 设确认框 = _确认框[1]

      var _弹窗 = useState(false)
      var 弹窗 = _弹窗[0]
      var 设弹窗 = _弹窗[1]

      // 「添加已有项目」（用户 2026-11-16：「添加是添加已有的,比如别人给的」）
      var _加弹窗 = useState(false)
      var 加弹窗 = _加弹窗[0]
      var 设加弹窗 = _加弹窗[1]
      var _加的路径 = useState(上次目录)
      var 加的路径 = _加的路径[0]
      var 设加的路径 = _加的路径[1]
      var _加的名 = useState('')
      var 加的名 = _加的名[0]
      var 设加的名 = _加的名[1]

      // 选目录用的隐藏 input（Electron 里可以用 webkitdirectory 直接弹文件夹选择器）
      var 目录选择器 = React.useRef(null)

      // 蓝图路径（面包屑）：用户 2026-11-15「上方用类似目录的方式展示 主蓝图>>子蓝图1>>子蓝图2」
      var _路径 = useState(['主蓝图'])
      var 路径 = _路径[0]
      var 设路径 = _路径[1]

      // 记住上次填的目录（用户 2026-11-16：「新建项目的目录上做个记忆功能,记住上次填的内容」）
      var 记忆键 = 'blueprint-tree:上次目录'
      var 上次目录 = ''
      try { 上次目录 = window.localStorage.getItem(记忆键) || '' } catch (e) { 上次目录 = '' }

      var _输入的路径 = useState(上次目录)
      var 输入的路径 = _输入的路径[0]
      var 设输入的路径 = _输入的路径[1]

      function 设路径带记(值) {
        设输入的路径(值)
        try { window.localStorage.setItem(记忆键, 值) } catch (e) {}
      }

      var _输入的名单 = useState('')
      var 输入的名单 = _输入的名单[0]
      var 设输入的名单 = _输入的名单[1]

      function 刷新() {
        设读中(true)
        调('project.list', {}).then(function (r) {
          设读中(false)
          if (r && r.ok) {
            var 名单 = (r.数据 && r.数据.项目) || []
            设项目们(名单)
            设提示(名单.length ? '' : '还没有项目，点右上角「新建」')
          } else {
            设提示('读取失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
          }
        })
      }

      useEffect(function () {
        刷新()
      }, [])

      // 用户 2026-11-18：切换页面时自动刷新 —— 从蓝图页退回项目页，重读一次项目列表
      var 上一个选中 = React.useRef(null)
      useEffect(function () {
        if (上一个选中.current && !选中) 刷新()
        上一个选中.current = 选中
      }, [选中])

      // 项目页的刷新信号：AI 调 page.refresh 时也把项目列表重读一遍
      useEffect(function () {
        var 停 = false
        var 基准 = null
        function 问一次() {
          调('page.signal')
            .then(function (r) {
              if (停 || !r || !r.ok) return
              var 号 = Number((r.数据 || {}).序号)
              if (!isFinite(号)) return
              if (基准 === null) {
                基准 = 号
                return
              }
              if (号 !== 基准) {
                基准 = 号
                刷新()
              }
            })
            .catch(function () {})
        }
        问一次()
        var 定时 = setInterval(问一次, 2500)
        return function () {
          停 = true
          clearInterval(定时)
        }
      }, [])

      // 右键菜单：点别处 / 滚动就关掉
      useEffect(function () {
        if (!菜单) return
        var 关 = function () { 设菜单(null) }
        document.addEventListener('click', 关)
        document.addEventListener('scroll', 关, true)
        return function () {
          document.removeEventListener('click', 关)
          document.removeEventListener('scroll', 关, true)
        }
      }, [菜单])

      function 新建() {
        var 名 = 输入的名单.trim()
        var 路径 = 输入的路径.trim()
        if (!名) {
          设提示('名字不能是空的')
          return
        }
        设提示('新建中…')
        调('project.create', { 名: 名, 路径: 路径 }).then(function (r) {
          if (r && r.ok) {
            设弹窗(false)
            设输入的名单('')
            // 记住这次填的目录，下次新建直接带出来
            设路径带记(路径)
            刷新()
          } else {
            设提示('新建失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
          }
        })
      }

      // 添加一个已经存在的项目目录（别人给的、或 AI 建在别处的）
      function 添加() {
        var 目录 = 加的路径.trim()
        if (!目录) {
          设提示('目录不能是空的')
          return
        }
        设提示('添加中…')
        调('project.add', { 目录: 目录, 名: 加的名.trim() }).then(function (r) {
          if (r && r.ok) {
            设加弹窗(false)
            设加的名('')
            设路径带记(目录)
            刷新()
          } else {
            设提示('添加失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
          }
        })
      }

      // 打开文件夹选择器（Electron 里 webkitdirectory 会弹「选择文件夹」）
      function 选目录(设值) {
        var 存 = function (e) {
          var 文件 = e.target.files && e.target.files[0]
          var 全 = 文件 && (文件.path || '')
          if (全) {
            // 拿第一个文件的全路径，砍掉文件名就是所在目录
            var 目录 = 全.replace(/[\\/][^\\/]*$/, '')
            if (目录) 设值(目录)
          }
          e.target.value = ''
        }
        var 元素 = 目录选择器.current
        if (!元素) return
        元素.onchange = 存
        元素.click()
      }

      // 单击：普通单击选中一个；Ctrl 切换；Shift 从锚点选到这一个
      function 点(e, 名) {
        设菜单(null)
        var 名单 = 项目们.map(function (p) { return p.名 })
        if (e.ctrlKey || e.metaKey) {
          var 有 = 选.indexOf(名) !== -1
          设选(有 ? 选.filter(function (x) { return x !== 名 }) : 选.concat([名]))
          设锚(名)
        } else if (e.shiftKey && 锚) {
          var a = 名单.indexOf(锚)
          var b = 名单.indexOf(名)
          if (a !== -1 && b !== -1) {
            var 起 = Math.min(a, b)
            var 止 = Math.max(a, b)
            设选(名单.slice(起, 止 + 1))
          }
        } else {
          设选([名])
          设锚(名)
        }
      }

      // 双击：进入项目（蓝图视图）
      function 进(名) {
        设选([名])
        设锚(名)
        设选中(名)
      }

      // 右键：先只做一个「删除」
      function 右键(e, 名) {
        e.preventDefault()
        e.stopPropagation()
        if (选.indexOf(名) === -1) {
          设选([名])
          设锚(名)
        }
        设菜单({ x: e.clientX, y: e.clientY, 名: 名 })
      }

      // 删除项目也走同一个确认弹窗（用户 2026-11-16）
      function 删除(p) {
        var 名 = p.名
        设确认框({
          文字: '删除项目「' + 名 + '」？\n\n文件夹会被真的删掉。',
          动作: function () {
            设提示('删除中…')
            调('project.remove', { 项目: 名 }).then(function (r) {
              if (r && r.ok) {
                if (选中 === 名) 设选中(null)
                设选(选.filter(function (x) { return x !== 名 }))
                刷新()
              } else {
                设提示('删除失败：' + ((r && r.错误 && r.错误.消息) || '未知'))
              }
            })
          },
        })
      }

      // 多选删除（用户 2026-11-16：「项目界面多选删除无效」）
      // 逐个删，删完统一提示失败的，然后刷新
      function 删除多个(名单) {
        var 副本 = 名单.slice()
        if (!副本.length) return
        设确认框({
          文字:
            '删掉这 ' + 副本.length + ' 个项目？\n\n' +
            副本.join('、') +
            '\n\n文件夹会被真的删掉。',
          动作: function () {
            var 队列 = 副本.slice()
            var 失败 = []
            var 走 = function () {
              if (!队列.length) {
                设选([])
                设锚(null)
                设提示(失败.length ? 失败.join('；') : '')
                return 刷新()
              }
              var 名 = 队列.shift()
              return 调('project.remove', { 项目: 名 }).then(function (r) {
                if (!r || !r.ok) 失败.push((r && r.错误 && r.错误.消息) || ('删「' + 名 + '」失败'))
                return 走()
              })
            }
            return 走()
          },
        })
      }

      // 键盘 Delete / Backspace 删选中（在项目列表页才生效，输入框里不拦）
      useEffect(function () {
        if (选中) return
        var 按 = function (e) {
          var 标签 = (e.target && e.target.tagName || '').toUpperCase()
          if (标签 === 'INPUT' || 标签 === 'TEXTAREA') return
          if (e.key !== 'Delete' && e.key !== 'Backspace') return
          if (!选.length) return
          e.preventDefault()
          删除多个(选)
        }
        window.addEventListener('keydown', 按)
        return function () { window.removeEventListener('keydown', 按) }
      }, [选, 选中])

      var 弹窗元素 = 弹窗
        ? React.createElement(
            'div',
            { style: 样式.遮罩, onClick: function () { 设弹窗(false) } },
            React.createElement(
              'div',
              { style: 样式.弹窗, onClick: function (e) { e.stopPropagation() } },
              React.createElement('div', { style: { fontWeight: 600 } }, '新建项目'),
              React.createElement('input', {
                style: 样式.输入,
                placeholder: '项目名（也是文件夹名）',
                value: 输入的名单,
                onChange: function (e) { 设输入的名单(e.target.value) },
                autoFocus: true,
              }),
              // 目录 + 右边的「打开文件夹」（用户 2026-11-16）
              React.createElement(
                'div',
                { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                React.createElement('input', {
                  style: Object.assign({}, 样式.输入, { flex: 1 }),
                  placeholder: '放在哪个目录（留空 = 默认测试目录）',
                  value: 输入的路径,
                  onChange: function (e) { 设路径带记(e.target.value) },
                }),
                React.createElement(
                  'button',
                  {
                    style: 样式.按钮,
                    onClick: function () { 选目录(设路径带记) },
                  },
                  '打开文件夹',
                ),
              ),
              React.createElement(
                'div',
                { style: 样式.弹窗按钮行 },
                React.createElement('button', { style: 样式.按钮, onClick: function () { 设弹窗(false) } }, '取消'),
                React.createElement('button', { style: 样式.按钮, onClick: 新建 }, '创建'),
              ),
            ),
          )
        : null

      // 添加已有项目（用户 2026-11-16：「添加是添加已有的,比如别人给的」）
      var 加弹窗元素 = 加弹窗
        ? React.createElement(
            'div',
            { style: 样式.遮罩, onClick: function () { 设加弹窗(false) } },
            React.createElement(
              'div',
              { style: 样式.弹窗, onClick: function (e) { e.stopPropagation() } },
              React.createElement('div', { style: { fontWeight: 600 } }, '添加已有项目'),
              React.createElement(
                'div',
                { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                React.createElement('input', {
                  style: Object.assign({}, 样式.输入, { flex: 1 }),
                  placeholder: '项目文件夹（里面要有 flow.json）',
                  value: 加的路径,
                  onChange: function (e) { 设加的路径(e.target.value) },
                  autoFocus: true,
                }),
                React.createElement(
                  'button',
                  { style: 样式.按钮, onClick: function () { 选目录(设加的路径) } },
                  '打开文件夹',
                ),
              ),
              React.createElement('input', {
                style: 样式.输入,
                placeholder: '项目名（留空 = 用文件夹名）',
                value: 加的名,
                onChange: function (e) { 设加的名(e.target.value) },
              }),
              React.createElement(
                'div',
                { style: 样式.弹窗按钮行 },
                React.createElement('button', { style: 样式.按钮, onClick: function () { 设加弹窗(false) } }, '取消'),
                React.createElement('button', { style: 样式.按钮, onClick: 添加 }, '添加'),
              ),
            ),
          )
        : null

      // 文件夹选择器本体：放在最外层，display:none，点按钮时代点
      var 目录选择器元素 = React.createElement('input', {
        key: '目录选择器',
        type: 'file',
        webkitdirectory: '',
        directory: '',
        multiple: true,
        ref: 目录选择器,
        style: { display: 'none' },
      })

      var 内容 = 选中
        ? React.createElement(蓝图视图, { 项目: 选中 })
        : 项目们.length
        ? React.createElement(
            'div',
            { style: 样式.列表 },
            项目们.map(function (p) {
              var 名 = p.名 || ''
              var 选中了 = 选.indexOf(名) !== -1
              return React.createElement(
                'div',
                {
                  key: 名,
                  style: 选中了 ? Object.assign({}, 样式.行, 样式.行选中) : 样式.行,
                  onClick: function (e) { e.stopPropagation(); 点(e, 名) },
                  onDoubleClick: function () { 进(名) },
                  onContextMenu: function (e) { 右键(e, 名) },
                },
                React.createElement(图标, { size: 14 }),
                React.createElement('span', { style: 样式.行名 }, 名),
              )
            }),
          )
        : React.createElement('div', { style: 样式.空 }, '还没有项目', React.createElement('br'), '点右上角「新建」开始')

      return React.createElement(
        'div',
        {
          ref: 根盒,
          style: Object.assign(
            {},
            样式.根,
            玻璃根样式(),
            读中 ? { cursor: 'progress' } : null,
          ),
          // 点插件页面其他区域就取消选中（用户 2026-11-16）；向量选中也一样清掉
          onClick: function () { 设选([]); 设锚(null); 设选线(null) },
        },
        React.createElement(
          'div',
          { style: 样式.头 },
          React.createElement(图标, { size: 16 }),
          React.createElement('span', { style: 样式.项目名 }, 选中 || '项目'),
          // 进入项目后（蓝图视图），右上角只留「返回」——用户 2026-11-16：
          // 「进入项目后,右上角的刷新和新建按钮删掉,换成返回,能返回到项目选择页面」
          选中
            ? React.createElement(
                'button',
                { style: 样式.按钮, onClick: function () { 设选中(null); 设路径(['主蓝图']); 设提示('') } },
                '返回',
              )
            : [
                React.createElement('button', { key: '刷新', style: 样式.按钮, onClick: 刷新 }, '刷新'),
                // 「添加」= 登记别人给的项目文件夹（用户 2026-11-16）
                React.createElement(
                  'button',
                  {
                    key: '添加',
                    style: 样式.按钮,
                    onClick: function () { 设加的路径(输入的路径 || 上次目录); 设加弹窗(true) },
                  },
                  '添加',
                ),
                React.createElement(
                  'button',
                  { key: '新建', style: 样式.按钮, onClick: function () { 设弹窗(true) } },
                  '新建',
                ),
              ],
        ),
        内容,
        // 提示 / 报错统一弹窗（用户 2026-11-16）
        提示弹窗(提示, function () { 设提示('') }),
        确认框 ? 提示弹窗(确认框.文字, function () { 设确认框(null) }, 确认框.动作) : null,
        弹窗元素,
        加弹窗元素,
        目录选择器元素,
        // 右键菜单（用户 2026-11-16：「项目界面右键先只做一个删除选项」）
        菜单
          ? React.createElement(
              'div',
              {
                key: '菜单',
                style: {
                  // ⚠ 根节点挂了 backdrop-filter 之后会成为 fixed 后代的包含块，
                  //   这里的 left/top 要减去面板原点，否则菜单会整体偏出去
                  //   （用户 2026-11-18 加毛玻璃时踩到）。
                  position: 'fixed',
                  left: 菜单.x - 面板原点().left,
                  top: 菜单.y - 面板原点().top,
                  zIndex: 1000,
                  background: 'var(--dsw-alias-bg-elevated, #fff)',
                  border: '1px solid var(--dsw-alias-border, #d0d7de)',
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(140,149,159,0.2)',
                  padding: '4px 0',
                  minWidth: 120,
                },
                onContextMenu: function (e) { e.preventDefault() },
              },
              React.createElement(
                'div',
                {
                  style: { padding: '6px 12px', fontSize: 12, cursor: 'pointer' },
                  onClick: function () {
                    var 名 = 菜单.名
                    设菜单(null)
                    // 右键点在多选区域里 ⇒ 删整批（用户 2026-11-16）
                    if (选.length > 1 && 选.indexOf(名) !== -1) {
                      删除多个(选)
                      return
                    }
                    var p = 项目们.filter(function (x) { return x.名 === 名 })[0] || { 名: 名 }
                    删除(p)
                  },
                },
                (function () {
                  if (选.length > 1 && 选.indexOf(菜单.名) !== -1) return '删除选中的 ' + 选.length + ' 个'
                  return '删除'
                })(),
              ),
            )
          : null,
      )
    }

    // ═══════════════════════════════════════════════════════════
    // 错误边界（面板内抛错时把错误画出来，不卸成白屏）
    // ═══════════════════════════════════════════════════════════

    function 面板错误边界() {
      var React2 = React
      function 边界(props) {
        React2.Component.call(this, props)
        this.state = { 错误: null }
      }
      边界.prototype = Object.create(React2.Component.prototype)
      边界.prototype.constructor = 边界
      边界.getDerivedStateFromError = function (e) {
        return { 错误: e }
      }
      边界.prototype.render = function () {
        if (this.state.错误) {
          return React2.createElement(
            'div',
            { style: { padding: 16, fontSize: 12, color: 'var(--dsw-alias-text-secondary, #57606a)' } },
            '面板出错了：',
            React2.createElement('pre', { style: { whiteSpace: 'pre-wrap', marginTop: 8 } },
              String((this.state.错误 && this.state.错误.stack) || this.state.错误)),
          )
        }
        return this.props.children
      }
      return React2.createElement(边界, null, React2.createElement(面板))
    }

    // ═══════════════════════════════════════════════════════════
    // 注册
    // ═══════════════════════════════════════════════════════════

    exports.apply = function (ctx) {
      // ⚠ 必须 `ctx.inject(...)` + `scope.effect(...)` 两层：cordis 只收集
      //   effect 的返回值，inject 回调的返回值会被丢掉，于是卸载时拆不干净。
      ctx.inject(['sidebarRightTabs', 'sidebarRight'], function (scope) {
        scope.effect(function () {
          var disposers = []
          var 记 = function (d) {
            if (typeof d === 'function') disposers.push(d)
          }

          // ① 标签类型（进入选项本身）
          try {
            记(
              scope.sidebarRightTabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: 'extension',
                title: function () { return 标题 },
                guide: [
                  {
                    order: 40,
                    title: function () { return 标题 },
                    description: function () { return '项目管理 / 蓝图 / 运行（功能逐步加上）' },
                    icon: 图标,
                  },
                ],
              }),
            )
          } catch (e0) {
            console.warn('[' + PKG + '] 标签类型注册失败（可能是上次重载的残留），继续注册正文：', e0)
          }

          // ② 座位正文：key 必须等于上面的类型 id
          try {
            记(
              scope.slots.inject('sidebar.right.pane.tab', function () {
                return scope.slots.register(
                  { name: 'sidebar.right.pane.tab', key: TAB_ID, registrant: PKG },
                  function (props) {
                    return React.createElement(面板错误边界, props)
                  },
                )
              }),
            )
          } catch (e1) {
            console.warn('[' + PKG + '] 侧边栏正文注册失败：', e1)
          }

          return function () {
            for (var i = 0; i < disposers.length; i++) {
              try {
                disposers[i]()
              } catch (e) {
                /* 撤销失败不能盖住原始错误 */
              }
            }
          }
        }, PKG + ': 右侧栏入口（标签类型 + 座位正文）')
      })
    }

    return exports
  },
})
