// unit.get —— 看一个单元的全部
//
// 用户 2026-11-10 问：「是直接返回全部节省输出 token 好，还是加指定信息的功能节省输入 token 好，
//   或者不指定直接输出全部」
//
// ⇒ 定：**直接全部**。理由同一天写在回复里：
//   单元就那么点东西（属性 + 一段方法），一次给全，AI 就不用再问一次；
//   而「再问一次」要烧掉一整轮对话，比多输出几百 token 贵得多。
//
// 所以这个命令**没有「只看某几项」的参数**，唯一可省的是历史原文（只给键名，不给源码）。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 定位项目 } from '../登记表.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import type { 蓝图 } from './unit-add.ts'
import { 读方法文件, 历史变量名, 分隔符, 当前变量名 } from '../方法命令.ts'
import { 切方法, 列出方法 } from '../方法文件.ts'
import { 上层们 } from '../蓝图工具.ts'

export const 看单元: 命令定义 = {
  名: 'unit.get',
  说明: '看一个单元的全部：属性 + 当前方法原文 + 历史版本键名（历史只给名字，不给源码）',
  中文: ['查看单元', '看单元', '单元详情'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录, 项 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 项.蓝图 ?? 配置.蓝图.默认名)
      .trim()
      .replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const 单元名 = String(参数.单元 ?? '').trim()
    if (!单元名) return 失败('参数', '缺少「单元」——看哪个单元', '单元')

    const 文件 = 产物文件名(配置, 蓝图名)
    const 蓝图文件 = path.join(项目目录, 文件.蓝图)
    if (!fs.existsSync(蓝图文件)) return 失败('不存在', `没有叫「${蓝图名}」的蓝图`, 蓝图名)

    let 蓝图: 蓝图
    try {
      蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    } catch {
      return 失败('校验', `蓝图文件不是合法 json：${蓝图名}`, 蓝图名)
    }

    const u = (蓝图.单元 ?? []).find((x) => x.名 === 单元名)
    if (!u) return 失败('不存在', `蓝图「${蓝图名}」里没有单元「${单元名}」`, 单元名)

    // 方法：当前原文 + 历史键名
    let 当前源码 = ''
    let 历史源码 = ''
    try {
      当前源码 = 读方法文件(path.join(项目目录, 文件.方法), 蓝图名, false).源码
      历史源码 = 读方法文件(path.join(项目目录, 文件.方法历史), 蓝图名, true).源码
    } catch {
      // 方法层坏了不该拦住看单元
    }

    const 当前块 = 切方法(当前源码, 单元名, 当前变量名)
    const 历史 = 列出方法(历史源码, 历史变量名).filter((k) => {
      const 基 = k.includes(分隔符) ? k.slice(0, k.lastIndexOf(分隔符)) : k
      return 基 === 单元名
    })

    return 成功({
      蓝图: 蓝图名,
      // 「上层」是现算的 —— 文件里不存它（用户 2026-11-10 定）
      单元: { ...u, 上层: 上层们(蓝图, 单元名) },
      ...(当前块 ? { 方法: 当前块.文本 } : {}),
      ...(历史.length ? { 历史 } : {}),
    })
  },
}
