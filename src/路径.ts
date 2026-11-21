// 蓝图的派生计算（上层 / 出口 / 同步性）+ 图上的基础查询
//
// 用户 2026-11-10：「文件中是不记录上层的吧，查看功能的上层是现算的」
// ⇒ blueprint json 里**永不写 上层**，每次读出来现算。
//   （原因：它是「下层」的反向投影，存两份就有不一致的风险；而且文件越短越省 token）
//
// 用户 2026-11-10（支配单元的口径）：
//   「支配单元是指某单元的所有上游都收束于此单元，被支配则是某单元所有下游都收束于此单元」
//   「最近的，随便找一条上游一直走，找到这些单元中的一个时，这一个就是支配/被支配单元」
//   「不涉及跨蓝图所以运算量可以控制」
// ⇒ 不建支配树：
//   - 「甲支配乙」= 拿掉甲之后，从入口到不了乙（两次 BFS，O(V+E)）
//   - 「最近的支配者」= 从乙出发沿任意一条上层链往上走，第一个满足上式的就是它

import type { 蓝图, 单元 } from './commands/unit-add.ts'

/** 出口标记：下层里写这个字符串，表示「这里就是出口」，它不对应任何单元 */
export const 结束标记 = '$结束'

// ═══════════════════════════════════════════════════════════
// 派生字段
// ═══════════════════════════════════════════════════════════

/** 现算全图的「上层」：键 = 单元名，值 = 指向它的单元名（按单元顺序） */
export function 算上层(蓝图: 蓝图): Record<string, string[]> {
  const 出: Record<string, string[]> = {}
  for (const u of 蓝图.单元 ?? []) {
    for (const 下 of u.下层 ?? []) {
      if (下 === 结束标记) continue // 出口标记不是单元
      ;(出[下] ??= []).push(u.名)
    }
  }
  return 出
}

/** 某个单元的上层（现算） */
export function 上层们(蓝图: 蓝图, 单元名: string): string[] {
  return 算上层(蓝图)[单元名] ?? []
}

/** 某个单元的下层里「真实连到的单元」（去掉 $结束） */
export function 真实下层(u: { 下层?: string[] }): string[] {
  return (u.下层 ?? []).filter((x) => x !== 结束标记)
}

/** 这个单元是不是出口（下层里写了 $结束） */
export function 是出口(u: { 下层?: string[] }): boolean {
  return (u.下层 ?? []).includes(结束标记)
}

// ═══════════════════════════════════════════════════════════
// 图查询
// ═══════════════════════════════════════════════════════════

/** 单元名 → 单元 */
function 表(蓝图: 蓝图): Map<string, 单元> {
  return new Map((蓝图.单元 ?? []).map((u) => [u.名, u]))
}

/** 真实下层（去掉 `$结束` 这种标记，只留图里的单元名） */
function 真下层(蓝图: 蓝图, u: 单元 | undefined): string[] {
  const 有 = 表(蓝图)
  return (u?.下层 ?? []).filter((x) => x !== 结束标记 && 有.has(x))
}

/** 顺下层能走到的所有单元（含起点） */
export function 到得了(蓝图: 蓝图, 起点: string): Set<string> {
  const 有 = 表(蓝图)
  const 到 = new Set<string>()
  if (!有.has(起点)) return 到
  const 队 = [起点]
  while (队.length) {
    const 名 = 队.pop()!
    if (到.has(名)) continue
    到.add(名)
    for (const 下 of 真下层(蓝图, 有.get(名))) {
      if (!到.has(下)) 队.push(下)
    }
  }
  return 到
}

/** 反着走：能到达终点的所有单元（含终点） */
export function 谁到得了(蓝图: 蓝图, 终点: string): Set<string> {
  const 有 = 表(蓝图)
  const 反 = new Map<string, string[]>()
  for (const u of 蓝图.单元 ?? []) {
    for (const 下 of 真下层(蓝图, u)) {
      const 列表 = 反.get(下) ?? []
      列表.push(u.名)
      反.set(下, 列表)
    }
  }
  const 到 = new Set<string>()
  if (!有.has(终点)) return 到
  const 队 = [终点]
  while (队.length) {
    const 名 = 队.pop()!
    if (到.has(名)) continue
    到.add(名)
    for (const 上 of 反.get(名) ?? []) {
      if (!到.has(上)) 队.push(上)
    }
  }
  return 到
}

/** 两点之间（不含两端）—— 从甲可达 ∩ 能到达乙 */
export function 之间(蓝图: 蓝图, 甲: string, 乙: string): string[] {
  const 甲到 = 到得了(蓝图, 甲)
  if (!甲到.has(乙)) return []
  const 到乙 = 谁到得了(蓝图, 乙)
  return [...甲到].filter((x) => x !== 甲 && x !== 乙 && 到乙.has(x))
}

/** 拿掉某个单元之后，从起点还能不能走到终点 */
export function 拿掉还能到吗(蓝图: 蓝图, 拿掉: string, 起点: string, 终点: string): boolean {
  const 有 = 表(蓝图)
  if (!有.has(起点) || !有.has(终点)) return false
  if (拿掉 === 起点 || 拿掉 === 终点) return false
  const 到 = new Set<string>()
  const 队 = [起点]
  while (队.length) {
    const 名 = 队.pop()!
    if (名 === 拿掉 || 到.has(名)) continue
    到.add(名)
    if (名 === 终点) return true
    for (const 下 of 真下层(蓝图, 有.get(名))) {
      if (下 !== 拿掉 && !到.has(下)) 队.push(下)
    }
  }
  return 到.has(终点)
}

/** 甲支配乙吗 */
export function 甲支配乙(蓝图: 蓝图, 入口: string, 甲: string, 乙: string): boolean {
  if (甲 === 乙) return false
  if (!到得了(蓝图, 甲).has(乙)) return false
  return !拿掉还能到吗(蓝图, 甲, 入口, 乙)
}

/**
 * 找乙的最近支配者（不含乙自己）
 *
 * 从乙出发，随便挑一条上层链一路往上走，
 * 第一个「拿掉它之后入口到不了乙」的就是最近的支配者。
 *
 * 因为支配者的定义就是「乙的所有来路都经过它」，
 * 所以随便哪条链往上走都一定会撞上它，而且撞上的第一个就是最近的那个。
 */
export function 最近支配者(蓝图: 蓝图, 入口: string, 乙: string): string | undefined {
  const 反 = new Map<string, string[]>()
  for (const u of 蓝图.单元 ?? []) {
    for (const 下 of 真下层(蓝图, u)) {
      const 列表 = 反.get(下) ?? []
      列表.push(u.名)
      反.set(下, 列表)
    }
  }

  const 走过 = new Set<string>()
  let 当前: string | undefined = 乙
  while (当前) {
    const 下一个: string | undefined = (反.get(当前) ?? [])[0]
    if (!下一个 || 走过.has(下一个)) return undefined
    走过.add(下一个)
    if (下一个 === 入口) return 入口
    if (!拿掉还能到吗(蓝图, 下一个, 入口, 乙)) return 下一个
    当前 = 下一个
  }
  return undefined
}

/** 从入口能走到的所有单元（「不连接开始的不用管」—— 这个集合之外的单元不参与检查） */
export function 活的单元(蓝图: 蓝图): Set<string> {
  const 入口 = 蓝图.开始
  if (!入口 || !表(蓝图).has(入口)) return new Set()
  return 到得了(蓝图, 入口)
}

// ═══════════════════════════════════════════════════════════
// 同步性
// ═══════════════════════════════════════════════════════════

/**
 * 算一张图的「同步性」：0 = 同步，1 = 不同步
 *
 * 用户 2026-11-10 的正式口径：
 *   「判断子蓝图同步性……运行此方法并输入子蓝图名，
 *     只要没有返回选择和多上游软单元，就标 0，否则 1」
 *   ⇒ 看「入口 → 出口」之间有没有选择单元 / 多上游软单元
 *
 * 再加一条（同一天）：
 *   「后续路径上遇到子蓝图，递归查蓝图，相加他们的标记，大于 0 就不同步」
 *   ⇒ 之间的子蓝图里只要有一个标记 1，这张图也是 1
 *
 * @param 读子图 读某个子蓝图的 json（不传就不递归 —— 算出来的标记不含下级子图）
 */
/**
 * 忽略循环向量之后，图里还有没有环。
 *
 * 用户 2026-11-10：`unit.add` 批量建单元时可能造出没标记的环 ⇒ **直接报错**（甲方案），
 * 不自动修 —— 自动修只有 `unit.update` 改下层那一条路才有。
 *
 * 「忽略循环向量」= 把 `类型: 循环向量` 的单元整个摘掉（它本身就是一条回边的标记），
 * 剩下的图必须无环。
 *
 * @returns 找到一个环就返回它的路径（首尾同名），没环返回 undefined
 */
export function 找环(蓝图: 蓝图): string[] | undefined {
  const 单元们 = (蓝图.单元 ?? []).filter((u) => u.类型 !== '循环向量')
  const 表 = new Map(单元们.map((u) => [u.名, u]))
  const 白 = 0
  const 灰 = 1
  const 黑 = 2
  const 色 = new Map<string, number>()
  const 栈: string[] = []

  const 走 = (名: string): string[] | undefined => {
    const c = 色.get(名) ?? 白
    if (c === 黑) return undefined
    if (c === 灰) {
      const i = 栈.indexOf(名)
      return [...栈.slice(i), 名]
    }
    色.set(名, 灰)
    栈.push(名)
    for (const 下 of 表.get(名)?.下层 ?? []) {
      if (!表.has(下)) continue
      const r = 走(下)
      if (r) return r
    }
    栈.pop()
    色.set(名, 黑)
    return undefined
  }

  for (const u of 单元们) {
    const r = 走(u.名)
    if (r) return r
  }
  return undefined
}

export function 算同步性(蓝图: 蓝图, 读子图?: (名: string) => 蓝图 | undefined): 0 | 1 {
  return 算同步性内(蓝图, 读子图, new Set())
}

function 算同步性内(
  蓝图: 蓝图,
  读子图: ((名: string) => 蓝图 | undefined) | undefined,
  已看: Set<string>,
): 0 | 1 {
  const 单元们 = 蓝图.单元 ?? []
  const 入口 = 蓝图.开始
  if (!入口 || !单元们.some((u) => u.名 === 入口)) return 1

  const 出口们 = 单元们.filter(是出口).map((u) => u.名)
  if (!出口们.length) return 1

  // 入口到出口之间的所有单元（多个出口就挨个算，取并集）
  const 之间集 = new Set<string>()
  for (const 出口 of 出口们) {
    for (const 名 of 之间(蓝图, 入口, 出口)) 之间集.add(名)
  }

  const 有 = 表(蓝图)
  const 上层数 = 算上层(蓝图)

  for (const 名 of 之间集) {
    const u = 有.get(名)
    if (!u) continue
    // ① 选择单元 —— 选了才调，次数不定
    if (u.类型 === '选择') return 1
    // ② 多上游软单元 —— 来几个上游就跑几次，次数不定
    if (u.类型 === '软' && (上层数[名]?.length ?? 0) >= 2) return 1
    // ③ 子蓝图 —— 递归看它的标记
    if (u.类型 === '子蓝图' && 读子图 && !已看.has(名)) {
      已看.add(名)
      const 子 = 读子图(名)
      if (!子) return 1 // 文件没了 ⇒ 算不出来，按不同步处理
      if (算同步性内(子, 读子图, 已看) === 1) return 1
    }
  }

  return 0
}

/**
 * 把「会成环的下层连接」改成「循环向量单元」。
 *
 * 用户 2026-11-14（B2 的口径）：
 *   「单元自己循环，循环头尾单元间无选择和多上游软单元（因为没有单元），
 *    这样循环只要从选择开始，就符合定义，返回修改内容是这次创建或修改被判断为创建循环，
 *    防止 AI 或人误操作自己不知道」
 * 用户 2026-11-10（名字）：
 *   「循环不重名就行，名字只是删除和修改此循环时指定用的」
 *
 * ⇒ 只要「下」顺着往下能走回本单元，就造一个 `循环N` 顶替这条线。
 */
export function 环形修正(
  蓝图: import('./commands/unit-add.ts').蓝图,
  本单元名: string,
  新下层: string[],
): {
  下层: string[]
  新建: import('./commands/unit-add.ts').单元[]
  提示: string[]
  /** 出现这种情况时整条修改要拒掉（目前只有「不是选择单元却要成环」） */
  错?: string
} {
  const 出: string[] = []
  const 新建: import('./commands/unit-add.ts').单元[] = []
  const 提示: string[] = []
  const 已用 = new Set((蓝图.单元 ?? []).map((u) => u.名))
  const 本单元 = (蓝图.单元 ?? []).find((u) => u.名 === 本单元名)

  for (const 下 of 新下层) {
    if (下 === 结束标记 || !已用.has(下)) {
      出.push(下)
      continue
    }
    // 从「下」顺着往下走，还能走回本单元吗？
    const 能回 = 到得了(蓝图, 下).has(本单元名)
    if (!能回) {
      出.push(下)
      continue
    }

    // 成环 —— 但循环向量只能由「选择」发出（E0），否则造出来的是废数据
    if (本单元 && 本单元.类型 !== '选择') {
      return {
        下层: 新下层,
        新建: [],
        提示: [],
        错: `「${本单元名}」是「${本单元.类型}」单元，不能让「${下}」指回来 —— 循环向量只能由「选择」单元发出，请先把它改成选择类型，或者别连这条线`,
      }
    }
    let i = 1
    while (已用.has(`循环${i}`)) i++
    const 名 = `循环${i}`
    已用.add(名)
    新建.push({ 名, 类型: '循环向量', 标签: '无', 状态: '提醒', 下层: [下] })
    出.push(名)
    提示.push(`「${下}」是「${本单元名}」的上游，这条线会成环；已改成循环向量单元「${名}」`)
  }

  return { 下层: 出, 新建, 提示 }
}
