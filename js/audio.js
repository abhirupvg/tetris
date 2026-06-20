// Audio manager - loads and plays sound effects + background music

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sounds = {};
    this.enabled = true;
    this.volume = 0.5;
    this.bgmVolume = 0.25;
    this.bgmBuffer = null;
    this.bgmSource = null;
    this.bgmGain = null;
    this.bgmPlaying = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  async loadAll(baseUrl = 'assets/sounds') {
    const files = {
      move: `${baseUrl}/move.wav`,
      rotate: `${baseUrl}/rotate.wav`,
      pieceLock: `${baseUrl}/piece_lock.wav`,
      lineClear: `${baseUrl}/line_clear.wav`,
      gameEnd: `${baseUrl}/game_over.wav`,
      levelUp: `${baseUrl}/level_up.wav`,
      hardDrop: `${baseUrl}/hard_drop.wav`,
      hold: `${baseUrl}/hold.wav`,
    };

    for (const [name, url] of Object.entries(files)) {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.sounds[name] = audioBuffer;
      } catch (e) {
        console.warn(`Failed to load sound: ${name}`, e);
      }
    }

    // Load background music
    try {
      const response = await fetch(`${baseUrl}/bgm.mp3`);
      const arrayBuffer = await response.arrayBuffer();
      this.bgmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn('Failed to load background music', e);
    }
  }

  play(name, options = {}) {
    if (!this.enabled || !this.ctx || !this.sounds[name]) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.sounds[name];

    const gain = this.ctx.createGain();
    const vol = (options.volume ?? 1) * this.volume;
    gain.gain.value = vol;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    if (options.fadeOut) {
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + options.fadeOut);
    }

    source.connect(gain);
    gain.connect(this.ctx.destination);

    if (options.rate) {
      source.playbackRate.value = options.rate;
    }

    source.start(0);
    return source;
  }

  startBgm() {
    if (!this.ctx || !this.bgmBuffer || this.bgmPlaying) return;
    this.bgmSource = this.ctx.createBufferSource();
    this.bgmSource.buffer = this.bgmBuffer;
    this.bgmSource.loop = true;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0;
    this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume, this.ctx.currentTime + 2);

    this.bgmSource.connect(this.bgmGain);
    this.bgmGain.connect(this.ctx.destination);
    this.bgmSource.start(0);
    this.bgmPlaying = true;
  }

  stopBgm() {
    if (!this.bgmPlaying || !this.bgmSource) return;
    this.bgmGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
    const source = this.bgmSource;
    setTimeout(() => {
      try { source.stop(); } catch (e) {}
    }, 1100);
    this.bgmPlaying = false;
    this.bgmSource = null;
  }

  playMove() {
    this.play('move', { volume: 0.4 });
  }

  playRotate() {
    this.play('rotate', { volume: 0.5 });
  }

  playLock() {
    this.play('pieceLock', { volume: 0.6 });
  }

  playLineClear(count = 1) {
    this.play('lineClear', { volume: 0.7, rate: 1 + (count - 1) * 0.15 });
  }

  playHardDrop() {
    this.play('hardDrop', { volume: 0.7 });
  }

  playHold() {
    this.play('hold', { volume: 0.5 });
  }

  playGameOver() {
    this.stopBgm();
    this.play('gameEnd', { volume: 0.8 });
  }

  playLevelUp() {
    this.play('levelUp', { volume: 0.7 });
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBgm();
    }
    return this.enabled;
  }
}
