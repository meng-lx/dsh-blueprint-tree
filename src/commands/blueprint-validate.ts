// blueprint.validate —— 检测一张蓝图
//
// 用户 2026-11-10（原话）：
//   「这个方法先不要和创建删除修改放一起，检测不通过的处理不太一样，有返回的报错码就行」
//   「最后分别实现每个功能，因为问题不同命令要校验的不一样，
//    不同的校验是提醒还是拦截也不一样，所以统一报错格式就行，别搓成一整个」
//
// ⇒ 所以**逻辑都在 src/校验.ts 里按组拆开**，这条命令只负责「挑要跑哪几组 + 汇总」。
//   别的命令（unit.add 之类）想用哪条规则，直接 import 对应的函数，不用走这条命令。
//
// 参数：
//   项目    必填
//   蓝图    可选，默认主蓝图
//   范围    可选，'A,B,C,F,G,H' 这种；不给 = 全跑
//   完整    可选，true 时把每个问题单独列成对象（默认只给一行一条）

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 生效配置, 第三层项目配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import type { 蓝图 } from './unit-add.ts'
import { 查单元, 查连线, 查锚点, 查子蓝图文件, 查方法, 查规模, 查硬单元, 查循环, 汇总 } from '../校验.ts'
import type { 问题 } from '../校验.ts'

/** 把 'A,B' 或 ['A','B'] 或 undefined 解析成 Set；undefined = 全跑 */
function 解析范围(值: unknown): Set<string> | undefined {
  if (值 === undefined) return undefined
  const 原 = Array.isArray(值) ? 值 : String(值).split(/[,，]/)
  const 集 = new Set(原.map((x) => String(x).trim().toUpperCase()).filter((x) => x))
  return 集.size ? 集 : undefined
}

export const 查蓝图: 命令定义 = {
  名: 'blueprint.validate',
  说明: '检测蓝图（A 单元 / B 连线 / C 锚点与可达 / F 子蓝图文件 / G 方法 / H 规模），返回带码的问题',
  中文: ['检测蓝图', '检查蓝图', '校验蓝图', '检测', '检查'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const 名们 = 产物文件名(配置, 蓝图名)
    const 蓝图文件 = path.join(项目目录, 名们.蓝图)
    if (!fs.existsSync(蓝图文件)) {
      return 失败('不存在', `蓝图不存在：${蓝图名}`, 蓝图名)
    }

    let 图: 蓝图
    try {
      图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    } catch (e) {
      return 失败('校验', `蓝图不是合法 json：${(e as Error).message}`, 'json')
    }
    if (!Array.isArray(图.单元)) 图.单元 = []

    const 范围 = 解析范围(参数.范围)
    const 要跑 = (组: string) => 范围 === undefined || 范围.has(组)

    const 问题们: 问题[] = []
    if (要跑('A')) 问题们.push(...查单元(图))
    if (要跑('B')) 问题们.push(...查连线(图))
    if (要跑('C')) 问题们.push(...查锚点(图, 蓝图名 !== 配置.蓝图.默认名))
    if (要跑('F')) {
      问题们.push(
        ...查子蓝图文件(图, (名) => fs.existsSync(path.join(项目目录, 产物文件名(配置, 名).蓝图))),
      )
    }
    if (要跑('G')) {
      const 方法p = path.join(项目目录, 名们.方法)
      const 历史p = path.join(项目目录, 名们.方法历史)
      const 当前 = fs.existsSync(方法p) ? fs.readFileSync(方法p, 'utf8') : ''
      const 历史 = fs.existsSync(历史p) ? fs.readFileSync(历史p, 'utf8') : undefined
      问题们.push(...查方法(图, 当前, 历史))
    }
    if (要跑('H')) 问题们.push(...查规模(图, 配置.限制))

    // D / E 要递归读子图（同步性）
    const 读子图 = (名: string): 蓝图 | undefined => {
      const p = path.join(项目目录, 产物文件名(配置, 名).蓝图)
      if (!fs.existsSync(p)) return undefined
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
      } catch {
        return undefined
      }
    }
    if (要跑('D')) 问题们.push(...查硬单元(图, 读子图))
    if (要跑('E')) 问题们.push(...查循环(图, 读子图))

    const 汇 = 汇总(问题们)
    const 完整 = 参数.完整 === true || String(参数.完整 ?? '') === 'true'

    const 数据: Record<string, unknown> = {
      蓝图: 蓝图名,
      单元数: 图.单元.length,
      错误数: 汇.错误数,
      警告数: 汇.警告数,
      行: 汇.行,
    }
    if (完整) 数据.问题 = 问题们

    // 有错 ⇒ 顶层 ok=false，但**仍然给数据**（调用方要能看到全部问题）
    if (汇.错误数 > 0) {
      return {
        ok: false,
        错误: {
          类型: '校验',
          消息: `${蓝图名} 有 ${汇.错误数} 个错误、${汇.警告数} 个警告`,
          位置: 汇.行[0]?.split('|')[1],
        },
        数据,
      } as 结果
    }
    return 成功(数据)
  },
}
