import { silenceDuration, soundFile } from './letters.js';

/**
 * Playback for a whole sentence.
 *
 * The Android app pushed one letter at a time into a streaming AudioTrack,
 * which made the position unknowable. Here every item is decoded and the whole
 * sentence is concatenated into a single AudioBuffer, so the playhead is just
 * an offset into that buffer and seeking is exact.
 */
export class OvalEngine {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.decoded = new Map(); // file path -> AudioBuffer
    this.pending = new Map(); // file path -> Promise<AudioBuffer>
    this.timeline = null; // { buffer, segments, duration }
    this.source = null;
    this.previewSource = null;
    this.startedAt = 0;
    this.startOffset = 0;
    this.pausedAt = 0;
    this.playing = false;
    this.onEnded = null;
  }

  /**
   * The context, created suspended if the page has not been interacted with.
   * Decoding and buffer building work fine in that state.
   */
  context() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Start the clock. Only call this from a user gesture: until the page has
   * been interacted with, browsers leave the returned promise pending forever
   * rather than rejecting it, so awaiting it anywhere else deadlocks.
   */
  async resume() {
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  async load(name, speed) {
    const path = soundFile(name, speed);
    const cached = this.decoded.get(path);
    if (cached) return cached;
    const inFlight = this.pending.get(path);
    if (inFlight) return inFlight;

    const task = (async () => {
      const ctx = this.context();
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load ${path}`);
      const bytes = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      this.decoded.set(path, buffer);
      this.pending.delete(path);
      return buffer;
    })();

    this.pending.set(path, task);
    return task;
  }

  /**
   * Decode everything the sentence needs, reporting progress as whole files
   * land so the caller can show a determinate bar.
   */
  async preload(items, speed, onProgress) {
    const names = [...new Set(items.filter((i) => i.kind === 'letter').map((i) => i.name))];
    let done = 0;
    if (onProgress) onProgress(0, names.length);
    await Promise.all(
      names.map(async (name) => {
        await this.load(name, speed);
        done += 1;
        if (onProgress) onProgress(done, names.length);
      })
    );
  }

  /** Warm the cache for a speed in the background; failures are not fatal. */
  prefetch(names, speed) {
    for (const name of names) this.load(name, speed).catch(() => {});
  }

  /**
   * Build the concatenated sentence buffer plus the segment map used for
   * highlighting, tile layout and snap-to-letter seeking.
   */
  async buildTimeline(items, speed, onProgress) {
    await this.preload(items, speed, onProgress);
    const ctx = this.context();
    const rate = ctx.sampleRate;

    const plan = [];
    let frames = 0;
    for (const item of items) {
      let length = 0;
      let buffer = null;
      if (item.kind === 'letter') {
        buffer = this.decoded.get(soundFile(item.name, speed));
        length = buffer ? buffer.length : 0;
      } else if (item.kind === 'silence') {
        length = Math.round(silenceDuration(item, speed) * rate);
      }
      plan.push({ item, buffer, offset: frames, length });
      frames += length;
    }

    const out = ctx.createBuffer(1, Math.max(1, frames), rate);
    const channel = out.getChannelData(0);
    for (const part of plan) {
      if (!part.buffer) continue;
      channel.set(part.buffer.getChannelData(0).subarray(0, part.length), part.offset);
    }

    const segments = plan.map((part, index) => ({
      index,
      kind: part.item.kind,
      char: part.item.char,
      name: part.item.name || null,
      start: part.offset / rate,
      end: (part.offset + part.length) / rate,
      duration: part.length / rate,
      buffer: part.buffer,
    }));

    this.timeline = { buffer: out, segments, duration: frames / rate };
    this.stop();
    return this.timeline;
  }

  get duration() {
    return this.timeline ? this.timeline.duration : 0;
  }

  get segments() {
    return this.timeline ? this.timeline.segments : [];
  }

  position() {
    if (!this.timeline) return 0;
    if (!this.playing) return this.pausedAt;
    const elapsed = this.ctx.currentTime - this.startedAt + this.startOffset;
    return Math.min(this.timeline.duration, Math.max(0, elapsed));
  }

  play(from) {
    if (!this.timeline || this.timeline.duration === 0) return;
    let offset = from == null ? this.pausedAt : from;
    if (offset >= this.timeline.duration - 0.002) offset = 0;
    this.#startSource(offset);
  }

  pause() {
    if (!this.playing) return;
    const at = this.position();
    this.#disposeSource();
    this.pausedAt = at;
  }

  stop() {
    this.#disposeSource();
    this.pausedAt = 0;
  }

  /** Move the playhead, keeping the transport state. */
  seek(time) {
    const clamped = Math.min(this.duration, Math.max(0, time));
    if (this.playing) this.#startSource(clamped);
    else this.pausedAt = clamped;
  }

  /** Sound a single letter, used by the on-screen keyboard. */
  async preview(name, speed) {
    const ctx = await this.resume();
    const buffer = await this.load(name, speed);
    if (this.previewSource) {
      try {
        this.previewSource.stop();
      } catch {
        /* already finished */
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.onended = () => {
      if (this.previewSource === source) this.previewSource = null;
    };
    this.previewSource = source;
    source.start();
  }

  #startSource(offset) {
    this.#disposeSource();
    const source = this.ctx.createBufferSource();
    source.buffer = this.timeline.buffer;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source !== source) return; // superseded by a seek or a stop
      this.source = null;
      this.playing = false;
      this.pausedAt = this.timeline.duration;
      if (this.onEnded) this.onEnded();
    };
    this.source = source;
    this.startedAt = this.ctx.currentTime;
    this.startOffset = offset;
    this.pausedAt = offset;
    this.playing = true;
    source.start(0, offset);
  }

  #disposeSource() {
    if (!this.source) {
      this.playing = false;
      return;
    }
    const source = this.source;
    this.source = null;
    this.playing = false;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source.disconnect();
  }
}
