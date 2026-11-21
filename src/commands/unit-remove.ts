// unit.remove —— 从蓝图里按名字删单元
//
// 用户 2026-11-09：「单元是根据名字删」「删子蓝图时把文件也删了」「暂不考虑留历史做撤回操作」
//
// 删一个单元要连带处理四件事：
//   ① 从「单元」数组里去掉
//   ② 别人的「下层」里指向它的，一并去掉（否则留下悬空线）
//   ③ 它如果是「开始」/「结束」锚点，锚点清空
//   ④ 它是「子蓝图」⇒ 把它那个 <名>.json 一起删掉
// 最后重算全图的「上层」。
//
// 先校验全部名字都存在，再动手 —— 半路失败会留下删了一半的图。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 生效配置, 第三层项目配置, 产物文件名, 配置路径 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 同步方法文件 } from '../方法同步.ts'
import { 算同步性 } from '../蓝图工具.ts'
import { 跑检查, 拦的消息 } from '../跑检查.ts'
import type { 单元, 蓝图 } from './unit-add.ts'
import { 规整单元 } from './unit-add.ts'
import { 造读子图 } from '../蓝图文件.ts'
import { 读方法文件, 搬进历史, 裁历史, 唯一历史键 } from '../方法命令.ts'

/**
 * 删一棵子蓝图树：先递归删它里面的子蓝图，再删它自己。
 *
 * 子蓝图可以嵌套（子图里再放子蓝图单元），所以删除必须往下走到底 ——
 * 只删最上面那层的话，下层的 json 会变成永远没人管的孤儿文件。
 *
 * 已访问集合防止 A 引用 B、B 又引用 A 这种互相指的情况转不出来。
 */
function 删子蓝图树(
  项目目录: string,
  配置: ReturnType<typeof 生效配置>,
  名: string,
  已访问: Set<string> = new Set(),
): string[] {
  const 删掉: string[] = []
  if (已访问.has(名)) return 删掉
  已访问.add(名)

  const 文件 = path.join(项目目录, 产物文件名(配置, 名).蓝图)
  if (!fs.existsSync(文件)) return 删掉

  // 先往下递归
  try {
    const 图 = JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
    for (const u of 图.单元 ?? []) {
      if (u.类型 === '子蓝图') 删掉.push(...删子蓝图树(项目目录, 配置, u.名, 已访问))
    }
  } catch {
    // 文件坏了 / 不是 json ⇒ 跳过下级，至少把它自己删掉
  }

  fs.rmSync(文件, { force: true })
  删掉.push(path.basename(文件))
  return 删掉
}

export const 删单元: 命令定义 = {
  名: 'unit.remove',
  说明: '按名字删单元（可一次删多个）；连带清掉指向它的连线、清掉锚点；删子蓝图会连它的 .json 一起删',
  中文: ['删除单元', '删单元', '移除单元', '去掉单元'],
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

    // ② 收名字：单个字符串或数组
    const 原始 = 参数.单元
    const 名单 = (
      Array.isArray(原始) ? 原始.map((x) => String(x).trim()) : 原始 === undefined ? [] : [String(原始).trim()]
    ).filter((x) => x.length > 0)
    if (!名单.length) return 失败('参数', '缺少「单元」——要删哪些单元（给名字）', '单元')

    const 蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    if (!Array.isArray(蓝图.单元)) 蓝图.单元 = []

    // ③ 先全部校验，一个不存在就整体不动
    const 缺 = 名单.filter((名) => !蓝图.单元.some((u) => u.名 === 名))
    if (缺.length) {
      return 失败('不存在', `蓝图里没有这些单元：${缺.join('、')}`, 缺.join('、'))
    }

    const 要删 = new Set(名单)

    // ③.4 开始 / 结束 类型的单元不能删（用户 2026-11-16）
    // 「删除不能删开始结束」—— 一个蓝图必须有且只有一个开始、一个结束
    {
      const 锚点们 = 蓝图.单元
        .filter((u) => 要删.has(u.名) && (u.类型 === '开始' || u.类型 === '结束'))
        .map((u) => `「${u.名}」（${u.类型}）`)
      if (锚点们.length) {
        return 失败(
          '校验',
          `${锚点们.join('、')}不能在蓝图中删除：开始 / 结束 是全项目唯一的锚点，要换位置请先新建对应类型的单元，再改另一个的类型`,
          要删.has(蓝图.开始 ?? '') ? (蓝图.开始 as string) : (蓝图.结束 as string),
        )
      }
    }

    // ③.4 开始 / 结束 类型的单元不能删（用户 2026-11-16：「删除不能删开始结束」）
    // 一个蓝图必须有且只有一个开始、一个结束，删了图就废了。
    {
      const 锚点们 = 蓝图.单元
        .filter((u) => 要删.has(u.名) && (u.类型 === '开始' || u.类型 === '结束'))
        .map((u) => u.名)
      if (锚点们.length) {
        return 失败(
          '校验',
          `「${锚点们.join('、')}」是开始 / 结束单元，不能删（一个蓝图必须有且只有一个）`,
          锚点们[0],
        )
      }
    }

    // ③.5 子蓝图的入口不能删（用户 2026-11-10）—— 删了这张图就没有入口了
    {
      const 是子蓝图 = !蓝图.单元.some((u) => u.类型 === '开始' || u.类型 === '结束')
      if (是子蓝图 && 蓝图.开始 && 要删.has(蓝图.开始)) {
        return 失败(
          '校验',
          `「${蓝图.开始}」是这张子蓝图的入口，不能删（先把入口挪到别的单元）`,
          蓝图.开始,
        )
      }
    }
    // 记下要删的子蓝图 —— 它们的文件也要删
    const 子蓝图名 = 蓝图.单元.filter((u) => 要删.has(u.名) && u.类型 === '子蓝图').map((u) => u.名)

    // ④ 从列表里去掉
    蓝图.单元 = 蓝图.单元.filter((u) => !要删.has(u.名))

    // ⑤ 别人的「下层」里指向它的，去掉
    const 断开的下层: string[] = []
    for (const u of 蓝图.单元) {
      if (!u.下层 || !u.下层.length) continue
      const 前 = u.下层.length
      u.下层 = u.下层.filter((下) => !要删.has(下))
      if (u.下层.length !== 前) 断开的下层.push(u.名)
      if (!u.下层.length) delete u.下层
    }

    // ⑥ 锚点
    const 提示: string[] = []
    if (蓝图.开始 && 要删.has(蓝图.开始)) {
      提示.push(`开始锚点「${蓝图.开始}」没了，已清空`)
      蓝图.开始 = null
    }
    if (蓝图.结束 && 要删.has(蓝图.结束)) {
      提示.push(`结束锚点「${蓝图.结束}」没了，已清空`)
      蓝图.结束 = null
    }

    // ⑦ 「上层」是派生字段，不重算、不落盘（读的时候现算，见 src/蓝图工具.ts）

    // ⑦.1 统一检查（检查表里 unit.remove 该跑的）
    // 拦的（A1）有问题 ⇒ 一个字节都不写；改的（C3-C6）只记进返回，不落盘
    const 检查 = 跑检查('unit.remove', {
      蓝图,
      蓝图名,
      是不是子蓝图: !蓝图.单元.some((u) => u.类型 === '开始' || u.类型 === '结束'),
      限制: 配置.限制,
      读子图,
    })
    if (检查.拦.length) return 失败('校验', 拦的消息(检查.拦), 检查.拦[0].码)
    const 改动 = 检查.改.map((p) => `${p.码}|${p.消息}|${p.位置 ?? ''}`.replace(/\|+$/, ''))

    // ⑦.5 被删的单元如果有方法，挪进历史（不丢代码；用户 2026-11-10 定：method.remove 不单开命令）
    const 方法进历史: string[] = []
    try {
      const 产物 = 产物文件名(配置, 蓝图名)
      const 方法p = path.join(项目目录, 产物.方法)
      const 历史p = path.join(项目目录, 产物.方法历史)
      if (fs.existsSync(方法p)) {
        let 当前 = 读方法文件(方法p, 蓝图名, false).源码
        let 历史 = 读方法文件(历史p, 蓝图名, true).源码
        for (const 名 of 名单) {
          const 键 = 唯一历史键(历史, 名)
          const 搬 = 搬进历史(当前, 历史, 名, 键)
          if (搬) {
            当前 = 搬.当前
            历史 = 搬.历史
            方法进历史.push(键)
          }
        }
        const 裁 = 裁历史(历史, 配置.方法.历史个数)
        fs.writeFileSync(方法p, 当前, 'utf8')
        fs.writeFileSync(历史p, 裁.源码, 'utf8')
      }
    } catch {
      // 方法文件坏了也不该拦住删单元
    }

    // ⑧ 写盘（字段顺序固定；同步性每次修改都重算一次）
    蓝图.单元 = 蓝图.单元.map(规整单元)
    const 出图: 蓝图 = {
      格式版本: 蓝图.格式版本 ?? 1,
      名: 蓝图.名,
      开始: 蓝图.开始 ?? null,
      结束: 蓝图.结束 ?? null,
      同步性: 0,
      单元: 蓝图.单元,
    }
    出图.同步性 = 算同步性(出图, 读子图)
    fs.writeFileSync(蓝图文件, JSON.stringify(出图, null, 2) + '\n', 'utf8')
    try { 同步方法文件(项目目录, 配置, 蓝图名, 出图) } catch { }

    // ⑨ 子蓝图的 .json 一起删 —— 递归：子蓝图里还套着子蓝图，那些也要删
    const 删掉的文件: string[] = []
    for (const 名 of 子蓝图名) 删掉的文件.push(...删子蓝图树(项目目录, 配置, 名))

    return 成功({
      蓝图: 蓝图名,
      删除: 名单,
      总单元数: 蓝图.单元.length,
      断开的下层,
      ...(改动.length ? { 改动 } : {}),
      ...(方法进历史.length ? { 方法进历史 } : {}),
      ...(删掉的文件.length ? { 删掉的文件 } : {}),
      ...(提示.length ? { 提示 } : {}),
    })
  },
}
