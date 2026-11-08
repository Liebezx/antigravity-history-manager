/**
 * Antigravity History Manager — Web Audio Notification Engine
 * Generates synthetic pleasant chimes and warning signals without external assets.
 */

(function (window) {
  'use strict';

  let audioCtx = null;
  let lastPlayed = null;

  function getAudioContext() {
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  // Auto-resume on user interaction if browser policy suspended it
  function setupAutoResume() {
    const resumeHandler = () => {
      try {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      } catch (_) {}
    };
    ['click', 'keydown', 'pointerdown'].forEach((evt) => {
      window.addEventListener(evt, resumeHandler, { passive: true });
    });
  }

  setupAutoResume();

  const audioManager = {
    /**
     * Soft pleasant ascending two-tone chime (~0.4s)
     * Note 1: E5 (659.25 Hz) -> Note 2: B5 (987.77 Hz)
     */
    playSuccess(volume = 0.8) {
      lastPlayed = 'success';
      const vol = Math.max(0, Math.min(1, Number(volume) || 0.8));
      if (vol <= 0) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(vol * 0.35, now);
        masterGain.connect(ctx.destination);

        // Note 1: E5 (659.25 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now);

        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.exponentialRampToValueAtTime(1.0, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.15, now + 0.16);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc1.connect(gain1);
        gain1.connect(masterGain);

        osc1.start(now);
        osc1.stop(now + 0.23);

        // Note 2: B5 (987.77 Hz) — starts slightly before note 1 fully fades
        const note2Start = now + 0.13;
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(987.77, note2Start);

        gain2.gain.setValueAtTime(0.0001, note2Start);
        gain2.gain.exponentialRampToValueAtTime(1.0, note2Start + 0.02);
        gain2.gain.exponentialRampToValueAtTime(0.3, note2Start + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.0001, note2Start + 0.28);

        osc2.connect(gain2);
        gain2.connect(masterGain);

        osc2.start(note2Start);
        osc2.stop(note2Start + 0.29);
      } catch (err) {
        // Audio error handling: do not throw or crash
      }
    },

    /**
     * Short low warning signal (~0.28s) distinctly different from success
     */
    playError(volume = 0.8) {
      lastPlayed = 'error';
      const vol = Math.max(0, Math.min(1, Number(volume) || 0.8));
      if (vol <= 0) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(vol * 0.4, now);
        masterGain.connect(ctx.destination);

        // Low-pass filter to keep sound mellow and warm
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        filter.connect(masterGain);

        // Oscillator with subtle pitch slide (220 Hz -> 155 Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(155, now + 0.26);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(1.0, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        osc.connect(gain);
        gain.connect(filter);

        osc.start(now);
        osc.stop(now + 0.29);
      } catch (err) {
        // Audio error handling: do not throw or crash
      }
    },

    /**
     * Preview sample for options panel
     */
    playTest(volume = 0.8) {
      this.playSuccess(volume);
    },

    getLastPlayed() {
      return lastPlayed;
    },

    getContextState() {
      return audioCtx ? audioCtx.state : 'uninitialized';
    }
  };

  window.audioManager = audioManager;
})(window);
