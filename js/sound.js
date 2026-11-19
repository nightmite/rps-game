/* =========================================================================
 * sound.js —— 音效（WebAudio 实时合成，不需要任何音频文件）
 * -------------------------------------------------------------------------
 * 好处：仓库里没有 .mp3 / .wav，GitHub Pages 传上去体积小、没有版权问题；
 *      音量、音高都能用代码调，和动画节奏完全同步。
 * 注意：浏览器要求"用户点过页面之后才能出声"，所以第一次点击时才创建 AudioContext。
 * ========================================================================= */
(function (global) {
  'use strict';

  const Sound = {
    ctx: null,
    master: null,
    enabled: true,

    /** 懒创建音频上下文（第一次用户操作时调用） */
    ensure() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;                     // 老浏览器直接静默降级
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    setEnabled(on) {
      this.enabled = !!on;
      if (!on && this.ctx) this.ctx.suspend();
      if (on) this.ensure();
    },

    /** 一个音符：freq 起始频率，slideTo 结束频率（做"咻"的滑音） */
    tone(opt) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime + (opt.delay || 0);
      const dur = opt.dur || 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(opt.freq, t0);
      if (opt.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, opt.slideTo), t0 + dur);
      }
      const peak = opt.gain == null ? 0.09 : opt.gain;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    /** 白噪声（做"沙"的翻牌 / 掌声感） */
    noise(opt) {
      const ctx = this.ensure();
      if (!ctx) return;
      const dur = opt.dur || 0.2;
      const t0 = ctx.currentTime + (opt.delay || 0);
      const frames = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(opt.from || 1200, t0);
      filter.frequency.exponentialRampToValueAtTime(opt.to || 400, t0 + dur);
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = opt.gain == null ? 0.14 : opt.gain;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
    },

    /** 对外只暴露 play('名字') */
    play(name) {
      if (!this.enabled) return;
      switch (name) {
        case 'tap':       // 按钮点击
          this.tone({ freq: 640, slideTo: 880, dur: 0.07, type: 'triangle', gain: 0.06 });
          break;
        case 'count':     // 倒数字
          this.tone({ freq: 520, slideTo: 520, dur: 0.06, type: 'square', gain: 0.045 });
          break;
        case 'reveal':    // 翻牌
          this.noise({ dur: 0.16, from: 2400, to: 500, gain: 0.10 });
          this.tone({ freq: 300, slideTo: 520, dur: 0.12, type: 'sine', gain: 0.05 });
          break;
        case 'win':       // 赢一回合
          [523, 659, 784].forEach((f, i) => {
            this.tone({ freq: f, dur: 0.13, type: 'triangle', gain: 0.07, delay: i * 0.07 });
          });
          break;
        case 'lose':      // 输一回合
          [392, 330, 262].forEach((f, i) => {
            this.tone({ freq: f, dur: 0.16, type: 'sawtooth', gain: 0.045, delay: i * 0.08 });
          });
          break;
        case 'draw':      // 平局
          this.tone({ freq: 440, dur: 0.1, type: 'sine', gain: 0.05 });
          this.tone({ freq: 440, dur: 0.1, type: 'sine', gain: 0.05, delay: 0.11 });
          break;
        case 'streak':    // 连胜加成
          [660, 880, 1100].forEach((f, i) => {
            this.tone({ freq: f, dur: 0.1, type: 'sine', gain: 0.05, delay: i * 0.05 });
          });
          break;
        case 'fanfare':   // 赢下整局
          [523, 659, 784, 1046].forEach((f, i) => {
            this.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.08, delay: i * 0.11 });
          });
          break;
        case 'sad':       // 输掉整局
          [392, 349, 294, 262].forEach((f, i) => {
            this.tone({ freq: f, dur: 0.24, type: 'sawtooth', gain: 0.05, delay: i * 0.13 });
          });
          break;
        default:
          break;
      }
    },
  };

  global.RpsSound = Sound;
}(window));
