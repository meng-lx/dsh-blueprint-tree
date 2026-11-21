// unit.status —— 单独改单元状态
//
// 用户 2026-11-09：「单元状态创建时强制是提醒，修改单元状态单开一个命令」
// ⇒ 状态不再混在 unit.add / unit.update 里，只有这一条路能改。
//
// 对应 回答.txt:117-126 的状态表：
//   正常/提醒: 可执行
//   报错/废弃/失效: 被调起时直接结束，不做任何操作

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 生效配置, 第三层项目配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 跑检查, 拦的消息 } from '../跑检查.ts'
import type { 单元, 蓝图 } from './unit-add.ts'
import { 规整单元 } from './unit-add.ts'

const 状态集合 = ['正常', '提醒', '报错', '废弃', '失效', '断联'] as const
// 老叫法：「冻结」= 现在的「废弃」（用户 2026-11-21：冻结就是回收站，改名废弃）
const 旧名: Record<string, string> = { 冻结: '废弃' }
type 单元状态 = (typeof 状态集合)[number]

export const 改状态: 命令定义 = {
  名: 'unit.status',
  说明: '改单元状态（创建时一律是「提醒」，之后用这个改；可一次改多个）',
  中文: ['修改状态', '改状态', '设置状态', '单元状态'],
  执行(参数) {
    // ① 定位项目与蓝图（项目名 → 目录，路径只查登记表）
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const 项目目录 = 定.数据.项目目录

    const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const 蓝图文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
    if (!fs.existsSync(蓝图文件)) {
      return 失败('不存在', `蓝图不存在：${蓝图文件}`, 蓝图文件)
    }

    // ② 参数
    const 收到 = String(参数.状态 ?? '').trim()
    if (!收到) return 失败('参数', '缺少「状态」', '状态')
    const 目标状态 = 旧名[收到] ?? 收到
    if (!(状态集合 as readonly string[]).includes(目标状态)) {
      return 失败('参数', `「状态」只能是 ${状态集合.join(' / ')}，收到「${收到}」`, '状态')
    }

    const 名单 = Array.isArray(参数.单元)
      ? (参数.单元 as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : String(参数.单元 ?? '').trim()
        ? [String(参数.单元).trim()]
        : []
    if (!名单.length) return 失败('参数', '缺少「单元」——要改哪个/哪些单元', '单元')

    // ③ 先全量校验：有一个不存在就整体不动
    const 蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    if (!Array.isArray(蓝图.单元)) 蓝图.单元 = []

    const 缺的 = 名单.filter((名) => !蓝图.单元.some((u) => u.名 === 名))
    if (缺的.length) {
      return 失败('不存在', `这些单元不在蓝图里：${缺的.join('、')}`, 缺的[0])
    }

    // ③.5 统一检查（检查表里 unit.status 该跑的：A1 名字 / A5 状态）
    // 用户 2026-11-11：「先检测标 2 的项有问题直接拦截并返回报错」
    const 检查 = 跑检查('unit.status', {
      蓝图,
      蓝图名,
      是不是子蓝图: 蓝图名 !== 配置.蓝图.默认名,
      限制: 配置.限制,
    })
    if (检查.拦.length) {
      return 失败('校验', 拦的消息(检查.拦), 检查.拦[0].码)
    }

    // ④ 改
    const 已改: { 名: string; 原状态: string; 新状态: string }[] = []
    for (const 名 of 名单) {
      const u = 蓝图.单元.find((x) => x.名 === 名)!
      if (u.状态 === 目标状态) continue
      已改.push({ 名, 原状态: u.状态, 新状态: 目标状态 })
      u.状态 = 目标状态 as 单元['状态']
    }

    if (!已改.length) {
      return 成功({ 蓝图: 蓝图名, 已改: [], 总单元数: 蓝图.单元.length, 提示: [`这 ${名单.length} 个单元本来就是这个状态`] })
    }

    // ⑤ 写盘（字段顺序固定）
    蓝图.单元 = 蓝图.单元.map(规整单元)
    const 文本 =
      JSON.stringify(
        {
          格式版本: 蓝图.格式版本 ?? 1,
          名: 蓝图.名,
          开始: 蓝图.开始 ?? null,
          结束: 蓝图.结束 ?? null,
          单元: 蓝图.单元,
        },
        null,
        2,
      ) + '\n'
    fs.writeFileSync(蓝图文件, 文本, 'utf8')

    return 成功({ 蓝图: 蓝图名, 已改, 总单元数: 蓝图.单元.length })
  },
}
