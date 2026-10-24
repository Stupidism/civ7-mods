// 游戏内“休息设置”优先于这些初始值。修改文件后需重新载入游戏。
export const DEFAULTS = Object.freeze({
  turnEnabled: true,
  timeEnabled: true,
  saveKeepCount: 10,
  nightEnabled: true,
  nightStart: 22 * 60,
  nightEnd: 7 * 60,
  playMinutes: 25,
  restMinutes: 5,
  intervals: Object.freeze([5, 4, 3, 2, 1]),
});
