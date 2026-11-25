// 运行方法 —— 真正把一张蓝图跑起来
//
// 用户 2026-11-15 定（原话）：
//   「先看之前运行方法和测试方法哪个最后执行,是测试方法就把测试方法标报错的全标失效
//    再启动开始单元,否则直接启动开始单元」
//   「运行方法输入项目吧,这个方法只会改状态+启动项目唯一的开始单元」
//
// ⇒ 所以**只收「项目」一个参数**，蓝图固定是主蓝图（`配置.蓝图.默认名`）。
//
// 三步：
//   ① 读 运行记录.json —— 上次是「测试」就把那批报错的单元改成「失效」并写盘
//   ② 过一遍检查表里 `run` 那行（A1/C1/C2 拦，C3-C6 记改动）
//   ③ 启动开始单元（交给 状态机.跑）

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 读登记表, 登记, 注销 } from '../登记表.ts'
import { 读方法文件, 历史变量名, 分隔符, 当前变量名, 唯一历史键, 搬进历史, 裁历史 } from '../方法命令.ts'
import { 切方法, 列出方法 } from '../方法文件.ts'
import { 跑检查, 拦的消息 } from '../跑检查.ts'
import { 查单元, 查连线, 查锚点, 查子蓝图文件, 查方法, 查规模, 查硬单元, 查循环, 汇总 } from '../校验.ts'
import { 应当停止, 读运行记录, 写运行记录, 新运行标识, 清运行 } from '../运行记录.ts'
import type { 测试报错 } from '../运行记录.ts'
import { 写状态, 写蓝图状态 } from '../状态写入.ts'
import { 同步方法文件 } from '../方法同步.ts'
import { 算同步性, 算上层, 结束标记, 找环, 环形修正 } from '../蓝图工具.ts'
import { 规整单元 } from './unit-add.ts'
import { 写方法 } from './method-edit.ts'
import { 还原方法 } from './method-restore.ts'
import { 生成方法 } from './method-generate.ts'
import { 改键前缀 } from '../方法文件.ts'
import { 造读子图 } from '../蓝图文件.ts'
import { 取字段表, 造输出 } from '../随机数据.ts'
import { 跑 } from '../状态机.ts'
import type { 上游输入, 单元方法, 日志记录 } from '../状态机.ts'
import { 简化行, 写日志 } from '../运行日志.ts'
import type { 蓝图, 单元 } from './unit-add.ts'
import { 加载方法 } from '../方法加载.ts'
import { 问AI } from '../ai.ts'
import { 看图 as 看图命令 } from './blueprint-graph.ts'
import { 自动排列 as 排列命令 } from './blueprint-arrange.ts'
import { 结束运行 as 结束运行命令 } from './end.ts'

export const 运行方法: 命令定义 = {
  名: 'run',
  说明:
    '跑一个项目：先把上次测试标的报错落地成「失效」，再启动主蓝图的开始单元。只收「项目」，蓝图固定主蓝图',
  中文: ['运行方法', '运行', '跑', '执行蓝图', '启动'],
  async 执行(参数) {
    // ① 定位项目（只认项目名，不认路径）
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const 项目目录 = 定.数据.项目目录
    const 项目名 = 定.数据.项目名

    const 配置 = 生效配置(项目名, 项目目录)
    // ⚠️ 运行方法只跑主蓝图 —— 用户 2026-11-15：「启动项目唯一的开始单元」
    const 主蓝图名 = 配置.蓝图.默认名
    const 主图文件 = path.join(项目目录, 产物文件名(配置, 主蓝图名).蓝图)
    if (!fs.existsSync(主图文件)) {
      return 失败('不存在', `主蓝图不存在：${主蓝图名}`, 主蓝图名)
    }

    const 读蓝图 = (名: string): 蓝图 | undefined => {
      const 文件 = path.join(项目目录, 产物文件名(配置, 名).蓝图)
      if (!fs.existsSync(文件)) return undefined
      try {
        return JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
      } catch {
        return undefined
      }
    }

    // 全项目蓝图名 —— 子图套子图回溯时要用它找「这张图是谁的子蓝图」
    const 蓝图名们 = (): string[] => {
      try {
        return fs
          .readdirSync(项目目录)
          .filter((f) => f.endsWith('.json') && f !== 'flow.json')
          .map((f) => f.slice(0, -'.json'.length))
          .filter((名) => !!读蓝图(名)?.单元)
      } catch {
        return []
      }
    }

    // ② 用户 m13658：「运行时报错改失效」—— 跑之前把上一次留下的「报错」单元落到「失效」
    //    （测试失败会把单元标成报错，运行开始时才是它变成失效的时机）
    const 落地: string[] = []
    for (const 名 of 蓝图名们()) {
      const 图 = 读蓝图(名)
      if (!图) continue
      const 表: Record<string, string> = {}
      for (const u of 图.单元) if (u.状态 === '报错') 表[u.名] = '失效'
      if (!Object.keys(表).length) continue
      const 改了 = 写蓝图状态(项目目录, 配置, 名, 表)
      落地.push(...改了)
    }
    // 兼容旧记录：上次是「测试」且写了 测试报错（老版本靠这份记录落地），也一并落
    const 记录 = 读运行记录(项目目录)
    if (记录.上次 === '测试' && 记录.测试报错.length) {
      const 按蓝图 = new Map<string, Record<string, string>>()
      for (const e of 记录.测试报错) {
        const 表 = 按蓝图.get(e.蓝图) ?? {}
        表[e.单元] = '失效'
        按蓝图.set(e.蓝图, 表)
      }
      for (const [图名, 表] of 按蓝图) 落地.push(...写蓝图状态(项目目录, 配置, 图名, 表))
    }

    // ③ 跑之前先过检查（A1/C1/C2 拦，C3-C6 记改动）
    const 主图 = 读蓝图(主蓝图名)!
    const 检查 = 跑检查('run', {
      蓝图: 主图,
      蓝图名: 主蓝图名,
      是不是子蓝图: false,
      限制: 配置.限制,
      有子蓝图文件: (子名) =>
        fs.existsSync(path.join(项目目录, 产物文件名(配置, 子名).蓝图)),
      读子图: 读蓝图,
    })
    if (检查.拦.length) {
      // 检查没通过 ⇒ 一个字节都不写（连「上次是测试」的记录也留着，下次还能落地）
      return 失败('校验', 拦的消息(检查.拦), 检查.拦[0].码)
    }
    const 改动 = 检查.改.map((p) =>
      `${p.码}|${p.消息}|${p.位置 ?? ''}`.replace(/\|+$/, ''),
    )

    // ④ 启动开始单元
    // 方法按蓝图分文件 ⇒ 先把整棵树的方法都收齐（同名以先加载的为准，后者不覆盖）
    const 方法: Record<string, import('../状态机.ts').单元方法> = {}
    const 收方法 = async (图名: string, 已看: Set<string>): Promise<void> => {
      if (已看.has(图名)) return
      已看.add(图名)
      const 表 = await 加载方法(项目目录, 配置, 图名)
      for (const [名, 方法体] of Object.entries(表)) if (!方法[名]) 方法[名] = 方法体
      const 图 = 读蓝图(图名)
      for (const u of 图?.单元 ?? []) {
        if (u.类型 === '子蓝图') await 收方法(u.名, 已看)
      }
    }
    await 收方法(主蓝图名, new Set<string>())
    const 共享数据: Record<string, Record<string, Record<string, unknown>>> = {}

    // 用户 2026-11-16：没方法的单元直接交给 AI 处理（不是让它写代码）。
    // 有些单元本来就没法用代码写；AI 能跑通说明「功能」说明够用，
    // 再考虑固化成方法 —— 那一步是人机协同，在对话里做，运行时绝不偷偷写盘。
    const ai跑过: string[] = []
    // 判断单元的原始回答（排查它到底选了哪条路用）
    const 判断记录: string[] = []
    const ai处理 = async (
      图名: string,
      单元名: string,
      输入: ReadonlyArray<{ 来源: string; 数据: Record<string, unknown> }>,
    ): Promise<string | Record<string, unknown>> => {
      const 图 = 读蓝图(图名)
      const 本 = 图?.单元.find((x) => x.名 === 单元名)
      const 说明 = (本?.功能 ?? '').trim()
      if (!说明) {
        throw new Error(
          `单元「${单元名}」没有「功能」说明，AI 无从下手（先用 unit.update 把这一步要做什么写进功能）`,
        )
      }
      const 上游行 = 输入.map((i) => {
        const 上 = 图?.单元.find((x) => x.名 === i.来源)
        const 上说明 = (上?.功能 ?? '').trim()
        return `- ${i.来源}${上说明 ? `（${上说明}）` : ''}：${JSON.stringify(i.数据)}`
      })
      const 下游 = 本?.下层 ?? []
      const 是判断 = 本?.类型 === '选择'
      const 可选下游 = 下游.map((下) => (下 === 结束标记 ? '结束' : 下))
      const 系统 = [
        '你在一个数据流图里充当其中一个单元的实现。',
        '你只拿到这个单元要做什么（说明）和上游交过来的数据，没有代码。',
        是判断
          ? '这是判断单元：先用一两句话说明判断依据，最后**单独一行**写 `走：<下游名>`（多个用顿号），只能写这些名字之一或多个：' +
            `${可选下游.length ? 可选下游.join('、') : '（没有下游）'}。` +
            '除了这一行，正文里不要出现任何下游名字，也不要出现「结束」两个字。'
          : '直接给出处理结果：一段纯文本。不要解释、不要代码块围栏、不要任何前后缀。',
      ].join('\n')
      const 用户 = [
        `单元：${单元名}`,
        `要做什么：${说明}`,
        上游行.length ? `上游数据：\n${上游行.join('\n')}` : '上游数据：无',
        `下游会拿这段结果去用：${可选下游.length ? 可选下游.join('、') : '无'}`,
      ].join('\n\n')
      const 文本 = await 问AI(系统, 用户)
      ai跑过.push(`${图名}·${单元名}`)
      // 用户 2026-11-16：选择单元的下游这么定 ——「返回的文本中包含哪几个下游的名字就启动哪几个」。
      // 正文里顺口提到名字不该算数，所以优先只认最后一行「走：…」；没有这一行才退回全文。
      if (!是判断) return 文本
      判断记录.push(`${图名}·${单元名}：${文本}`)
      const 行们 = 文本
        .split(/\r?\n/)
        .map((行) => 行.trim())
        .filter(Boolean)
      const 末行 = 行们.length ? 行们[行们.length - 1] : ''
      const 依据 = /走[:：]/.test(末行) ? 末行 : 文本
      const 输出: Record<string, unknown> = { 文本 }
      for (const 下 of 下游) {
        const 词 = 下 === 结束标记 ? '结束' : 下
        输出[`Start_${下}`] = 依据.includes(词)
      }
      return 输出
    }

    // 用户 2026-11-15：每个单元跑完就改状态（不是一起改）
    const 改成正常: string[] = []
    const 改正常并写盘 = (图名: string, 单元名: string): void => {
      const 图 = 读蓝图(图名)
      if (!图) return
      const u = 图.单元.find((x) => x.名 === 单元名)
      if (!u || u.状态 === '正常') return
      u.状态 = '正常'
      改成正常.push(`${图名}·${单元名}`)
      图.同步性 = 算同步性(图)
      fs.writeFileSync(
        path.join(项目目录, 产物文件名(配置, 图名).蓝图),
        JSON.stringify(图, null, 2) + '\n',
        'utf8',
      )
    }

    // 最多步数：防死循环（图里有环时，AI 处理又不会发 Start_，可能一直转）。
    // 0 / 不传 = 不限。
    const 最多步数 = Math.max(0, Math.floor(Number(参数.最多步数 ?? 0)))
    let 跑过 = 0

    // 日志（用户 2026-11-16：运行只要简化日志，`日志:'关'` 就彻底不记）
    const 日志行: string[] = []
    const 记日志 = 参数.日志 === '关' ? undefined : (记录: 日志记录) => {
      日志行.push(简化行(记录))
    }

    // 用户 2026-11-17：测试命令那三格（测单格 / 测整图 / 测整项目）格式化之后，
    // 不能自己在蓝图里重新实现一遍驱动 —— 「跑一张图」是引擎的能力，像问AI一样递进去。
    const 跑图 = async (
      蓝图名: string,
      选项: {
        不进子图?: boolean
        无视状态?: boolean
        开始只一次?: boolean
        最多步数?: number
        点火?: Record<string, unknown>
        // 跑之前先过一遍检查表（	est 那行：C1/C2 拦）。测试命令要跟 TS 同一条口径，
        // 不然「主蓝图缺开始/结束」这种图在蓝图侧会被直接跑过去。
        检查命令?: string
        // 用户 2026-11-17：`测试全项目` 跑的是「被测项目」，不是格式化项目自己；
        // 不给这个参数就会自己跑自己（同步死循环，定时器都跑不到）。
        项目?: string
        // 用户 m13658：测试结果要落盘 —— 跑通写「正常」，抛错写「报错」
        写状态?: boolean
        // 用户 m15078：测试标签与起点 —— 单元测试直接把格子塞进池，蓝图测试停在 $结束
        测试?: '单元' | '蓝图'
        起始?: { 蓝图?: string; 单元: string }
        // 单元测试的随机上游：`{ 图名: { 单元名: 输出 } }`，跑之前先垫进共享数据
        种子?: Record<string, Record<string, unknown>>
      } = {},
    ): Promise<{
      结局: string
      跑了: number
      结束信号: boolean
      错误?: string
      状态改动?: string[]
    }> => {
      // 目标项目不是本命令的项目时，重新定位它的目录 / 配置 / 方法。
      const 目标项目名 = String(选项.项目 ?? 项目名).trim()
      const 另处 = Boolean(目标项目名) && 目标项目名 !== 项目名
      const 另一 = 另处 ? 定位项目({ 项目: 目标项目名 }) : undefined
      const 目标目录 = 另一?.ok ? 另一.数据.项目目录 : 项目目录
      const 目标配置 = 另一?.ok ? 生效配置(目标目录) : 配置
      const 读目标蓝图 = (名: string): 蓝图 | undefined => {
        if (!另处) return 读蓝图(名)
        const 文件 = path.join(目标目录, 产物文件名(目标配置, 名).蓝图)
        if (!fs.existsSync(文件)) return undefined
        try {
          return JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
        } catch {
          return undefined
        }
      }
      // 加载方法是异步的：漏了 await 会拿到 Promise，Object.keys 为空，
      // 整张图就会「每个单元都没方法」地空跑过去（2026-11-18 踩过）。
      const 跑图方法 = 另处
        ? ((await 加载方法(目标目录, 目标配置, 蓝图名)) as Record<string, 单元方法>)
        : 方法
      const 图 = 读目标蓝图(蓝图名)
      if (!图 || !图.单元) {
        return { 结局: '失败', 跑了: 0, 结束信号: false, 错误: `蓝图不存在：${蓝图名}`, 错误类型: '不存在', 错误位置: 蓝图名 }
      }
      // 测试命令要跟 TS 同一条口径：跑之前先过检查表（`test` 行 C1/C2 拦），
      // 否则「主蓝图缺开始/结束」的图在蓝图侧会被直接跑过去。
      if (选项.检查命令) {
        const 查 = 跑检查(选项.检查命令, {
          蓝图: 图,
          蓝图名,
          是不是子蓝图: 蓝图名 !== String(目标配置.蓝图?.默认名 ?? ''),
          限制: 目标配置.限制,
          有子蓝图文件: (子名: string) => fs.existsSync(path.join(目标目录, 产物文件名(目标配置, 子名).蓝图)),
          读子图: 造读子图(目标目录, 目标配置),
          方法源码: (() => {
            const 文件 = path.join(目标目录, 产物文件名(目标配置, 蓝图名).方法)
            return fs.existsSync(文件) ? fs.readFileSync(文件, 'utf8') : ''
          })(),
        })
        if (查.拦.length) {
          return { 结局: '失败', 跑了: 0, 结束信号: false, 错误: 拦的消息(查.拦), 错误类型: '校验', 错误位置: 查.拦[0].码 }
        }
      }
      const 本方法: Record<string, import('../状态机.ts').单元方法> = {}
      // 「测整图」不进子图：子蓝图格子给个假方法（真有方法就不盖）
      if (选项.不进子图) {
        for (const u of 图.单元) {
          if (u.类型 === '子蓝图' && !跑图方法[u.名]) 本方法[u.名] = () => ({ 值: Math.random() })
        }
      }
      const 状态落: Record<string, Record<string, string>> = {}
      const 共享初: Record<string, Record<string, Record<string, unknown>>> = {}
      // 用户 m15078：单元测试之前「用对应数据类型的随机数填充对应数据」
      for (const 图名 in 选项.种子 ?? {}) {
        const 图数据: Record<string, Record<string, unknown>> = {}
        for (const 单元名 in 选项.种子![图名]) {
          // 共享数据的形状是 { 数据, 成功, 数据来源 }，取数据 只读 .数据
          图数据[单元名] = { 数据: 选项.种子![图名][单元名], 成功: true }
        }
        共享初[图名] = 图数据
      }
      const 结果 = await 跑(图, {
        读蓝图: 读目标蓝图,
        蓝图名们,
        方法: { ...本方法, ...跑图方法 },
        共享数据: 共享初,
        主蓝图名,
        // 没给点火包就沿用外层那份（测试里「跑整项目」就是这个情形），
        // 打上「测试中」标，运行层看到它就不再分岔进 图算法，避免自己套自己。
        点火: 选项.点火
          ? { ...选项.点火, 参数: { ...((选项.点火 as { 参数?: Record<string, unknown> }).参数 ?? {}), 蓝图内部: false } }
          : {
          项目: 目标项目名,
          命令: String(参数.命令 ?? 'run'),
          // 参数 是唯一一定会被「解析命令」原样带下去的那袋东西，
          // 所以护栏标记塞在这里：运行层看到它就不再分岔，避免自己套自己。
          参数: { ...参数, 测试中: true },
          项目目录: 目标目录,
          配置: 目标配置,
          宿主,
          测试中: true,
        },
        ...(选项.不进子图 ? { 不进子图: true } : {}),
        ...(选项.无视状态 ? { 无视状态: true } : {}),
        ...(选项.开始只一次 ? { 开始只一次: true } : {}),
        ...(选项.测试 ? { 测试: 选项.测试 } : {}),
        ...(选项.起始 ? { 起始: 选项.起始 } : {}),
        最多步数: 选项.最多步数 ?? 500,
        最多并发: 32,
        单元跑完: (图名, 单元名, 成功) => {
          ;(状态落[图名] ??= {})[单元名] = 成功 ? '正常' : '报错'
        },
        日志: 记日志,
      })
      const 错误消息 =
        结果.结局 === '失败'
          ? 结果.错误 instanceof Error
            ? 结果.错误.message
            : String(结果.错误 ?? '')
          : undefined
      const 状态改动 = 选项.写状态 === false ? [] : 写状态(目标目录, 目标配置, 状态落)
      return {
        结局: 结果.结局,
        跑了: 结果.跑了,
        结束信号: 结果.结束信号,
        错误: 错误消息,
        ...(状态改动.length ? { 状态改动 } : {}),
      }
    }

    // 用户 2026-11-17：随机上游要按上游方法的 `const 变量: 类型` 造 —— 蓝图里读不了方法源码，
    // 所以这也是引擎能力，跟 跑图 一起递进去。
    // 用户 2026-11-18：第二/三个参数可以指定「被测项目」——测试命令针对的是用户点开的项目，
    // 不给就还是格式化项目自己。
    // 用户 m13658：单格测试也要落状态（跑通 ⇒ 正常，抛错 ⇒ 报错）——
    // 蓝图链路里没法直接读盘，所以把「写一个单元的状态」也做成宿主原语。
    const 写单元状态 = (
      蓝图名: string,
      单元名: string,
      状态: string,
      项目?: string,
    ): string[] => {
      const 目标 = String(项目 ?? '').trim()
      const 另 = 目标 && 目标 !== 项目名 ? 定位项目({ 项目: 目标 }) : undefined
      const 目录 = 另?.ok ? 另.数据.项目目录 : 项目目录
      const 配 = 另?.ok ? 生效配置(目录) : 配置
      return 写状态(目录, 配, { [蓝图名]: { [单元名]: 状态 } })
    }

    const 造随机 = (蓝图名: string, 单元名: string, 项目?: string): { 输入: 上游输入[]; 缺方法: string[] } => {
      const 目标 = String(项目 ?? '').trim()
      const 另 = 目标 && 目标 !== 项目名 ? 定位项目({ 项目: 目标 }) : undefined
      const 目录 = 另?.ok ? 另.数据.项目目录 : 项目目录
      const 配 = 另?.ok ? 生效配置(目录) : 配置
      const 图 = 另?.ok ? 读该目录蓝图(目录, 配, 蓝图名) : 读蓝图(蓝图名)
      if (!图) return { 输入: [], 缺方法: ['<蓝图不存在>'] }
      const 上层 = 算上层(图)[单元名] ?? []
      const 文件 = path.join(目录, 产物文件名(配, 蓝图名).方法)
      const 源码 = fs.existsSync(文件) ? fs.readFileSync(文件, 'utf8') : ''
      const 输入: 上游输入[] = []
      const 缺: string[] = []
      for (const 来源 of 上层) {
        const 表 = 取字段表(源码, 来源)
        if (表 === undefined) {
          缺.push(来源)
          continue
        }
        输入.push({ 来源, 数据: 造输出(表) as Record<string, unknown> })
      }
      return { 输入, 缺方法: 缺 }
    }

    // 用户 2026-11-18：测单元要调的是「被测项目」那个蓝图里的方法，
    // 不能拿格式化项目自己的方法表（否则永远找不到被测单元的方法）。
    const 取方法 = async (蓝图名: string, 项目?: string): Promise<Record<string, 单元方法>> => {
      const 目标 = String(项目 ?? '').trim()
      const 另 = 目标 && 目标 !== 项目名 ? 定位项目({ 项目: 目标 }) : undefined
      const 目录 = 另?.ok ? 另.数据.项目目录 : 项目目录
      const 配 = 另?.ok ? 生效配置(目录) : 配置
      try {
        return await 加载方法(目录, 配, String(蓝图名))
      } catch {
        return {}
      }
    }

    // 按「目录 + 配置」读蓝图（造随机 / 取方法 用，和 读蓝图 的区别是要看别的项目）
    function 读该目录蓝图(目录: string, 配: ReturnType<typeof 生效配置>, 名: string): 蓝图 | undefined {
      const 文件 = path.join(目录, 产物文件名(配, 名).蓝图)
      if (!fs.existsSync(文件)) return undefined
      try {
        return JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
      } catch {
        return undefined
      }
    }

    // 点火数据 = 整张图唯一的外部入口（开始单元的输出）。
    // 用户 2026-11-16：方法不许读全局共享，宿主（读文件 / 写文件 / 列目录 / 问 AI）
    // 也只能顺着拓扑传 —— 所以它从这里塞进去，后面一格一格往下带。
    // 目标项目会在链路里被换掉（参数.项目 与 run 自己的项目不同），
    // 所以项目内文件原语不能把 项目目录/配置 焊死成格式化项目。
    let 现目录 = 项目目录
    let 现配置 = 配置
    let 现项目名 = 项目名
    // 结构指纹：单元名 + 类型 + 下层 + 开始/结束。只有结构变了才值得重算取数行
function 结构指纹(图: unknown): string {
  const g = (图 ?? {}) as { 开始?: string; 结束?: string; 单元?: Array<{ 名?: string; 类型?: string; 下层?: unknown[] }> }
  return (
    String(g.开始 ?? '') + '|' + String(g.结束 ?? '') + '|' +
    (g.单元 ?? []).map((u) => String(u.名 ?? '') + ':' + String(u.类型 ?? '') + ':' + (u.下层 ?? []).join(',')).join(';')
  )
}

const 宿主 = {
      设目标: (目录: string, 配?: unknown) => {
        现目录 = String(目录)
        if (配) 现配置 = 配 as typeof 配置
        现项目名 = String((现配置 as { 项目名?: string })?.项目名 ?? path.basename(现目录))
        return true
      },
      读文件: (路径: string) => fs.readFileSync(String(路径), 'utf8'),
      写文件: (路径: string, 内容: string) => fs.writeFileSync(String(路径), String(内容), 'utf8'),
      列目录: (路径: string) => fs.readdirSync(String(路径)),
      存在: (路径: string) => fs.existsSync(String(路径)),
      删文件: (路径: string) => fs.rmSync(String(路径), { force: true }),
      删目录: (路径: string) => fs.rmSync(String(路径), { recursive: true, force: true }),
      建目录: (路径: string) => fs.mkdirSync(String(路径), { recursive: true }),
      问AI: (提示: string) => 问AI('', String(提示)),
      // 用户 2026-11-17：命令层那些格子要读「有哪些项目」，登记表在插件目录里、
      // 不在现目录里，所以要像其它宿主能力一样从这儿递进去。
      // 建项目留空路径时的默认根（TS 版：os.tmpdir()/blueprint-tree-项目）
      临时项目根: () => path.join(process.env.TEMP ?? '.', 'blueprint-tree-项目'),
      // 登记表里的路径可能写成短名（ADMINI~1）或带正反斜杠，比较前先归一。
      同一目录: (a: string, b: string) => {
        try {
          return fs.realpathSync.native(String(a)).toLowerCase() === fs.realpathSync.native(String(b)).toLowerCase()
        } catch {
          return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase()
        }
      },
      登记表: () => 读登记表(),
    登记: (名: string, 项: Record<string, unknown>) => {
        登记(String(名), 项 as never)
        return true
    },
    // 用户 2026-11-18：删项目要把登记也撤掉（格子里的「删项目」以前只删目录，登记表里留个死条目）
    注销: (名: string) => {
        注销(String(名))
        return true
    },
      // 用户 2026-11-17：命令层的格子要改蓝图 json（改状态这类），得知道产物文件名。
      产物文件: (图谱名: string) => 产物文件名(现配置, String(图谱名)),
      // 用户 2026-11-17：「看单元」的结果里带「上层」，而上层不落盘、是现算的。
      // 蓝图里的格子算不了图算法，所以按蓝图名现算一份递进去。
      算上层: (图谱名: string) => {
        const 图 = 读蓝图(String(图谱名))
        return 图 ? 算上层(图) : {}
      },
      // 用户 2026-11-17：「看单元」要连方法原文一起给（界面弹窗靠它）。
      // 方法文件的切块交给 TS 这边做，蓝图里的格子只负责把它塞进结果。
      方法原文: (图谱名: string, 单元名: string) => {
        const 名 = String(图谱名)
        const 文件s = 产物文件名(现配置, 名)
        let 当前 = ''
        let 旧 = ''
        try {
          当前 = 读方法文件(path.join(现目录, 文件s.方法), 名, false).源码
          旧 = 读方法文件(path.join(现目录, 文件s.方法历史), 名, true).源码
        } catch {
          return { 当前: '', 历史: [] as string[] }
        }
        const 块 = 切方法(当前, 单元名, 当前变量名)
        const 历史 = 列出方法(旧, 历史变量名).filter((k) => {
          const 基 = k.includes(分隔符) ? k.slice(0, k.lastIndexOf(分隔符)) : k
          return 基 === 单元名
        })
        return { 当前: 块 ? 块.文本 : '', 历史 }
      },
      // 用户 2026-11-16：状态机那张图要自己驱动整张网 —— 它得拿到「单元名 → 方法体」
      // 才能代跑别的格子。方法表不是数据，只能这样从宿主里递进去。
      方法,
      // 用户 2026-11-17：测试命令三格要「跑整张图 / 跑整个项目」，驱动逻辑不复制进蓝图
      跑图,
      造随机,
      // 用户 m13658：测试要落状态 —— 格子只给「哪个图哪个单元什么状态」，写盘留在引擎
      写单元状态,
      // 用户 2026-11-18：测单元要拿「被测项目」的方法表（不是格式化项目自己的）
      取方法,
      // 用户 2026-11-18：界面要「看图 / 自动排列」两条命令（画布靠它们画图和排版），
      // 读盘与排版算法留在引擎，格子只负责把结果交回去。
      // 画布打开的是用户点开的那个项目，不一定就是格式化项目自己，
      // 所以第二个参数可以指定项目名（不给就用点火时的项目）。
      看图: (名?: string, 项目?: string) =>
        看图命令.执行({ 项目: String(项目 ?? 项目名), 蓝图: String(名 ?? "") }),
      自动排列: (名?: string, 项目?: string) =>
        排列命令.执行({ 项目: String(项目 ?? 项目名), 蓝图: String(名 ?? "") }),
      // 用户 2026-11-18「现在终止命令能用吗」：叫停要在页面/接口上能用，就得有格子认领 run.stop。
      // 终止本身是跨进程文件信号（运行记录.json 的 要求结束），仍留在引擎侧；
      // 格子只负责把项目名递进去，并把结果交回去。
      停止运行: (名?: string) => 结束运行命令.执行({ 项目: String(名 ?? 项目名) }),
      // 用户 2026-11-17「剩下的也格式化」：写命令（建/改/删单元）要动蓝图 json。
      // 增删字段这步留给格子，图算法和写盘这些搬不动的留在引擎这边当原语。
      // 用户 2026-11-18：读的一侧也必须跟着「现目录」走，否则链读到的永远是格式化项目自己的图。
      读蓝图: (名: string) => {
        const 文件 = path.join(现目录, 产物文件名(现配置, String(名)).蓝图)
        if (!fs.existsSync(文件)) return undefined
        try {
          return JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
        } catch {
          return undefined
        }
      },
      写蓝图: (名: string, 图: unknown, 选项?: { 带子图?: boolean }) => {
        const 文件 = 产物文件名(现配置, String(名))
        const 读子图 = 造读子图(现目录, 现配置)
        const 出图 = { ...(图 as Record<string, unknown>) } as Record<string, unknown>
        // 用户 2026-11-17：unit.update 用的是不带 reader 的算同步性，unit.remove 带 reader，两边算出来不一样，所以给个开关。
        出图.同步性 = 选项?.带子图 ? 算同步性(出图 as never, 读子图) : 算同步性(出图 as never)
        const 蓝图路径 = path.join(现目录, 文件.蓝图)
        let 旧指纹 = ''
        try {
          旧指纹 = 结构指纹(JSON.parse(fs.readFileSync(蓝图路径, 'utf8')))
        } catch {
          旧指纹 = ''
        }
        fs.writeFileSync(蓝图路径, JSON.stringify(出图, null, 2) + '\n', 'utf8')
        // 结构变了（增删单元 / 改名 / 改连线）⇒ 方法文件的取数行跟着重算
        if (旧指纹 !== 结构指纹(出图)) {
          try {
            同步方法文件(现目录, 现配置, String(名), 出图 as never)
          } catch (e) {
            /* 方法文件动不了不影响写蓝图 */
            try {
              fs.appendFileSync(process.env.TEMP + '/同步错误.log', new Date().toISOString() + ' ' + String(e) + '\n')
            } catch { }
          }
        }
        return 文件.蓝图
      },
      检查: (命令名: string, 图: unknown) => {
        const 蓝图名 = String((图 as Record<string, unknown>)?.名 ?? '')
        return 跑检查(String(命令名) as never, {
          蓝图: 图 as never,
          蓝图名,
          是不是子蓝图: 蓝图名 !== 配置.蓝图.默认名,
          限制: 配置.限制,
          有子蓝图文件: (名: string) => fs.existsSync(path.join(现目录, 产物文件名(现配置, 名).蓝图)),
          读子图: 造读子图(现目录, 现配置),
        })
      },
      找环: (图: unknown) => 找环(图 as never),
      // 用户 2026-11-17「剩下的也格式化」：blueprint.validate 的六组检查 + 汇总。
      // 校验函数库在引擎（用户 m02491：「拆成函数库，各命令按需挑用」），
      // 格子只负责「按范围挑哪几组、怎么汇总」。
      校一组: (组: string, 图: unknown) => {
        const u = 图 as 蓝图
        const 名 = String((图 as Record<string, unknown>)?.名 ?? '')
        const 组名 = String(组).toUpperCase()
        if (组名 === 'A') return 查单元(u)
        if (组名 === 'B') return 查连线(u)
        if (组名 === 'C') return 查锚点(u, 名 !== 配置.蓝图.默认名)
        if (组名 === 'F') {
          return 查子蓝图文件(u, (子: string) =>
            fs.existsSync(path.join(现目录, 产物文件名(现配置, 子).蓝图)),
          )
        }
        if (组名 === 'G') {
          const 名们 = 产物文件名(现配置, 名)
          const 方法p = path.join(现目录, 名们.方法)
          const 历史p = path.join(现目录, 名们.方法历史)
          const 当前 = fs.existsSync(方法p) ? fs.readFileSync(方法p, 'utf8') : ''
          const 历史 = fs.existsSync(历史p) ? fs.readFileSync(历史p, 'utf8') : undefined
          return 查方法(u, 当前, 历史)
        }
        if (组名 === 'H') return 查规模(u, 配置.限制)
        if (组名 === 'D') return 查硬单元(u, 造读子图(现目录, 现配置))
        if (组名 === 'E') return 查循环(u, 造读子图(现目录, 现配置))
        return []
      },
      汇总: (问题们: unknown) => 汇总((Array.isArray(问题们) ? 问题们 : []) as never),
      // 用户 2026-11-17：方法命令这五格干的都是「方法文件 AST 手术 + AI」，重活归引擎，
      // 格子只做「认领命令 + 参数校验 + 把结果包好」。这几个原语直接复用 TS 命令的实现，
      // 保证两边同源（不然 AST 切法一旦分叉，历史版本就会对不上）。
      方法命令: (名: string, 参数们: Record<string, unknown>) => {
        const 命令表: Record<string, { 执行: (p: never) => unknown }> = {
          'method.write': 写方法 as never,
          'method.restore': 还原方法 as never,
          'method.generate': 生成方法 as never,
        }
        const 命中 = 命令表[String(名)]
        if (!命中) return { 错: { 类型: '未知命令', 消息: `不认识的命令：${名}`, 位置: 'cmd' } }
        try {
          return { 回: 命中.执行({ 项目: 现项目名, ...参数们 } as never) }
        } catch (e) {
          return { 错: { 类型: 'IO', 消息: e instanceof Error ? e.message : String(e) } }
        }
      },
      // 蓝图命令报「不存在」时，TS 那边把完整文件路径写进 位置；格子拼不出绝对路径，所以递一个。
      蓝图路径: (名: string) => path.join(现目录, 产物文件名(现配置, String(名)).蓝图),
      // —— 用户 2026-11-17：改单元/删单元要用到的三样 ——
      环形修正: (图: unknown, 名: string, 下层: unknown) => {
        const 数组 = Array.isArray(下层) ? 下层.map((x) => String(x)) : []
        return 环形修正(图 as never, String(名), 数组)
      },
      规整: (u: unknown) => 规整单元(u as never),
      方法键改名: (蓝图名: string, 旧名: string, 新名: string) => {
        const 改了: string[] = []
        const 提示: string[] = []
        const 名表 = 产物文件名(现配置, String(蓝图名))
        const 文件表: [string, string][] = [
          [path.join(现目录, 名表.方法), '方法'],
          [path.join(现目录, 名表.方法历史), '方法历史'],
        ]
        for (const [p, 变量名] of 文件表) {
          if (!fs.existsSync(p)) continue
          try {
            const 源 = fs.readFileSync(p, 'utf8')
            const r = 改键前缀(源, String(旧名), String(新名), 变量名 as never)
            if (r.源码 !== 源) {
              fs.writeFileSync(p, r.源码, 'utf8')
              改了.push(path.basename(p))
            }
          } catch (e) {
            提示.push(`方法文件「${path.basename(p)}」没法改键：${e instanceof Error ? e.message : String(e)}`)
          }
        }
        return { 改了, 提示 }
      },
      子蓝图改名: (旧名: string, 新名: string) => {
        const 甲 = path.join(现目录, 产物文件名(现配置, String(旧名)).蓝图)
        const 乙 = path.join(现目录, 产物文件名(现配置, String(新名)).蓝图)
        if (!fs.existsSync(甲)) return {}
        if (fs.existsSync(乙)) return { 错: `「${新名}.json」已经存在，改名会撞车。蓝图名必须全项目唯一` }
        try {
          const 子 = JSON.parse(fs.readFileSync(甲, 'utf8')) as Record<string, unknown>
          子.名 = String(新名)
          fs.writeFileSync(甲, JSON.stringify(子, null, 2) + '\n', 'utf8')
        } catch {
          // 读不出来就只改名，文件里的「名」保持原样
        }
        fs.renameSync(甲, 乙)
        return { 文件: path.basename(乙) }
      },
      // 用户 2026-11-17：删单元要把它的子蓝图 .json 一起删（递归，防止孤儿文件）。
      删子蓝图: (名: string) => {
        const 删掉: string[] = []
        const 走 = (图名: string, 已访问: Set<string>): void => {
          if (已访问.has(图名)) return
          已访问.add(图名)
          const 文件 = path.join(现目录, 产物文件名(现配置, 图名).蓝图)
          if (!fs.existsSync(文件)) return
          try {
            const 图 = JSON.parse(fs.readFileSync(文件, 'utf8')) as { 单元?: { 名: string; 类型: string }[] }
            for (const u of 图.单元 ?? []) if (u.类型 === '子蓝图') 走(u.名, 已访问)
          } catch {
            // 文件坏了就只删它自己
          }
          fs.rmSync(文件, { force: true })
          删掉.push(path.basename(文件))
        }
        走(String(名), new Set())
        return 删掉
      },
      // 用户 2026-11-17：删单元时把它的方法挪进历史（不丢代码），这是纯文件操作，留在引擎。
      挪方法进历史: (蓝图名: string, 名单: string[]) => {
        const 进历史: string[] = []
        try {
          const 文件s = 产物文件名(现配置, String(蓝图名))
          const 方法p = path.join(现目录, 文件s.方法)
          const 历史p = path.join(现目录, 文件s.方法历史)
          if (!fs.existsSync(方法p)) return 进历史
          let 当前 = 读方法文件(方法p, String(蓝图名), false).源码
          let 历史 = 读方法文件(历史p, String(蓝图名), true).源码
          for (const 名 of 名单) {
            const 键 = 唯一历史键(历史, String(名))
            const 搬 = 搬进历史(当前, 历史, String(名), 键)
            if (搬) {
              当前 = 搬.当前
              历史 = 搬.历史
              进历史.push(键)
            }
          }
          const 裁 = 裁历史(历史, 配置.方法.历史个数)
          fs.writeFileSync(方法p, 当前, 'utf8')
          fs.writeFileSync(历史p, 裁.源码, 'utf8')
        } catch {
          // 方法文件坏了不该拦住删单元
        }
        return 进历史
      },      建子蓝图文件: (名: string, 标签: string, 功能: unknown) => {
        const 文件 = path.join(现目录, 产物文件名(现配置, String(名)).蓝图)
        if (fs.existsSync(文件)) return { 错: `子蓝图「${名}」的 .json 已经存在（这个名字已经被别的图用了）。蓝图名必须全项目唯一，换个名字` }
        const 入口: Record<string, unknown> = { 名: `${名}-单元1`, 类型: '软', 标签: String(标签 ?? '无'), 状态: '提醒', 下层: [结束标记] }
        if (功能 !== undefined) 入口.功能 = 功能
        const 子图: Record<string, unknown> = {
          格式版本: 1,
          名: String(名),
          开始: 入口.名 as string,
          结束: null,
          同步性: 0,
          单元: [入口],
        }
        子图.同步性 = 算同步性(子图 as never)
        fs.writeFileSync(文件, JSON.stringify(子图, null, 2) + '\n', 'utf8')
        return { 文件: path.basename(文件) }
      },
    }

    // 用户 m19432：停止请求要绑定到「这一次运行」。开跑先写标识、并把上一次
    // 留下的「要求结束」清掉 —— 否则停完立刻重跑，第一趟一个单元都跑不起来。
    // 用户 m19572：标识由 Host 生成随参数传进来，这样停止时能核对「是不是这一趟」。
    const 本次运行 =
      String((参数 as Record<string, unknown> | undefined)?.本次运行 ?? '').trim() || 新运行标识(项目名)
    const 开跑前 = 读运行记录(项目目录)
    写运行记录(项目目录, { 上次: 开跑前.上次, 测试报错: 开跑前.测试报错, 本次运行 })

    const 结果 = await 跑(主图, {
      读蓝图,
      蓝图名们,
      方法,
      共享数据,
      主蓝图名,
      点火: { 项目: 项目名, 命令: String(参数.命令 ?? 'run'), 参数, 项目目录, 配置, 宿主 },
      // 结束命令只写「要停哪一次运行」，这里按标识对
      该停: () => 应当停止(项目目录, 本次运行) || (最多步数 > 0 && 跑过 >= 最多步数),
      // 用户 2026-11-15「并行优先」：方法多半是 await IO，几十个一起挂着没问题
      最多并发: 32,
      单元跑完: (图名, 单元名, 成功) => {
        跑过++
        // 用户 m13658：运行 ⇒ 跑通写「正常」，抛错写「失效」
        if (参数.返回包) return
        写蓝图状态(项目目录, 配置, 图名, { [单元名]: 成功 ? '正常' : '失效' })
      },
      ai处理,
      日志: 记日志,
    })

    // ⑤ 状态已经在「单元跑完」回调里逐个改好了（用户 2026-11-15：
    //    「每个单元跑完就改，不是一起改」），这里只算失败的单元
    const 失败单元 = 结果.结局 === '失败' ? 结果.错误单元 : undefined

    // ⑥ 记一笔：上次跑的是「运行」；失败的单元记进 测试报错（用户：后续改失效从这文件生成命令）
    const 错误消息 =
      结果.结局 === '失败'
        ? 结果.错误 instanceof Error
          ? 结果.错误.message
          : String(结果.错误)
        : undefined
    // 用户 m19572：收尾只写「还是自己那一次」的记录，别把新一趟的标识抹掉。
    const 收尾前 = 读运行记录(项目目录)
    if (收尾前.本次运行 === undefined || 收尾前.本次运行 === 本次运行) {
      写运行记录(项目目录, {
        上次: '运行',
        测试报错:
          失败单元 && 错误消息
            ? [{ 蓝图: 主蓝图名, 单元: 失败单元, 码: '运行', 消息: 错误消息 }]
            : [],
      })
    }

    const 数据: Record<string, unknown> = {
      项目: 项目名,
      蓝图: 主蓝图名,
      // 用户 m19572：启动时就把运行标识交给调用方，停止时核对它
      本次运行,
      结局: 结果.结局,
      跑了: 结果.跑了,
      结束信号: 结果.结束信号,
    }
    if (落地.length) 数据.落地 = 落地
    if (改动.length) 数据.改动 = 改动
    // 日志落在项目目录里，返回值只给文件名（跟其它命令一样不给路径）
    const 日志文件 = 写日志(项目目录, 记日志 ? '运行日志.log' : undefined, 日志行)
    if (日志文件) 数据.日志 = path.basename(日志文件)
    if (ai跑过.length) 数据.ai处理 = ai跑过
    if (判断记录.length) 数据.判断 = 判断记录
    if (最多步数 > 0) {
      数据.最多步数 = 最多步数
      if (结果.结局 === '中止' && 跑过 >= 最多步数) 数据.跑到上限 = true
    }
    // 用户 2026-11-17：后端要换成格式化链路 —— 把链尾那一格的包原样交回去，
    // 由调用方从里面取「结果」。包不落盘、也不进日志。
    if (参数.返回包) {
      const 本图数据 = ((共享数据 as Record<string, Record<string, unknown>>)[主蓝图名] ?? {}) as Record<string, unknown>
      if (process.env.FLOW_DEBUG) console.log('[返回包] 图='+Object.keys(共享数据).join('|')+' 本图格='+Object.keys(本图数据).join('|'))
      const 链尾 = (本图数据['记录'] ?? 本图数据['运行层'] ?? Object.values(本图数据).pop() ?? {}) as Record<string, unknown>
      // 用户 2026-11-17：命令层的「结果」是在更深的子图里写出来的，出口冒泡时只剩最后跑完那一格的输出，
      // 结果就丢了。这里把所有图、所有格里出现过的 结果/错 兜一遍再交回去。
      const 补: Record<string, unknown> = {}
      for (const 一张图 of Object.values(共享数据 as Record<string, Record<string, unknown>>)) {
        for (const 一格 of Object.values(一张图 ?? {})) {
          if (!一格 || typeof 一格 !== 'object') continue
          const 格 = 一格 as Record<string, unknown>
          if ('结果' in 格) 补.结果 = 格.结果
          // 用户 2026-11-17：格子报错有两种形状 —— 字符串（老写法）和对象 {类型,消息,位置}（命令层用这种），
          // 只收字符串会把对象形式的报错丢掉，控制器就报「蓝图里没有认领」。
          if (格.错) 补.错 = 格.错
        }
      }
      return 成功({ 结局: 结果.结局, 本次运行, 跑过, 包: { ...链尾, ...补 } })
    }
    // 用户 m14161：「中止」也要分清是被叫停，还是根本没跑起来。
    // 现在停止请求绑定到标识，开跑时已经把旧请求清掉 —— 一个单元都没跑就中止，
    // 基本就是这一趟刚起步就被叫停了（用户 m19432）。
    if (结果.结局 === '中止' && 跑过 === 0) {
      数据.结束信号 = 结果.结束信号
      return 失败('中止', '运行被终止：这一次刚开始就被停止请求叫停了', 主蓝图名, 数据)
    }
    if (结果.结局 === '完成' && !结果.结束信号) {
      // 用户 m14161：「池空了」不等于「跑完了」。结束的唯一判据是结束信号
      // （主蓝图里真有单元走到 $结束）；池空却没收到结束信号，说明链在某处断了
      // —— 最常见的原因是单元状态是 报错/废弃/失效，被引擎当断路跳过。
      const 停的: string[] = []
      for (const 名 of 蓝图名们()) {
        const 图 = 读蓝图(名)
        for (const u of 图?.单元 ?? []) {
          if (u.状态 === '报错' || u.状态 === '废弃' || u.状态 === '失效') 停的.push(`${名}·${u.名}（${u.状态}）`)
        }
      }
      const 消息 = 停的.length
        ? `没走到结束单元（$结束）：${停的.length} 个单元因状态被跳过 —— ${停的.slice(0, 12).join('、')}${停的.length > 12 ? ' 等' : ''}`
        : `没走到结束单元（$结束）：没有任何单元的下层指向 $结束，或者从开始走不到出口`
      数据.结束信号 = false
      if (停的.length) 数据.跳过 = 停的
      return 失败('未结束', 消息, 主蓝图名, 数据)
    }
    if (结果.结局 === '卡死') {
      数据.剩下 = 结果.剩下.map((x) => `${x.蓝图}·${x.单元}（还差 ${x.还差.length} 个）`)
      return 失败('卡死', `跑不动了：${数据.剩下.length} 个单元在等，但没有能跑的`, 主蓝图名, 数据)
    }
    if (结果.结局 === '失败') {
      数据.错误 = 结果.错误 instanceof Error ? 结果.错误.message : String(结果.错误)
      return 失败('运行', String(数据.错误), 主蓝图名, 数据)
    }
    return 成功(数据)
  },
}

// 占位：让 `单元` / `结束标记` 的 import 不被 lint 当成没用（类型导出里用到）
export type { 单元 }
void 结束标记
