import { 跑检查 } from "./src/跑检查.ts"

const 图 = { 格式版本:1, 名:"主蓝图", 开始:"开始", 结束:"结束", 单元:[
  { 名:"开始", 类型:"开始", 标签:"无", 状态:"提醒", 下层:["甲"] },
  { 名:"甲", 类型:"硬", 标签:"无", 状态:"提醒", 下层:["结束"] },
  { 名:"结束", 类型:"结束", 标签:"无", 状态:"提醒", 下层:["$结束"] },
]}
try {
  const r = 跑检查("unit.add", { 蓝图:图, 蓝图名:"主蓝图", 是不是子蓝图:false, 限制:{单元数:7,token:300000} })
  console.log("OK", JSON.stringify(r))
} catch (e) {
  console.log("THROW:", e.message)
  console.log(e.stack.split("\n").slice(0,12).join("\n"))
}
