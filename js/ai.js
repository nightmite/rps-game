/* =========================================================================
 * ai.js —— 电脑出拳策略（"会读心"的那部分）
 * -------------------------------------------------------------------------
 * 第 1 周的做法：70% 完全随机 + 30% 反制玩家最近 5 手里出现最多的手势。
 * 这一版把它拆成三档难度，其余逻辑不变——所以"难度适中"是可以用数据证明的。
 *
 * 为什么要留 70% 随机？
 *   如果电脑每次都精准反制，玩家会连输、觉得被作弊；
 *   如果完全随机，玩家随便点就 1/3 胜率，没有博弈感。
 *   30% 反制 = 你连着出同一个手势会被教育，但换了手势就能骗过它。
 * ========================================================================= */
(function (global) {
  'use strict';

  const Core = global.RpsCore;

  // 三档难度：smart = 反制的概率，memory = 记玩家最近几手
  const LEVELS = {
    easy:   { smart: 10, memory: 5, label: '简单', tip: '几乎随机' },
    normal: { smart: 30, memory: 5, label: '普通', tip: '偶尔反制' },
    hard:   { smart: 60, memory: 8, label: '困难', tip: '盯着你打' },
  };

  /** 统计最近 memory 手里出现最多的手势 */
  function favouriteMove(history, memory) {
    if (!history || history.length === 0) return 0;
    const recent = history.slice(-memory);
    const count = { 1: 0, 2: 0, 3: 0 };
    recent.forEach((m) => { count[m] += 1; });

    let best = 0;
    let bestCount = -1;
    [1, 2, 3].forEach((m) => {
      if (count[m] > bestCount) { bestCount = count[m]; best = m; }
    });
    // 一次都没出现过（理论上不会）就当作没有偏好
    return bestCount > 0 ? best : 0;
  }

  /** 决定电脑这一回合出什么 */
  function nextComputerMove(game) {
    const level = LEVELS[game.difficulty] || LEVELS.normal;
    const guess = favouriteMove(game.history, level.memory);

    const useCounter = guess !== 0 && Math.random() * 100 < level.smart;
    if (useCounter) {
      return Core.counterOf(guess);   // 出"能打赢你最爱出的那一手"的手势
    }
    return Core.randomMove();
  }

  global.RpsAI = { LEVELS, nextComputerMove, favouriteMove };
}(window));
