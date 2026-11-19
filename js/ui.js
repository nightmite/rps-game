/* =========================================================================
 * ui.js —— 界面层：把 game.js 的规则变成"点了就有反应"的动画和交互
 * -------------------------------------------------------------------------
 * 一回合的节奏（总共约 1.5 秒，这就是"丝滑"的来源）：
 *   点击 → 玩家卡立刻翻牌(340ms) → 屏幕中央"石头…剪刀…布！"(3×230ms)
 *   → 电脑卡抖动 → 电脑翻牌(340ms) → 结果文字弹出 + 音效 + 特效
 * 结算放在动画之后，所以比分不会提前跳。
 * ========================================================================= */
(function (global) {
  'use strict';

  const Core = global.RpsCore;
  const AI = global.RpsAI;
  const Sound = global.RpsSound;
  const { MOVE_INFO, OUTCOME } = Core;

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const HAND_HREF = { 1: '#hand-rock', 2: '#hand-scissors', 3: '#hand-paper' };
  const HAND_EMOJI = { 1: '✊', 2: '✌️', 3: '✋' };

  // ---------------------------------------------------------------- DOM
  const el = {};
  function cacheDom() {
    [
      'scoreYou', 'scoreCpu', 'streak', 'streakNum', 'streakDots', 'bestStreak',
      'cardYou', 'cardCpu', 'handYou', 'handCpu', 'moveYou', 'moveCpu',
      'clash', 'result', 'choices', 'histChips', 'histBars',
      'cWins', 'cLoses', 'cDraws', 'cRate', 'cBest', 'btnReset',
      'diff', 'diffPill', 'btnMode', 'modeText', 'btnSound', 'soundIcon', 'btnRules',
      'countdownOverlay', 'countWord', 'fx',
      'modalRules', 'modalSummary', 'btnAgain',
      'sumEmoji', 'sumTitle', 'sumYou', 'sumCpu', 'sumRounds', 'sumDraws', 'sumStreak',
      'modalStats', 'btnShowStats', 'btnStatsReset',
      'stWins', 'stLoses', 'stDraws', 'stRate', 'stBest', 'stRounds', 'stList',
    ].forEach((id) => { el[id] = $(id); });
    el.resultMain = el.result.querySelector('.result-main');
    el.resultSub = el.result.querySelector('.result-sub');
    el.choiceBtns = Array.from(document.querySelectorAll('.choice'));
    el.diffBtns = Array.from(el.diff.querySelectorAll('button'));
  }

  // -------------------------------------------------------------- 状态
  let game = null;
  let busy = false;          // 动画进行中，禁止重复点击
  let pendingNewMatch = false;   // 从结算页进战绩面板：关掉面板后要开新的一局

  // -------------------------------------------------- 礼花 / 特效画布
  const FX = {
    ctx: null, parts: [], raf: 0, dpr: 1,

    init() {
      this.canvas = el.fx;
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      global.addEventListener('resize', () => this.resize());
    },

    resize() {
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(global.innerWidth * this.dpr);
      this.canvas.height = Math.floor(global.innerHeight * this.dpr);
      this.canvas.style.width = global.innerWidth + 'px';
      this.canvas.style.height = global.innerHeight + 'px';
    },

    burst(cx, cy, count, opt) {
      opt = opt || {};
      const colors = opt.colors || ['#FF9CB8', '#7FC8F8', '#FFD166', '#7BE0AD', '#C4A1FF'];
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = (opt.speed || 7) * (0.45 + Math.random());
        this.parts.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: 4 + Math.random() * 7,
          color: colors[i % colors.length],
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 0.3,
          life: 1,
          shape: Math.random() < 0.3 ? 'rect' : 'circle',
        });
      }
      this.start();
    },

    start() {
      if (this.raf) return;
      const step = () => {
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);
        const alive = [];
        this.parts.forEach((p) => {
          p.vy += 0.22;          // 重力
          p.vx *= 0.995;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vrot;
          p.life -= 0.008;
          if (p.life > 0 && p.y < global.innerHeight + 40) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            if (p.shape === 'rect') {
              ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            alive.push(p);
          }
        });
        this.parts = alive;
        if (this.parts.length === 0) {
          this.raf = 0;
          ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);
          return;
        }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
  };

  // -------------------------------------------------------------- 渲染
  function animateNumber(node, to, dur) {
    const from = parseInt(node.textContent, 10) || 0;
    if (from === to) return;
    const t0 = performance.now();
    const span = dur || 380;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / span);
      const eased = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderScores(animate) {
    if (animate) {
      animateNumber(el.scoreYou, game.playerScore);
      animateNumber(el.scoreCpu, game.cpuScore);
    } else {
      el.scoreYou.textContent = game.playerScore;
      el.scoreCpu.textContent = game.cpuScore;
    }
  }

  function renderStreak() {
    const n = game.streak;
    el.streakNum.textContent = n;
    el.bestStreak.textContent = game.bestStreak;
    el.streak.classList.toggle('hot', n >= 2);
    el.streakDots.innerHTML = '';
    for (let i = 0; i < 5; i += 1) {
      const dot = document.createElement('i');
      if (i < Math.min(n, 5)) dot.className = 'on';
      el.streakDots.appendChild(dot);
    }
  }

  function renderHistory() {
    const list = game.recent.slice().reverse();     // 最新的排前面
    el.histChips.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'chip empty';
      empty.textContent = '还没开始';
      el.histChips.appendChild(empty);
    } else {
      list.forEach((rec) => {
        const chip = document.createElement('span');
        chip.className = 'chip ' + Core.outcomeText(rec.outcome).cls;
        chip.innerHTML = '<b>' + HAND_EMOJI[rec.player] + '</b><i>vs</i><b>' + HAND_EMOJI[rec.cpu] + '</b>';
        chip.title = '第 ' + rec.round + ' 回合：你出' + MOVE_INFO[rec.player].cn +
          '，电脑出' + MOVE_INFO[rec.cpu].cn;
        el.histChips.appendChild(chip);
      });
    }

    // 趋势条：8 格，左旧右新
    el.histBars.innerHTML = '';
    const chrono = game.recent.slice();
    for (let i = 0; i < Core.K_RECENT_KEEP; i += 1) {
      const bar = document.createElement('i');
      const rec = chrono[chrono.length - Core.K_RECENT_KEEP + i];
      if (rec) bar.className = Core.outcomeText(rec.outcome).cls;
      el.histBars.appendChild(bar);
    }
  }

  function renderCareer() {
    const d = Core.Profile.data;
    el.cWins.textContent = d.wins;
    el.cLoses.textContent = d.loses;
    el.cDraws.textContent = d.draws;
    el.cRate.textContent = Core.Profile.winRate().toFixed(1) + '%';
    el.cBest.textContent = d.bestEver;
  }

  // ---------------------------------------------------------- 战绩面板
  // 结算页点「看看战绩」时更新并打开；数据全部来自存档 + 本局最近回合
  function renderStats() {
    const d = Core.Profile.data;
    el.stWins.textContent = d.wins;
    el.stLoses.textContent = d.loses;
    el.stDraws.textContent = d.draws;
    el.stRate.textContent = Core.Profile.winRate().toFixed(1) + '%';
    el.stBest.textContent = d.bestEver;
    el.stRounds.textContent = Core.Profile.total();

    const list = game.recent.slice().reverse();     // 最新的一手排最前面
    el.stList.innerHTML = '';
    if (list.length === 0) {
      const li = document.createElement('li');
      li.className = 'stats-empty';
      li.textContent = '这一局还没有出过手';
      el.stList.appendChild(li);
      return;
    }
    list.forEach((rec) => {
      const info = Core.outcomeText(rec.outcome);
      const li = document.createElement('li');
      li.className = info.cls;
      li.innerHTML =
        '<span class="r">#' + rec.round + '</span>' +
        '<span class="you">你 ' + MOVE_INFO[rec.player].cn + '</span>' +
        '<span class="cpu">电脑 ' + MOVE_INFO[rec.cpu].cn + '</span>' +
        '<b class="res">' + (rec.outcome === OUTCOME.WIN ? '胜' :
          (rec.outcome === OUTCOME.LOSE ? '负' : '平')) + '</b>';
      el.stList.appendChild(li);
    });
  }

  function openStats() {
    renderStats();
    openModal(el.modalStats);
    Sound.play('tap');
  }

  function closeStats() {
    closeModal(el.modalStats);
    if (pendingNewMatch) {
      pendingNewMatch = false;
      newMatch(false);
    }
  }

  function renderSettings() {
    el.diffBtns.forEach((b) => b.classList.toggle('on', b.dataset.diff === game.difficulty));
    moveDiffPill(false);
    el.modeText.textContent = game.endless ? '无限练习' : ('先赢 ' + game.targetWins + ' 局');
    el.soundIcon.textContent = Core.Profile.data.sound ? '🔊' : '🔇';
  }

  function moveDiffPill(animate) {
    const active = el.diffBtns.find((b) => b.dataset.diff === game.difficulty) || el.diffBtns[1];
    if (!active) return;
    if (!animate) el.diffPill.style.transition = 'none';
    el.diffPill.style.width = active.offsetWidth + 'px';
    el.diffPill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    if (!animate) {
      void el.diffPill.offsetWidth;
      el.diffPill.style.transition = '';
    }
  }

  // --------------------------------------------------------- 卡片与结果
  function setHand(side, move) {
    const node = side === 'you' ? el.handYou : el.handCpu;
    node.setAttribute('href', HAND_HREF[move]);
  }

  function resetCards() {
    [el.cardYou, el.cardCpu].forEach((c) => {
      c.classList.add('no-anim');
      c.classList.remove('revealed', 'win-glow', 'lose-glow');
    });
    el.moveYou.textContent = '—';
    el.moveCpu.textContent = '—';
    el.slotYouMoveCls = null;
    void document.body.offsetWidth;
    requestAnimationFrame(() => {
      [el.cardYou, el.cardCpu].forEach((c) => c.classList.remove('no-anim'));
    });
  }

  function revealCard(side) {
    const card = side === 'you' ? el.cardYou : el.cardCpu;
    card.classList.add('revealed');
  }

  function setResult(main, sub, cls) {
    el.resultMain.textContent = main;
    el.resultSub.textContent = sub || '';
    el.result.className = 'result pop ' + (cls || '');
    void el.result.offsetWidth;
    el.result.classList.add('pop');
  }

  async function countdown() {
    const words = ['石头', '剪刀', '布'];
    el.countdownOverlay.classList.add('show');
    for (let i = 0; i < words.length; i += 1) {
      el.countWord.textContent = words[i];
      el.countWord.classList.remove('pop');
      void el.countWord.offsetWidth;
      el.countWord.classList.add('pop');
      Sound.play('count');
      await sleep(230);
    }
    el.countWord.textContent = '出拳！';
    el.countWord.classList.remove('pop');
    void el.countWord.offsetWidth;
    el.countWord.classList.add('pop');
    await sleep(180);
    el.countdownOverlay.classList.remove('show');
  }

  // ------------------------------------------------------------ 一回合
  async function playMatch(move) {
    if (busy) return;
    busy = true;
    Sound.ensure();

    resetCards();
    setHand('you', move);
    el.moveYou.textContent = MOVE_INFO[move].cn;
    Sound.play('tap');
    await sleep(60);
    revealCard('you');                       // ① 玩家卡先翻：点了立刻有反应

    await sleep(200);
    el.clash.textContent = '';
    await countdown();                       // ② 石头…剪刀…布！

    el.cardCpu.classList.add('shaking');     // ③ 电脑卡抖动
    await sleep(420);
    el.cardCpu.classList.remove('shaking');

    const rec = game.playRound(move);        // ④ 这时才真正结算
    setHand('cpu', rec.cpu);
    el.moveCpu.textContent = MOVE_INFO[rec.cpu].cn;
    revealCard('cpu');
    Sound.play('reveal');
    await sleep(300);

    showOutcome(rec);                        // ⑤ 结果 + 特效 + 音效
    renderScores(true);
    renderStreak();
    renderHistory();
    renderCareer();

    if (game.isMatchOver()) {
      await sleep(880);
      showSummary();
    } else {
      busy = false;
    }
  }

  function showOutcome(rec) {
    const t = Core.outcomeText(rec.outcome);
    const detail = '你出' + MOVE_INFO[rec.player].cn + '，电脑出' + MOVE_INFO[rec.cpu].cn + '。';
    setResult(t.cn, detail + game.advice(), t.cls);

    // 赢的那张卡亮绿边、输的那张亮红边，一眼看出谁赢
    const win = rec.outcome === OUTCOME.WIN;
    const lose = rec.outcome === OUTCOME.LOSE;
    el.cardYou.classList.toggle('win-glow', win);
    el.cardYou.classList.toggle('lose-glow', lose);
    el.cardCpu.classList.toggle('win-glow', lose);
    el.cardCpu.classList.toggle('lose-glow', win);

    if (rec.outcome === OUTCOME.WIN) {
      Sound.play('win');
      if (game.streak >= 2) Sound.play('streak');
      const rect = el.cardYou.getBoundingClientRect();
      FX.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 26, { speed: 6 });
      if (game.streak >= 2) {
        FX.burst(global.innerWidth / 2, 90, 34, { speed: 8 });
      }
    } else if (rec.outcome === OUTCOME.LOSE) {
      Sound.play('lose');
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 420);
    } else {
      Sound.play('draw');
    }
  }

  // -------------------------------------------------------------- 结算
  function showSummary() {
    const won = game.playerWon();
    const draw = game.playerScore === game.cpuScore;
    el.sumEmoji.textContent = draw ? '🤝' : (won ? '🎉' : '😵');
    el.sumTitle.textContent = draw ? '打平了！' : (won ? '你赢了！' : '电脑赢了…');
    el.sumTitle.className = won ? 'win' : (draw ? 'draw' : 'lose');
    el.sumYou.textContent = game.playerScore;
    el.sumCpu.textContent = game.cpuScore;
    el.sumRounds.textContent = game.round;
    el.sumDraws.textContent = game.draws;
    el.sumStreak.textContent = game.bestStreak;

    Core.Profile.addMatch(game);
    renderCareer();

    openModal(el.modalSummary);
    if (won) {
      Sound.play('fanfare');
      FX.burst(global.innerWidth / 2, global.innerHeight / 2, 90, { speed: 11 });
      setTimeout(() => FX.burst(global.innerWidth * 0.3, 160, 50, { speed: 9 }), 220);
      setTimeout(() => FX.burst(global.innerWidth * 0.7, 160, 50, { speed: 9 }), 380);
    } else if (!draw) {
      Sound.play('sad');
    }
  }

  function openModal(node) {
    node.classList.add('show');
    node.setAttribute('aria-hidden', 'false');
  }

  function closeModal(node) {
    node.classList.remove('show');
    node.setAttribute('aria-hidden', 'true');
  }

  function closeAllModals() {
    if (el.modalStats.classList.contains('show')) {
      closeStats();
      return;
    }
    closeModal(el.modalRules);
    closeModal(el.modalSummary);
  }

  // ------------------------------------------------------------ 新一局
  function newMatch(keepBusy) {
    game.reset();
    resetCards();
    el.clash.textContent = '准备好了吗？';
    setResult('准备开始', '选一个手势出拳吧', '');
    renderScores(false);
    renderStreak();
    renderHistory();
    if (!keepBusy) busy = false;
  }

  function restartMatch() {
    closeModal(el.modalSummary);
    newMatch(false);
  }

  // -------------------------------------------------------------- 事件
  function bindEvents() {
    el.choiceBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const move = parseInt(btn.dataset.move, 10);
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 260);
        playMatch(move);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
        if (!el.modalSummary.classList.contains('show')) busy = false;
        return;
      }
      // 弹层开着的时候不响应出拳键，避免在结算弹层背后偷偷打一局
      const modalOpen = el.modalRules.classList.contains('show')
                     || el.modalSummary.classList.contains('show')
                     || el.modalStats.classList.contains('show');
      if (modalOpen) return;

      if (e.key === '1' || e.key === '2' || e.key === '3') {
        playMatch(parseInt(e.key, 10));
        const btn = el.choiceBtns.find((b) => b.dataset.move === e.key);
        if (btn) {
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 260);
        }
      } else if (e.key === 'Escape') {
        closeAllModals();
        if (el.modalSummary.classList.contains('show') === false) busy = false;
      }
    });

    el.diffBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        game.difficulty = btn.dataset.diff;
        Core.Profile.data.difficulty = game.difficulty;
        Core.Profile.save();
        renderSettings();
        Sound.play('tap');
        setResult('切换难度：' + AI.LEVELS[game.difficulty].label,
          AI.LEVELS[game.difficulty].tip + '（' + AI.LEVELS[game.difficulty].smart + '% 反制）', '');
      });
    });

    el.btnMode.addEventListener('click', () => {
      game.endless = !game.endless;
      Core.Profile.data.endless = game.endless;
      Core.Profile.save();
      renderSettings();
      Sound.play('tap');
      newMatch(false);
      setResult(game.endless ? '无限练习模式' : '先赢 3 局模式',
        game.endless ? '不设上限，随便练手' : '先拿到 3 分者胜', '');
    });

    el.btnSound.addEventListener('click', () => {
      const on = !Core.Profile.data.sound;
      Core.Profile.data.sound = on;
      Core.Profile.save();
      Sound.setEnabled(on);
      renderSettings();
      if (on) Sound.play('tap');
    });

    el.btnRules.addEventListener('click', () => { openModal(el.modalRules); Sound.play('tap'); });

    el.btnReset.addEventListener('click', () => {
      if (global.confirm('确定要清空生涯战绩吗？（不影响难度和音效设置）')) {
        Core.Profile.reset();
        renderCareer();
        Sound.play('tap');
      }
    });

    el.btnAgain.addEventListener('click', restartMatch);

    // 结算页点「看看战绩」：收起结算弹层、直接打开战绩面板（保留本局数据），
    // 等面板关掉之后再自动开新的一局
    el.btnShowStats.addEventListener('click', () => {
      pendingNewMatch = game.isMatchOver();
      closeModal(el.modalSummary);
      openStats();
    });

    el.btnStatsReset.addEventListener('click', () => {
      if (global.confirm('确定要清空生涯战绩吗？（不影响难度和音效设置）')) {
        Core.Profile.reset();
        renderCareer();
        renderStats();
        Sound.play('tap');
      }
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) closeModal(modal);
        if (modal === el.modalStats) {
          closeStats();
        } else if (modal === el.modalSummary) {
          closeModal(el.modalSummary);
          newMatch(false);
        }
      });
    });

    el.modalRules.addEventListener('click', (e) => {
      if (e.target === el.modalRules) closeModal(el.modalRules);
    });

    el.modalStats.addEventListener('click', (e) => {
      if (e.target === el.modalStats) closeStats();
    });

    global.addEventListener('resize', () => moveDiffPill(false));
    // 键盘/鼠标第一次交互后再允许出声，符合浏览器自动播放策略
    global.addEventListener('pointerdown', () => Sound.ensure(), { once: true });
  }

  // -------------------------------------------------------------- 启动
  function init() {
    cacheDom();
    Core.Profile.load();

    game = new Core.RpsGame({
      targetWins: Core.Profile.data.targetWins || 3,
      endless: !!Core.Profile.data.endless,
      difficulty: Core.Profile.data.difficulty || 'normal',
    });

    Sound.setEnabled(Core.Profile.data.sound);
    FX.init();
    renderSettings();
    renderScores(false);
    renderStreak();
    renderHistory();
    renderCareer();
    bindEvents();

    // 启动后稍微等一下再量按钮宽度，保证胶囊位置准确
    setTimeout(() => moveDiffPill(false), 60);

    // 方便在第 3 周写文档 / 老师验收时在控制台自测
    global.RpsDemo = {
      game: () => game,
      play: playMatch,
      selfTest: (n) => {
        const r = Core.selfTest(n);
        console.log(r.text);
        return r;
      },
    };
    console.log('%c石头剪刀布已就绪：控制台输入 RpsDemo.selfTest() 可跑逻辑自测',
      'color:#7FC8F8;font-weight:bold');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
