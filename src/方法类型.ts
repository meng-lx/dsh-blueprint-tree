// 方法的输出字段与类型 —— 用 TypeScript 官方类型检查器推出来
//
// 用户 m14357：「那就用官方工具,检测最后return内的值的类型就能获取完整信息了」
// 用户 m14343：「让ai生成时同步给上游的方法,成本高吗,而且我担心这样做,改一个方法下游都要动」
//
// ⇒ 契约由插件生成，不让 AI 去读上游方法源码：
//   骨架里给每个上游写精确的 `as { 字段: 类型 }`，AI 只写正文。
//
// 为什么不用正则（src/随机数据.ts 的 取字段表）：
//   正则只认 `const x: string = ...` 这种显式标注，遇到返回字面量、计算值、
//   联合类型、可选字段就退化。类型检查器是同一份源码的权威答案。
//
// 用 typescript 5.x 的 Compiler API（7.x 是 tsgo，没有 Compiler API）。

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

/** 字段名 → 类型文本（如 `number` / `string` / `unknown`） */
export type 输出表 = Record<string, string>

type 缓存项 = { 内容: string; 表: Record<string, 输出表> }

const 缓存 = new Map<string, 缓存项>()

/** 把类型文本收拾成能直接写进 `as {...}` 的形状 */
function 收拾类型(文本: string): string {
  const 净 = 文本.replace(/\s+/g, ' ').trim()
  if (!净) return 'unknown'
  // 函数签名太长，契约里给 unknown 就够（字段本身还能取到）
  if (净.includes('=>') && 净.length > 40) return 'unknown'
  return 净
}

/**
 * 推断一个方法文件里所有方法的返回字段。
 *
 * @param 源码 方法文件全文
 * @param 文件名 只用于缓存与诊断，随便给
 */
export function 推断输出表(源码: string, 文件名 = '方法.ts'): Record<string, 输出表> {
  const 假路径 = path.resolve(process.cwd(), 文件名)
  const 旧 = 缓存.get(假路径)
  if (旧 && 旧.内容 === 源码) return 旧.表

  const 选项: ts.CompilerOptions = {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: false,
    strict: false,
  }

  const 主 = ts.createCompilerHost(选项)
  const 原读 = 主.readFile.bind(主)
  const 原在 = 主.fileExists.bind(主)
  主.readFile = (名) => (path.resolve(名) === 假路径 ? 源码 : 原读(名))
  主.fileExists = (名) => (path.resolve(名) === 假路径 ? true : 原在(名))
  主.getSourceFile = (名, 语言版本) => {
    if (path.resolve(名) === 假路径) return ts.createSourceFile(名, 源码, ts.ScriptTarget.Latest, true)
    const 文本 = 原读(名)
    return 文本 === undefined ? undefined : ts.createSourceFile(名, 文本, 语言版本 ?? ts.ScriptTarget.Latest, true)
  }

  const 表: Record<string, 输出表> = {}
  let 程序: ts.Program
  try {
    程序 = ts.createProgram([假路径], 选项, 主)
  } catch {
    缓存.set(假路径, { 内容: 源码, 表 })
    return 表
  }
  const 检查器 = 程序.getTypeChecker()
  const 源 = 程序.getSourceFile(假路径)
  if (!源) {
    缓存.set(假路径, { 内容: 源码, 表 })
    return 表
  }

  // 只看 `export const 方法 = { ... }` / `const 方法 = { ... }` 的直接属性
  const 走 = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        const 键 = 属性键(p.name)
        if (!键) continue
        const 值 = 输出字段(检查器, p)
        if (值) 表[键] = 值
      }
      return
    }
    ts.forEachChild(n, 走)
  }
  走(源)

  缓存.set(假路径, { 内容: 源码, 表 })
  return 表
}

function 属性键(n: ts.PropertyName | undefined): string | undefined {
  if (!n) return undefined
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
  return undefined
}

/** 一个方法属性的返回字段 */
function 输出字段(检查器: ts.TypeChecker, p: ts.ObjectLiteralElementLike): 输出表 | undefined {
  let 声明: ts.SignatureDeclaration | undefined
  if (ts.isMethodDeclaration(p)) 声明 = p
  else if (ts.isPropertyAssignment(p)) {
    if (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)) 声明 = p.initializer
  } else if (ts.isShorthandPropertyAssignment(p) || ts.isSpreadAssignment(p)) {
    return undefined
  }
  if (!声明) return undefined

  const 签名 = 检查器.getSignatureFromDeclaration(声明)
  if (!签名) return undefined
  let 类型 = 检查器.getReturnTypeOfSignature(签名)
  // async 方法返回 Promise<T>，要拿 T
  const 等 = 检查器.getAwaitedType?.(类型)
  if (等) 类型 = 等

  const 出: 输出表 = {}
  for (const 符 of 检查器.getPropertiesOfType(类型)) {
    const 字段类型 = 检查器.getTypeOfSymbolAtLocation(符, 声明)
    // 可选属性在契约里给成 `类型 | undefined`
    let 文本 = 检查器.typeToString(字段类型, 声明, ts.TypeFormatFlags.NoTruncation)
    文本 = 收拾类型(文本)
    const 可选 = (符.flags & ts.SymbolFlags.Optional) !== 0
    if (可选 && !文本.includes('undefined')) 文本 = `${文本} | undefined`
    出[String(符.name)] = 文本
  }
  return 出
}

/** 取某个上游方法在源码里的输出表；没有方法/推不出来给 undefined */
export function 取上游输出(源码: string, 上游: string[]): Record<string, 输出表 | undefined> {
  const 全部 = 推断输出表(源码)
  const 出: Record<string, 输出表 | undefined> = {}
  for (const 名 of 上游) 出[名] = 全部[名]
  return 出
}

/**
 * 直接扫方法文件文本里某个上游方法的 `as { ... }` 契约 ——
 * 骨架生成时用不到（那时还没有下游），但 `method.brief` 要用它回答
 * 「下游读了我哪些字段」。
 */
export function 被读字段(方法文件文本: string, 单元名: string): string[] {
  const 变量 = '上游_' + String(单元名).replace(/[^\p{L}\p{N}_$]/gu, '_')
  const 出 = new Set<string>()
  const 正则 = new RegExp(`const\\s+${变量}\\s*=\\s*输入\\.find\\([\\s\\S]*?\\?\\.数据\\s+as\\s+\\{([^}]*)\\}`, 'g')
  for (const m of 方法文件文本.matchAll(正则)) {
    for (const 行 of m[1].split(/[;,\n]/)) {
      const 名 = 行.split(':')[0]?.trim()
      if (名) 出.add(名)
    }
  }
  return [...出]
}

/** 方法文件是否还在（给带缓存的调用方做失效判断） */
export function 文件在(路径: string): boolean {
  try {
    return fs.statSync(路径).isFile()
  } catch {
    return false
  }
}

/**
 * 输出表的规范文本 —— 用来比「契约有没有变」。
 * 字段名 + 类型 + 顺序都算进对比：改了格式/顺序也算变，下游骨架要重生成。
 */
export function 契约文本(表: 输出表 | undefined): string {
  if (!表) return ''
  return Object.entries(表).map(([名, 型]) => `${名}:${型}`).join(';')
}
