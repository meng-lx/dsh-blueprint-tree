// project.add —— 把一个**已经存在的**项目目录登记进来
//
// 用户 2026-11-16：「项目页面加一个添加项目功能」
// 场景：项目是先建在别处的（比如 DSH 里让 AI 建到临时目录），界面这边只需要认识它。
// ⇒ 不创建、不修改任何文件，只往登记表里写一条。
//
// 和 project.create 一样，返回里**不给路径**（用户 2026-11-10 的要求）。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 配置路径, 生效配置 } from '../项目.ts'
import { 查项目, 登记 } from '../登记表.ts'

export const 添加项目: 命令定义 = {
  名: 'project.add',
  说明: '登记一个已经存在的项目目录（不创建文件，只让插件认识它）',
  中文: ['添加项目', '加入项目', '导入项目', '登记项目', '添加已有项目'],
  执行(参数): 结果 {
    const 原样 = String(参数.目录 ?? '').trim()
    if (!原样) return 失败('参数', '缺少「目录」——要添加的项目文件夹在哪', '目录')

    const 目录 = path.resolve(原样)
    if (!fs.existsSync(目录) || !fs.statSync(目录).isDirectory()) {
      return 失败('不存在', `没有这个文件夹：${目录}`, '目录')
    }
    // 认项目的唯一凭据就是 flow.json —— 没有它不登记，免得把随便一个目录塞进来
    if (!fs.existsSync(配置路径(目录))) {
      return 失败('校验', `这个文件夹不是项目（里面没有 flow.json）：${目录}`, '目录')
    }

    const 名 = String(参数.名 ?? '').trim() || path.basename(目录)
    if (!名) return 失败('参数', '拿不到项目名，请显式传「名」', '名')

    const 已有 = 查项目(名)
    if (已有 && path.resolve(已有.路径) !== 目录) {
      return 失败(
        '已存在',
        `已经有一个叫「${名}」的项目了，登记的是别的目录。要么换个「名」，要么先删掉它`,
        名,
      )
    }

    // 蓝图默认名从 flow.json 里取；取不到就退回「主蓝图」
    let 蓝图名 = '主蓝图'
    try {
      蓝图名 = 生效配置(名, 目录)?.蓝图?.默认名 || 蓝图名
    } catch {
      // 配置坏了也照样能登记，后面照图读的时候会报具体的错
    }

    登记(名, { 路径: 目录, 蓝图: 蓝图名, 创建于: new Date().toISOString() })

    return 成功({ 项目: 名, 蓝图: 蓝图名 })
  },
}
