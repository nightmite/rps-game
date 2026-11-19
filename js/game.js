/* =========================================================================
 * game.js —— 规则内核
 * -------------------------------------------------------------------------
 * 这一层是第 1 周 C++ 版 game.cpp 的网页移植：只放"规则、比分、战绩"，
 * 完全不碰页面元素（不查 DOM），所以可以单独跑自测，也可以直接被别的界面复用。
 * ========================================================================= */
(function (global) {
  'use strict';

  // ---- 三个手势 ---------------------------------------------------------
  const MOVE = { ROCK: 1, SCISSORS: 2, PAPER: 3 };

  const MOVE_INFO = {
    1: { key: 'rock', cn: '石头', en: 'ROCK', emoji: '✊' },
    2: { key: 'scissors', cn: '剪刀', en: 'SCISSORS', emoji: '✌️' },
    3: { key: 'paper', cn: '布', en: 'PAPER', emoji: '✋' },
  };

  // 克制关系：石头(1) 砸 剪刀(2)，剪刀(2) 剪 布(3)，布(3) 包 石头(1)
  // COUNTER_OF[x] = "能打赢 x 的手势"
  const COUNTER_OF = { 1: 3, 2: 1, 3: 2 };

  const OUTCOME = { WIN: 1, DRAW: 0, LOSE: -1 };

  const K_RECENT_KEEP = 8;   // 界面上展示的"最近 N 回合"
  const K_MEMORY_KEEP = 8;   // 电脑最多记玩家最近 N 手
  const STORE_KEY = 'rps_23102731_v1';

  // ---- 小工具 -----------------------------------------------------------
  function isMove(m) {
    return m === MOVE.ROCK || m === MOVE.SCISSORS || m === MOVE.PAPER;
  }

  /** 判定：返回 1 = 玩家赢，0 = 平，-1 = 玩家输 */
  function judge(playerMove, cpuMove) {
    if (playerMove === cpuMove) return OUTCOME.DRAW;
    const beats = (a, b) =>
      (a === MOVE.ROCK && b === MOVE.SCISSORS) ||
      (a === MOVE.SCISSORS && b === MOVE.PAPER) ||
      (a === MOVE.PAPER && b === MOVE.ROCK);
    return beats(playerMove, cpuMove) ? OUTCOME.WIN : OUTCOME.LOSE;
  }

  function counterOf(move) {
    return COUNTER_OF[move];
  }

  /** 1 / 2 / 3 等概率随机 */
  function randomMove() {
    return 1 + Math.floor(Math.random() * 3);
  }

  function outcomeText(outcome) {
    if (outcome === OUTCOME.WIN) return { cn: '你赢了！', en: 'YOU WIN', cls: 'win' };
    if (outcome === OUTCOME.LOSE) return { cn: '你输了', en: 'YOU LOSE', cls: 'lose' };
    return { cn: '平局', en: 'DRAW', cls: 'draw' };
  }

  // ---- 一局（Match）的进行状态 ------------------------------------------
  class RpsGame {
    constructor(cfg) {
      cfg = cfg || {};
      this.targetWins = cfg.targetWins || 3;      // 先赢几局算赢下"本局"
      this.endless = !!cfg.endless;               // 无限练习模式
      this.difficulty = cfg.difficulty || 'normal';
      this.reset();
    }

    reset() {
      this.playerScore = 0;
      this.cpuScore = 0;
      this.draws = 0;
      this.round = 0;
      this.streak = 0;          // 当前连胜
      this.bestStreak = 0;      // 本局最长连胜
      this.recent = [];         // 最近几回合（给界面做战绩条）
      this.history = [];        // 玩家最近出过的手势（给电脑"读心"用）
      this.lastRecord = null;
    }

    /**
     * 玩一回合。电脑的手势在这里才决定（界面先播动画，最后结算，比分不会提前跳）
     * @returns {{round:number, player:number, cpu:number, outcome:number}}
     */
    playRound(playerMove) {
      if (!isMove(playerMove)) throw new Error('非法手势: ' + playerMove);

      const cpuMove = global.RpsAI.nextComputerMove(this);
      const outcome = judge(playerMove, cpuMove);

      this.round += 1;
      this.history.push(playerMove);
      if (this.history.length > K_MEMORY_KEEP) this.history.shift();

      if (outcome === OUTCOME.WIN) {
        this.playerScore += 1;
        this.streak += 1;
        if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      } else if (outcome === OUTCOME.LOSE) {
        this.cpuScore += 1;
        this.streak = 0;          // 输掉会断连胜，平局不断（和第 1 周一致）
      } else {
        this.draws += 1;
      }

      const record = { round: this.round, player: playerMove, cpu: cpuMove, outcome };
      this.recent.push(record);
      if (this.recent.length > K_RECENT_KEEP) this.recent.shift();
      this.lastRecord = record;
      return record;
    }

    /** 是否已经分出胜负 */
    isMatchOver() {
      if (this.endless) return false;
      return this.playerScore >= this.targetWins || this.cpuScore >= this.targetWins;
    }

    playerWon() {
      return this.playerScore > this.cpuScore;
    }

    /** 本回合之后的提示语（给界面上那行小字用） */
    advice() {
      const last = this.lastRecord;
      if (!last) return '';
      if (last.outcome === OUTCOME.WIN) return '漂亮！继续压住它';
      if (last.outcome === OUTCOME.LOSE) return '它好像猜到你了…换个手势试试';
      return '势均力敌，再来一手';
    }
  }

  // ---- 生涯战绩（存浏览器 localStorage，等价于第 1 周的 record.txt）-----
  const DEFAULT_PROFILE = {
    wins: 0,
    loses: 0,
    draws: 0,
    bestEver: 0,        // 历史最佳连胜
    sound: true,
    difficulty: 'normal',
    endless: false,
    targetWins: 3,
  };

  const Profile = {
    data: Object.assign({}, DEFAULT_PROFILE),

    load() {
      try {
        const raw = global.localStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          this.data = Object.assign({}, DEFAULT_PROFILE, saved);
        }
      } catch (e) {
        this.data = Object.assign({}, DEFAULT_PROFILE);
      }
      return this.data;
    },

    save() {
      try {
        global.localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
      } catch (e) { /* 隐私模式等情况下静默失败 */ }
    },

    /** 把一局的结果记进生涯战绩 */
    addMatch(game) {
      this.data.wins += game.playerScore;
      this.data.loses += game.cpuScore;
      this.data.draws += game.draws;
      if (game.bestStreak > this.data.bestEver) this.data.bestEver = game.bestStreak;
      this.save();
    },

    total() {
      return this.data.wins + this.data.loses + this.data.draws;
    },

    winRate() {
      const t = this.total();
      return t === 0 ? 0 : (this.data.wins / t) * 100;
    },

    reset() {
      this.data = Object.assign({}, DEFAULT_PROFILE, {
        sound: this.data.sound,
        difficulty: this.data.difficulty,
        endless: this.data.endless,
        targetWins: this.data.targetWins,
      });
      this.save();
    },
  };

  // ---- 自测（在浏览器控制台敲 RpsSelfTest() 或跑 --selftest 参数）-------
  function selfTest(rounds) {
    rounds = rounds || 4000;
    const lines = [];
    let fail = 0;
    const ok = (cond, msg) => {
      lines.push((cond ? '  [PASS] ' : '  [FAIL] ') + msg);
      if (!cond) fail += 1;
    };

    // ① 九种组合判定
    {
      const cases = [
        [1, 1, 0], [1, 2, 1], [1, 3, -1],
        [2, 1, -1], [2, 2, 0], [2, 3, 1],
        [3, 1, 1], [3, 2, -1], [3, 3, 0],
      ];
      let allOk = true;
      cases.forEach((c) => { if (judge(c[0], c[1]) !== c[2]) allOk = false; });
      ok(allOk, '规则判定 9 种组合全部正确');
    }

    // ② 随机出拳时胜率应该接近 1/3
    {
      let w = 0, d = 0, l = 0;
      for (let i = 0; i < rounds; i += 1) {
        const g = new RpsGame({ endless: true });
        const r = g.playRound(randomMove());
        if (r.outcome === 1) w += 1; else if (r.outcome === 0) d += 1; else l += 1;
      }
      const rate = (w / rounds) * 100;
      ok(rate > 28 && rate < 39, '随机出拳胜率 ' + rate.toFixed(2) + '%（应为 28%~39%）');
      lines.push('       胜 ' + w + ' / 平 ' + d + ' / 负 ' + l);
    }

    // ③ 一直出石头会被电脑读到 → 胜率明显偏低
    {
      let w = 0;
      for (let i = 0; i < rounds; i += 1) {
        const g = new RpsGame({ endless: true, difficulty: 'normal' });
        // 先喂几手石头让它记住习惯
        for (let k = 0; k < 5; k += 1) g.playRound(1);
        if (g.playRound(1).outcome === 1) w += 1;
      }
      const rate = (w / rounds) * 100;
      ok(rate < 30, '只出石头胜率 ' + rate.toFixed(2) + '%（< 30%，说明电脑会读心）');
    }

    // ④ 经典局必然结束 / 无限模式不会结束
    {
      const g = new RpsGame({ targetWins: 3 });
      let guard = 0;
      while (!g.isMatchOver() && guard < 500) { g.playRound(randomMove()); guard += 1; }
      ok(g.isMatchOver() && guard < 500, '经典模式一定能结束（用了 ' + guard + ' 回合）');

      const e = new RpsGame({ endless: true });
      for (let i = 0; i < 1000; i += 1) e.playRound(randomMove());
      ok(!e.isMatchOver(), '无限模式 1000 回合不会结束');
    }

    // ⑤ 近期战绩只留 8 条
    {
      const g = new RpsGame({ endless: true });
      for (let i = 0; i < 30; i += 1) g.playRound(randomMove());
      ok(g.recent.length === 8, '近期战绩保留 8 条（实际 ' + g.recent.length + '）');
    }

    // ⑥ 战绩存档往返一致
    {
      const backup = JSON.parse(JSON.stringify(Profile.data));
      Profile.data.wins = 12; Profile.data.loses = 7; Profile.data.draws = 3;
      Profile.data.bestEver = 5;
      Profile.save();
      const reread = new RpsGame();
      Profile.data = Object.assign({}, DEFAULT_PROFILE);
      Profile.load();
      const same = Profile.data.wins === 12 && Profile.data.loses === 7 &&
                   Profile.data.draws === 3 && Profile.data.bestEver === 5;
      ok(same && reread !== null, '生涯战绩写入 / 读回一致');
      Profile.data = backup;
      Profile.save();
    }

    lines.unshift('==== 自测开始 SELF TEST (' + rounds + ' rounds) ====');
    lines.push('==== 自测结束 SELF TEST DONE: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAIL') + ' ====');
    return { text: lines.join('\n'), fail };
  }

  // ---- 导出 -------------------------------------------------------------
  global.RpsCore = {
    MOVE, MOVE_INFO, OUTCOME, COUNTER_OF,
    K_RECENT_KEEP, K_MEMORY_KEEP, STORE_KEY,
    isMove, judge, counterOf, randomMove, outcomeText,
    RpsGame, Profile, selfTest,
  };
}(window));
