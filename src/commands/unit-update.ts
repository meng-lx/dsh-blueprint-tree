// unit.update —— 改一个单元的字段
//
// 用户 2026-11-09：「名,类型,标签,下层,坐标,功能,一起做了,名就只考虑当前蓝图/子蓝图中的名字就行,
// 记得改文件名,这个应该不涉及递归,上一个对话说的限制不用管,那个是检测功能该做的,包括重名什么的」
//
// 语义：**只改传了的字段**，没传的一律不动 —— 和 unit.add「没传就填默认值」正好相反。
// 状态不在这里改 —— 走 unit.status。
//
// 改名的连带（只在本图内，不递归）：
//   ① 别人的「下层」里指向旧名的，改成新名
//   ② 「开始」/「结束」锚点
//   ③ 它是子蓝图 ⇒ 它的 <旧名>.json 改名成 <新名>.json（不往下递归）
// 最后重算全图的「上层」。
//
// 类型：循环向量 / 开始 / 结束 / 子蓝图 这四种不参与类型修改；其他类型也只能改成 硬/软/选择。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 生效配置, 第三层项目配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 跑检查, 拦的消息 } from '../跑检查.ts'
import { 造读子图 } from '../蓝图文件.ts'
import { 同步方法文件 } from '../方法同步.ts'
import { 算同步性, 结束标记, 环形修正 } from '../蓝图工具.ts'
import { 到得了 } from '../路径.ts'
import { 改键前缀 } from '../方法文件.ts'
import type { 单元 } from './unit-add.ts'


/**
 * 单元改名时，把方法文件里的键一起改（当前文件 + 历史里的 `旧名#时间戳`）
 *
 * 用户 m01990：「7 全改，包括历史」
 * 不改的话：蓝图里叫新名了，方法文件里的键还是旧名 ⇒ 状态机找不到方法。
 *
 * 方法文件坏了也**不该拦住改单元**（catch 住，只记一条提示）。
 */
function 改方法键(
  项目目录: string,
  配置: ReturnType<typeof 生效配置>,
  蓝图名: string,
  旧名: string,
  新名: string,
  提示: string[],
): string[] {
  const 改了: string[] = []
  const 名表 = 产物文件名(配置, 蓝图名)
  const 文件表: [string, string][] = [
    [path.join(项目目录, 名表.方法), '方法'],
    [path.join(项目目录, 名表.方法历史), '方法历史'],
  ]
  for (const [p, 变量名] of 文件表) {
    if (!fs.existsSync(p)) continue
    try {
      const 源 = fs.readFileSync(p, 'utf8')
      const r = 改键前缀(源, 旧名, 新名, 变量名)
      if (r.源码 !== 源) {
        fs.writeFileSync(p, r.源码, 'utf8')
        改了.push(path.basename(p))
      }
    } catch (e) {
      提示.push(`方法文件「${path.basename(p)}」没法改键：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return 改了
}
import type { 单元, 蓝图 } from './unit-add.ts'
import { 规整单元 } from './unit-add.ts'

const 全部类型 = ['硬', '软', '选择', '开始', '结束', '子蓝图', '循环向量']
const 可改类型 = ['硬', '软', '选择']
const 全部标签 = ['强制', '广播', '并发', '无']

export const 改单元: 命令定义 = {
  名: 'unit.update',
  说明: '改一个单元（名/类型/标签/下层/坐标/功能），只改传了的字段；改子蓝图的名字会连 .json 一起改名',
  中文: ['修改单元', '改单元', '更新单元', '编辑单元'],
  执行(参数): 结果 {
    // ① 定位项目与蓝图（项目名 → 目录，路径只查登记表）
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const 项目目录 = 定.数据.项目目录

    const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)
    const 读子图 = 造读子图(项目目录, 配置)
    const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')
    const 蓝图文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
    if (!fs.existsSync(蓝图文件)) {
      return 失败('不存在', `蓝图不存在：${蓝图文件}`, 蓝图文件)
    }

    // ② 找单元
    const 旧名 = String(参数.单元 ?? '').trim()
    if (!旧名) return 失败('参数', '缺少「单元」——改哪个（给名字）', '单元')

    const 蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    if (!Array.isArray(蓝图.单元)) 蓝图.单元 = []
    const 目标 = 蓝图.单元.find((u) => u.名 === 旧名)
    if (!目标) return 失败('不存在', `蓝图里没有这个单元：${旧名}`, 旧名)

    // ③ 收「改」：可以是对象，也可以是一段 JSON 字符串（键值写法里躲不开）；
    //    都没有就把顶层字段当改（键值写法）
    let 改: Record<string, unknown>
    if (typeof 参数.改 === 'string') {
      const 文本 = (参数.改 as string).trim()
      if (!文本.startsWith('{')) {
        return 失败('参数', '「改」要么给对象，要么给一段 {...} 的 JSON', '改')
      }
      try {
        改 = JSON.parse(文本) as Record<string, unknown>
      } catch {
        return 失败('参数', '「改」是 JSON 但解析不了，检查引号和逗号', '改')
      }
    } else if (参数.改 && typeof 参数.改 === 'object' && !Array.isArray(参数.改)) {
      改 = 参数.改 as Record<string, unknown>
    } else {
      改 = 参数
    }

    const 改了: string[] = []
    const 提示: string[] = []

    // —— 名 ——
    let 新名 = 旧名
    if (改.名 !== undefined) {
      const v = String(改.名).trim()
      if (!v) return 失败('参数', '「名」不能是空的', '名')
      if (v !== 旧名) {
        新名 = v
        改了.push('名')
      }
    }

    // —— 类型 ——
    let 新类型 = 目标.类型
    if (改.类型 !== undefined) {
      const v = String(改.类型).trim()
      if (!全部类型.includes(v)) {
        return 失败('参数', `类型只能是 ${全部类型.join('/')}，收到「${v}」`, '类型')
      }
      if (v !== 目标.类型) {
        if (!可改类型.includes(目标.类型)) {
          return 失败('校验', `「${目标.类型}」类型的单元不能改类型`, '类型')
        }
        if (!可改类型.includes(v)) {
          return 失败('校验', `类型只能改成 ${可改类型.join('/')}，「${v}」不行`, '类型')
        }
        新类型 = v as 单元['类型']
        改了.push('类型')
      }
    }

    // —— 标签 ——
    let 新标签 = 目标.标签
    if (改.标签 !== undefined) {
      const v = String(改.标签).trim()
      if (!全部标签.includes(v)) {
        return 失败('参数', `标签只能是 ${全部标签.join('/')}，收到「${v}」`, '标签')
      }
      if (v !== 目标.标签) {
        新标签 = v as 单元['标签']
        改了.push('标签')
      }
    }

    // —— 下层 ——
    let 新下层 = 目标.下层
    if (改.下层 !== undefined) {
      const 值 = 改.下层
      const 数组 = Array.isArray(值)
        ? 值.map((x) => String(x).trim())
        : String(值).split(',').map((x) => x.trim())
      const 干净 = 数组.filter((x) => x.length > 0)

      // 出口单元（下层里有 $结束）改下层：只能接一个单元，那个单元自动继承出口标记
      // —— 用户 2026-11-10：出口唯一，所以不能从出口分出多条
      if ((目标.下层 ?? []).includes(结束标记)) {
        const 非结束 = 干净.filter((x) => x !== 结束标记)
        if (非结束.length > 1) {
          return 失败(
            '校验',
            `「${目标.名}」是出口，下层只能接一个单元（收到 ${非结束.join('、')}）`,
            '下层',
          )
        }
        if (非结束.length === 1) {
          const 接 = 蓝图.单元.find((u) => u.名 === 非结束[0])
          if (接) {
            接.下层 = [结束标记]
            提示.push(`「${接.名}」继承了出口：下层设为 ${结束标记}`)
          }
        }
      }

      const 原 = (目标.下层 ?? []).join('\u0000')
      if (干净.join('\u0000') !== 原) {
        新下层 = 干净
        改了.push('下层')
      }
    }

    // —— 坐标 ——
    let 新坐标 = 目标.坐标
    if (改.坐标 !== undefined) {
      const 值 = 改.坐标
      const 数组 = Array.isArray(值)
        ? 值.map((x) => Number(x))
        : String(值).split(',').map((x) => Number(x.trim()))
      if (数组.length !== 2 || 数组.some((n) => !Number.isFinite(n))) {
        return 失败('参数', `坐标要两个数字，例如 100,200，收到「${String(值)}」`, '坐标')
      }
      const 原 = 目标.坐标
      if (!原 || 原[0] !== 数组[0] || 原[1] !== 数组[1]) {
        新坐标 = [数组[0], 数组[1]]
        改了.push('坐标')
      }
    }

    // —— 功能 ——
    let 新功能 = 目标.功能
    if (改.功能 !== undefined) {
      const v = String(改.功能)
      if (v !== (目标.功能 ?? '')) {
        新功能 = v
        改了.push('功能')
      }
    }

    if (!改了.length) {
      return 成功({
        蓝图: 蓝图名,
        单元: 旧名,
        改了: [],
        总单元数: 蓝图.单元.length,
        提示: ['什么都没变'],
      })
    }

    // ④ 应用
    目标.名 = 新名
    目标.类型 = 新类型
    目标.标签 = 新标签
    if (改了.includes('下层')) {
      // 新连线如果连到了自己的上游 ⇒ 会成环 ⇒ 换成循环向量单元（用户 2026-11-10）
      const 转 = 环形修正(蓝图, 目标.名, 新下层 ?? [])
      if (转.错) return 失败('校验', 转.错, '下层')
      if (转.下层.length) 目标.下层 = 转.下层
      else delete 目标.下层
      for (const u of 转.新建) 蓝图.单元.push(规整单元(u))
      提示.push(...转.提示)
    }
    if (改了.includes('坐标')) 目标.坐标 = 新坐标
    if (改了.includes('功能')) {
      if (新功能 === undefined) delete 目标.功能
      else 目标.功能 = 新功能
    }


    // ⑤ 改名的连带（只本图）
    const 改名连带: { 引用: string[]; 锚点: string[]; 文件?: string; 方法?: string[] } = {
      引用: [],
      锚点: [],
    }
    let 旧文件: string | undefined
    let 新文件: string | undefined

    if (新名 !== 旧名) {
      for (const u of 蓝图.单元) {
        if (u === 目标 || !u.下层 || !u.下层.includes(旧名)) continue
        u.下层 = u.下层.map((下) => (下 === 旧名 ? 新名 : 下))
        改名连带.引用.push(u.名)
      }
      if (蓝图.开始 === 旧名) {
        蓝图.开始 = 新名
        改名连带.锚点.push('开始')
      }
      if (蓝图.结束 === 旧名) {
        蓝图.结束 = 新名
        改名连带.锚点.push('结束')
      }

      // 子蓝图 ⇒ 文件改名（不递归）
      if (新类型 === '子蓝图') {
        const 甲 = path.join(项目目录, 产物文件名(配置, 旧名).蓝图)
        const 乙 = path.join(项目目录, 产物文件名(配置, 新名).蓝图)
        if (fs.existsSync(甲) && !fs.existsSync(乙)) {
          旧文件 = 甲
          新文件 = 乙
          改名连带.文件 = 乙
        } else if (fs.existsSync(甲) && fs.existsSync(乙)) {
          // 用户 2026-11-11：蓝图名必须全项目唯一 —— 改名撞到已有文件就整条命令拒绝
          return 失败('校验', `「${新名}.json」已经存在，改名会撞车。蓝图名必须全项目唯一`, '名')
        }
      }
    }

    // ④.5 统一检查（检查表里 unit.update 该跑的）
    // 用户 2026-11-11：「执行时先检测标2的项有问题直接拦截并返回报错，没问题检测标1的项有问题在命令生效后直接改」
    // ⚠️ 标 1 的 D/E 只**记进返回**，不落盘 ——「报错不落盘，临时存储」（用户 m03542 第②条）
    const 检查 = 跑检查('unit.update', {
      蓝图,
      蓝图名,
      是不是子蓝图: 蓝图名 !== 配置.蓝图.默认名,
      限制: 配置.限制,
      有子蓝图文件: (子名) => fs.existsSync(path.join(项目目录, 产物文件名(配置, 子名).蓝图)),
      读子图: 造读子图(项目目录, 配置),
    })

    // 标 2 的有一条不过 ⇒ 一个字节都不写
    if (检查.拦.length) {
      return 失败('校验', 拦的消息(检查.拦), 检查.拦[0].码)
    }

    const 改动: string[] = []
    for (const p of 检查.改) {
      改动.push(`${p.码}|${p.消息}|${p.位置 ?? ''}`.replace(/\|+$/, ''))
    }

    // ⑥ 「上层」是派生字段，不重算、不落盘（读的时候现算，见 src/蓝图工具.ts）

    // ⑦ 试运行：只把结果算出来，不写盘
    const 试运行 = 参数.试运行 === true || 参数.试运行 === 'true'
    if (试运行) {
      return 成功({
        蓝图: 蓝图名,
        单元: 新名,
        ...(新名 !== 旧名 ? { 原名: 旧名 } : {}),
        改了,
        试运行: true,
        ...(新名 !== 旧名 ? { 改名连带 } : {}),
        总单元数: 蓝图.单元.length,
        ...(提示.length ? { 提示 } : {}),
      })
    }

    // ⑦.5 方法键跟着改（当前文件 + 历史里的 旧名#时间戳）
    if (新名 !== 旧名) {
      const 方法 = 改方法键(项目目录, 配置, 蓝图名, 旧名, 新名, 提示)
      if (方法.length) 改名连带.方法 = 方法
    }

    // ⑧ 写盘（字段顺序固定，单元位置不动；同步性每次修改都重算一次）
    蓝图.单元 = 蓝图.单元.map(规整单元)
    const 出图: 蓝图 = {
      格式版本: 蓝图.格式版本 ?? 1,
      名: 蓝图.名,
      开始: 蓝图.开始 ?? null,
      结束: 蓝图.结束 ?? null,
      同步性: 0,
      单元: 蓝图.单元,
    }
    出图.同步性 = 算同步性(出图)
    fs.writeFileSync(蓝图文件, JSON.stringify(出图, null, 2) + '\n', 'utf8')

    // ⑧.5 取数行跟着改：改名会让下游的「来源」失效，改下层会让取数行多/少一行
    try {
      const 同 = 同步方法文件(项目目录, 配置, 蓝图名, 出图)
      if (同.改了.length) 改名连带.引用.push(...[])
    } catch {
      /* 方法文件动不了不影响改单元 */
    }

    // ⑨ 子蓝图文件改名（文件里的「名」也跟着改）
    if (旧文件 && 新文件) {
      try {
        const 子 = JSON.parse(fs.readFileSync(旧文件, 'utf8')) as 蓝图
        子.名 = 新名
        fs.writeFileSync(旧文件, JSON.stringify(子, null, 2) + '\n', 'utf8')
      } catch {
        提示.push(`子蓝图文件读不出来，里面的「名」没改：${path.basename(旧文件)}`)
      }
      fs.renameSync(旧文件, 新文件)
      改名连带.文件 = path.basename(新文件)
    }

    return 成功({
      蓝图: 蓝图名,
      单元: 新名,
      ...(新名 !== 旧名 ? { 原名: 旧名 } : {}),
      改了,
      ...(改动.length ? { 改动 } : {}),
      ...(新名 !== 旧名 ? { 改名连带 } : {}),
      总单元数: 蓝图.单元.length,
      ...(提示.length ? { 提示 } : {}),
    })
  },
}
