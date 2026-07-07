/**
 * Ars Nova Synthesis Engine — Formant Vocal Synthesis + Isorhythm
 *
 * The 14th-century French Ars Nova (Philippe de Vitry, Guillaume de Machaut)
 * was SUNG: the isorhythmic motet is polyphony for human voices. This engine
 * therefore voices the faster upper parts (cantus · contratenor · triplum)
 * with source–filter (formant) VOCAL synthesis, and holds them over a slow,
 * sustained INSTRUMENTAL tenor — historically the isorhythmic cantus firmus
 * was very often carried on an instrument while the upper voices were sung.
 *
 *   - VOICE (upper) : source–filter vocal synthesis. A glottal-pulse source
 *                     (a `PeriodicWave` whose harmonics roll off ~1/n^1.1, like
 *                     flow through the vocal folds) is shaped by a bank of four
 *                     parallel resonant formant band-pass filters that give each
 *                     singer a sung Latin vowel (a e i o u). Each upper voice has
 *                     its OWN persistent vocal tract; only the fold pitch changes
 *                     from note to note, exactly as in real singing. Gentle
 *                     per-note detune/jitter and vibrato-on-held-notes give the
 *                     living, haunting choral shimmer.
 *   - TENOR (instr) : a restrained FM tone (a mellow bowed/reed/organ colour) on
 *                     long sustained notes — the grounding cantus firmus.
 *
 * On top of that sits the defining Ars Nova innovation: the ISORHYTHM. A
 * repeating rhythmic pattern (the TALEA — an array of durations) is laid over
 * a repeating pitch series (the COLOR — an array of scale degrees). Because
 * talea.length ≠ color.length, the two cycle out of phase and only realign
 * after LCM(talea, color) iterations. The tenor is driven isorhythmically;
 * the sung upper voices weave above it, all tuned to one of the 8 church modes
 * and washed in a large chapel/hall convolution reverb.
 */

class ArsNovaEngine {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.currentMode = 1;
        this.numVoices = 2;             // Tenor + Cantus by default
        this.tempo = 64;                // tactus (upper-voice) beats per minute
        this.voiceVolume = 0.75;
        this.brightness = 0.55;         // vocal brightness / vowel openness (+ tenor tone)
        this.reverbMix = 0.55;

        this.parts = [];                // active voices (0 = instrumental tenor, rest sung)
        this.stepTimeout = null;
        this.activeNotes = [];

        this.masterGain = null;
        this.voiceBus = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.convolver = null;
        this.analyser = null;
        this.glottalWave = null;

        // Tenor sits low; upper voices are lifted an octave.
        this.basePitch = 146.83;        // D3

        // Isorhythmic tenor is slower than the tactus.
        this.tenorScale = 1.7;

        // === The 8 medieval church modes (pitch collection) ===
        // intervals: cents from the finalis; tenor: reciting-tone scale degree.
        this.modes = {
            1: { name: "Dorian",        intervals: [0,200,300,500,700,900,1000,1200], finalis: 0, tenor: 4, up: 5 },
            2: { name: "Hypodorian",    intervals: [0,200,300,500,700,900,1000,1200], finalis: 0, tenor: 2, up: 4 },
            3: { name: "Phrygian",      intervals: [0,100,300,500,700,800,1000,1200], finalis: 0, tenor: 5, up: 6 },
            4: { name: "Hypophrygian",  intervals: [0,100,300,500,700,800,1000,1200], finalis: 0, tenor: 3, up: 5 },
            5: { name: "Lydian",        intervals: [0,200,400,600,700,900,1100,1200], finalis: 0, tenor: 4, up: 6 },
            6: { name: "Hypolydian",    intervals: [0,200,400,600,700,900,1100,1200], finalis: 0, tenor: 2, up: 4 },
            7: { name: "Mixolydian",    intervals: [0,200,400,500,700,900,1000,1200], finalis: 0, tenor: 4, up: 6 },
            8: { name: "Hypomixolydian",intervals: [0,200,400,500,700,900,1000,1200], finalis: 0, tenor: 3, up: 5 }
        };

        // === Instrumental-tenor FM preset (carrier:modulator ratio + base mod index) ===
        // A mellow bowed/reed/organ colour for the sustained cantus firmus.
        this.tenorPreset = { ratio: 1.0, index: 2.2, wave: 'sine' };

        // === Sung-vowel formant tables (F1..F4 centre frequencies, Hz) ===
        this.vowels = {
            a: [700, 1220, 2600, 3300],
            e: [530, 1840, 2480, 3300],
            i: [270, 2300, 3000, 3400],
            o: [430,  820, 2700, 3300],
            u: [350,  600, 2700, 3300]
        };

        // === Talea / Color pairs (isorhythm) ===
        // talea.length ≠ color.length so they precess; realign after LCM.
        this.taleae = [
            { talea: [3, 2, 2, 1, 2], color: [0, 2, 3, 4, 2, 1, 0] },   // 5 vs 7  → LCM 35
            { talea: [2, 2, 3, 1],    color: [0, 4, 3, 5, 2, 4, 0] }    // 4 vs 7  → LCM 28
        ];
        this.taleaIndex = 0;
        this.taleaPos = 0;
        this.colorPos = 0;
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.ctx.destination);

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;
        this.masterGain.connect(this.analyser);

        await this.createReverb();

        this.voiceBus = this.ctx.createGain();
        this.voiceBus.gain.value = this.voiceVolume;

        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.value = 1 - this.reverbMix * 0.5;

        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = this.reverbMix;

        this.voiceBus.connect(this.dryGain);
        this.voiceBus.connect(this.convolver);
        this.dryGain.connect(this.masterGain);
        this.convolver.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        this.buildGlottalWave();
    }

    /**
     * The glottal source: harmonics rolling off ~ -11 dB/oct (1/n^1.1). Rich
     * enough that the upper formants have partials to resonate — a full,
     * choral tone rather than a thin sine.
     */
    buildGlottalWave() {
        const n = 48;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        for (let k = 1; k < n; k++) imag[k] = 1 / Math.pow(k, 1.1);
        this.glottalWave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }

    /** Large chapel/gothic hall — ~6 s tail with sparse early reflections. */
    async createReverb() {
        const sr = this.ctx.sampleRate;
        const length = Math.floor(sr * 6);
        const impulse = this.ctx.createBuffer(2, length, sr);
        const reflections = [0.013, 0.027, 0.041, 0.059, 0.078, 0.101, 0.129, 0.161, 0.197];
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 0.6) * 0.35 + Math.exp(-t * 0.28) * 0.4 + Math.exp(-t * 0.13) * 0.22;
                data[i] = (Math.random() * 2 - 1) * env;
                if (i < sr * 0.22) {
                    for (const d of reflections) {
                        if (i === Math.floor(d * sr)) data[i] += (Math.random() * 2 - 1) * 0.3;
                    }
                }
            }
        }
        this.convolver = this.ctx.createConvolver();
        this.convolver.buffer = impulse;
    }

    centsToFreq(cents) { return this.basePitch * Math.pow(2, cents / 1200); }

    /** Scale degree (may wrap) + explicit octave → frequency. */
    degToFreq(deg, octave) {
        const m = this.modes[this.currentMode];
        const idx = ((deg % 8) + 8) % 8;
        const oct = Math.floor(deg / 8) + (octave || 0);
        return this.centsToFreq(m.intervals[idx]) * Math.pow(2, oct);
    }

    /** Relative gains of the four formants for the current vocal brightness. */
    formantGains() {
        // Brightness opens the upper formants (F3/F4) — from covered to bright.
        const hi = 0.55 + this.brightness * 0.95;
        return [1.0, 0.5, 0.28 * hi, 0.16 * hi];
    }

    /**
     * Build one ensemble part.
     *
     *  - INSTRUMENTAL TENOR (vocal:false): just a fade-in bus; notes are FM.
     *  - SUNG UPPER VOICE (vocal:true): a persistent vocal tract —
     *        sourceGain → [4 parallel band-pass formants → formant gain] → busGain → voiceBus
     *    Note oscillators (the vocal folds) connect transiently into sourceGain.
     */
    createPart(cfg, index) {
        const now = this.ctx.currentTime;
        const busGain = this.ctx.createGain();
        busGain.gain.setValueAtTime(0, now);
        busGain.gain.linearRampToValueAtTime(cfg.vol, now + 1.2 + index * 0.5);
        busGain.connect(this.voiceBus);

        // Per-part fixed detune so the ensemble is a living, slightly-out choir.
        const detuneCents = (index - 1.5) * 6 + (Math.random() - 0.5) * 4;

        const part = {
            role: cfg.role, vocal: cfg.vocal, octave: cfg.octave, vol: cfg.vol,
            density: cfg.density, busGain, detuneCents,
            mel: this.modes[this.currentMode].tenor    // upper-voice melodic pointer
        };

        if (cfg.vocal) {
            // --- Persistent vocal tract ---
            const sourceGain = this.ctx.createGain();
            sourceGain.gain.value = 1.0;

            const vowels = cfg.vowels;
            const vowel0 = vowels[0];
            const centres = this.vowels[vowel0];
            const relGains = this.formantGains();
            const bandwidths = [80, 90, 120, 150];
            const formants = [];
            for (let f = 0; f < 4; f++) {
                const bp = this.ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = centres[f];
                bp.Q.value = Math.max(1, centres[f] / bandwidths[f]);
                const fg = this.ctx.createGain();
                fg.gain.value = relGains[f];
                sourceGain.connect(bp);
                bp.connect(fg);
                fg.connect(busGain);
                formants.push({ bp, fg, bandwidth: bandwidths[f], rel: [1.0, 0.5, 0.28, 0.16][f] });
            }

            // A touch of raw source bleeds through so the voice stays present.
            const bleed = this.ctx.createGain();
            bleed.gain.value = 0.1;
            sourceGain.connect(bleed);
            bleed.connect(busGain);

            // Two folds per note (a hair of detune) make each singer fuller.
            const detunes = [0, 7];

            part.sourceGain = sourceGain;
            part.formants = formants;
            part.bleed = bleed;
            part.vowels = vowels;
            part.vowel = vowel0;
            part.vowelPos = 0;
            part.detunes = detunes;
        } else {
            part.preset = this.tenorPreset;
        }

        return part;
    }

    setupVoices() {
        this.teardownVoices();
        // Additive layering: 2 = Tenor+Cantus, 3 = +Contratenor, 4 = +Triplum.
        // Index 0 is the sustained INSTRUMENTAL tenor; the rest are SUNG voices,
        // each with its own vowel colour (cantus bright a/e · contratenor o/u ·
        // triplum e/i).
        const layout = [
            { role: 'tenor',   vocal: false, octave: 0, vol: 0.50, density: 0,   vowels: null        },
            { role: 'cantus',  vocal: true,  octave: 1, vol: 0.34, density: 2.2, vowels: ['a','e']   },
            { role: 'contra',  vocal: true,  octave: 0, vol: 0.32, density: 1.4, vowels: ['o','u']   },
            { role: 'triplum', vocal: true,  octave: 1, vol: 0.26, density: 3.0, vowels: ['e','i']   }
        ];
        for (let i = 0; i < this.numVoices; i++) {
            this.parts.push(this.createPart(layout[i], i));
        }
    }

    teardownVoices() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        for (const part of this.parts) {
            try {
                part.busGain.gain.cancelScheduledValues(now);
                part.busGain.gain.setValueAtTime(part.busGain.gain.value, now);
                part.busGain.gain.linearRampToValueAtTime(0, now + 1.6);
            } catch (e) {}
        }
        this.parts = [];
    }

    /** Ramp a sung voice's formant bank toward a new vowel (tract transition). */
    setVowel(part, vowel) {
        const target = this.vowels[vowel];
        if (!target || !part.formants) return;
        const now = this.ctx.currentTime;
        part.formants.forEach((fm, f) => {
            fm.bp.frequency.cancelScheduledValues(now);
            fm.bp.frequency.setValueAtTime(fm.bp.frequency.value, now);
            fm.bp.frequency.linearRampToValueAtTime(target[f], now + 0.12);
            fm.bp.Q.setValueAtTime(Math.max(1, target[f] / fm.bandwidth), now + 0.12);
        });
        part.vowel = vowel;
    }

    // === The isorhythmic engine ===

    start() {
        this.isPlaying = true;
        this.taleaPos = 0;
        this.colorPos = 0;
        this.scheduleTenorNote();
    }

    stop() {
        this.isPlaying = false;
        if (this.stepTimeout) { clearTimeout(this.stepTimeout); this.stepTimeout = null; }
        const now = this.ctx ? this.ctx.currentTime : 0;
        for (const n of this.activeNotes) {
            try {
                n.amp.gain.cancelScheduledValues(now);
                n.amp.gain.setValueAtTime(n.amp.gain.value, now);
                n.amp.gain.linearRampToValueAtTime(0, now + 0.9);
                setTimeout(() => { try { n.oscs.forEach(o => o.stop()); } catch (e) {} }, 1100);
            } catch (e) {}
        }
        this.activeNotes = [];
        this.teardownVoices();
    }

    /**
     * One tenor talea-step. The tenor takes its duration from the talea and its
     * pitch from the color; the two arrays advance independently and precess.
     * The faster sung upper voices are then woven across the same span.
     */
    scheduleTenorNote() {
        if (!this.isPlaying || !this.parts.length) return;
        const pair = this.taleae[this.taleaIndex];
        const talea = pair.talea;
        const color = pair.color;
        const beat = 60 / this.tempo;

        const durBeats = talea[this.taleaPos];
        const tenorDur = durBeats * beat * this.tenorScale;
        const tenorDeg = color[this.colorPos];

        const tenor = this.parts[0];
        if (tenor && tenor.role === 'tenor') {
            const freq = this.degToFreq(tenorDeg, tenor.octave);
            this.playTenorNote(tenor, freq, tenorDur * 0.96, 0);
        }

        // Upper voices: subdivide the tenor span into faster, stepwise sung figures.
        for (let v = 1; v < this.parts.length; v++) {
            const part = this.parts[v];
            const count = Math.max(2, Math.round(durBeats * part.density));
            const sub = tenorDur / count;
            for (let i = 0; i < count; i++) {
                // Random walk mostly by step, kept within a modal range.
                const step = Math.round((Math.random() - 0.5) * 3.2);
                part.mel += step;
                if (part.mel > 9) part.mel -= 3;
                if (part.mel < 1) part.mel += 3;
                const freq = this.degToFreq(part.mel, part.octave);
                // Advance the sung vowel per note — a little text-like motion.
                part.vowelPos = (part.vowelPos + 1) % part.vowels.length;
                const vowel = part.vowels[part.vowelPos];
                const prevFreq = i > 0 ? part._lastFreq : null;
                this.playVoiceNote(part, freq, sub * 0.94, i * sub, vowel, prevFreq);
                part._lastFreq = freq;
            }
        }

        // Advance talea and color independently — the heart of isorhythm.
        this.taleaPos = (this.taleaPos + 1) % talea.length;
        this.colorPos++;
        if (this.colorPos >= color.length) {
            this.colorPos = 0;
            // On each full color, switch talea/color pair for long-form variety.
            this.taleaIndex = (this.taleaIndex + 1) % this.taleae.length;
            this.taleaPos = this.taleaPos % this.taleae[this.taleaIndex].talea.length;
        }

        this.stepTimeout = setTimeout(() => this.scheduleTenorNote(), tenorDur * 1000);
    }

    /**
     * Sing one note on an upper voice: glottal-pulse fold oscillator(s) through a
     * per-note amplitude envelope into the singer's persistent formant tract
     * (part.sourceGain). Held notes bloom with gentle vibrato; stepwise notes
     * glide legato from the previous pitch.
     */
    playVoiceNote(part, freq, duration, delay, vowel, slideFrom) {
        if (!isFinite(freq) || freq <= 0 || !isFinite(duration) || duration <= 0) return;
        const t0 = this.ctx.currentTime + (delay || 0);

        if (vowel) this.setVowel(part, vowel);

        const amp = this.ctx.createGain();
        const attack = Math.min(0.09, duration * 0.4);
        const release = Math.max(0.18, duration * 0.55);
        const peak = 0.7;
        amp.gain.setValueAtTime(0.0001, t0);
        amp.gain.linearRampToValueAtTime(peak, t0 + attack);
        amp.gain.setValueAtTime(peak * 0.92, t0 + Math.max(attack, duration * 0.6));
        amp.gain.exponentialRampToValueAtTime(0.0008, t0 + duration + release);
        amp.connect(part.sourceGain);

        const oscs = [];
        part.detunes.forEach((cents, di) => {
            const osc = this.ctx.createOscillator();
            osc.setPeriodicWave(this.glottalWave);
            osc.detune.value = part.detuneCents + cents + (Math.random() - 0.5) * 6;   // human jitter
            if (slideFrom && isFinite(slideFrom)) {
                osc.frequency.setValueAtTime(slideFrom, t0);
                osc.frequency.exponentialRampToValueAtTime(freq, t0 + Math.min(0.12, duration * 0.4));
            } else {
                osc.frequency.setValueAtTime(freq, t0);
            }
            const copyGain = this.ctx.createGain();
            copyGain.gain.value = di === 0 ? 1.0 : 0.55;
            osc.connect(copyGain);
            copyGain.connect(amp);
            osc.start(t0);
            osc.stop(t0 + duration + release + 0.1);
            oscs.push(osc);
        });

        // Gentle vibrato blooms on longer, held notes (choral, not operatic).
        if (duration > 0.5) {
            const vib = this.ctx.createOscillator();
            vib.type = 'sine';
            vib.frequency.value = 4.8 + Math.random() * 1.0;
            const vibDepth = this.ctx.createGain();
            vibDepth.gain.value = freq * 0.006;
            vib.connect(vibDepth);
            oscs.forEach(o => vibDepth.connect(o.frequency));
            vib.start(t0 + attack); vib.stop(t0 + duration + release);
        }

        const node = { oscs, amp };
        this.activeNotes.push(node);
        setTimeout(() => {
            const idx = this.activeNotes.indexOf(node);
            if (idx > -1) this.activeNotes.splice(idx, 1);
        }, ((delay || 0) + duration + release + 0.3) * 1000);
    }

    /**
     * The sustained INSTRUMENTAL tenor: a mellow FM carrier + modulator pair with
     * an enveloped modulation index, amplitude ADSR, and gentle vibrato — a
     * bowed/reed/organ colour grounding the sung polyphony above.
     */
    playTenorNote(part, freq, duration, delay) {
        if (!isFinite(freq) || freq <= 0 || !isFinite(duration) || duration <= 0) return;
        const t0 = this.ctx.currentTime + (delay || 0);
        const p = part.preset;
        const detune = part.detuneCents + (Math.random() - 0.5) * 4;

        // --- Carrier ---
        const carrier = this.ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = freq;
        carrier.detune.value = detune;

        // --- Modulator ---
        const modFreq = freq * p.ratio;
        const mod = this.ctx.createOscillator();
        mod.type = p.wave;
        mod.frequency.value = modFreq;
        mod.detune.value = detune;

        // --- Modulation-index envelope (peak deviation, Hz), brightness-scaled ---
        const bright = 0.5 + this.brightness * 0.9;
        const peakDev = p.index * modFreq * bright;
        const modGain = this.ctx.createGain();
        const atk = Math.min(0.06, duration * 0.2);
        const dec = Math.min(0.4, duration * 0.5);
        modGain.gain.setValueAtTime(Math.max(1, peakDev * 0.4), t0);
        modGain.gain.linearRampToValueAtTime(peakDev * 1.3, t0 + atk);            // soft bowed swell
        modGain.gain.exponentialRampToValueAtTime(Math.max(1, peakDev * 0.6), t0 + atk + dec);
        modGain.gain.exponentialRampToValueAtTime(Math.max(1, peakDev * 0.4), t0 + duration);
        mod.connect(modGain);
        modGain.connect(carrier.frequency);

        // --- Amplitude ADSR (slow, sustained) ---
        const amp = this.ctx.createGain();
        const a = Math.min(0.18, duration * 0.25);
        const r = Math.max(0.3, duration * 0.4);
        amp.gain.setValueAtTime(0, t0);
        amp.gain.linearRampToValueAtTime(0.85, t0 + a);
        amp.gain.setValueAtTime(0.78, t0 + Math.max(a, duration * 0.6));
        amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration + r);
        carrier.connect(amp);
        amp.connect(part.busGain);

        // --- Slow vibrato on the long held tenor ---
        if (duration > 0.6) {
            const vib = this.ctx.createOscillator();
            vib.type = 'sine';
            vib.frequency.value = 4.4 + Math.random() * 0.8;
            const vibDepth = this.ctx.createGain();
            vibDepth.gain.value = freq * 0.004;
            vib.connect(vibDepth); vibDepth.connect(carrier.frequency);
            vib.start(t0 + a); vib.stop(t0 + duration + r);
        }

        carrier.start(t0); mod.start(t0);
        const stopAt = t0 + duration + r + 0.1;
        carrier.stop(stopAt); mod.stop(stopAt);

        const node = { oscs: [carrier, mod], amp };
        this.activeNotes.push(node);
        setTimeout(() => {
            const idx = this.activeNotes.indexOf(node);
            if (idx > -1) this.activeNotes.splice(idx, 1);
        }, ((delay || 0) + duration + r + 0.2) * 1000);
    }

    // === Public transport / control ===

    async begin() {
        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.setupVoices();
        setTimeout(() => { if (!this.isPlaying) this.start(); }, 1300);
    }

    end() { this.stop(); }

    setMode(mode) {
        this.currentMode = mode;
        for (const part of this.parts) part.mel = this.modes[mode].tenor;
    }

    setVoices(count) {
        this.numVoices = count;
        if (this.parts.length) { this.setupVoices(); }
    }

    setVoiceVolume(v) {
        this.voiceVolume = v;
        if (this.voiceBus) this.voiceBus.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.2);
    }

    /**
     * Brightness / Timbre → vocal-formant openness (F3/F4 gain) for the sung
     * voices, and the instrumental tenor's FM colour. Same method name the UI
     * already calls; only the meaning is now "vocal brightness / vowel openness".
     */
    setBrightness(v) {
        this.brightness = v;
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const rel = this.formantGains();
        for (const part of this.parts) {
            if (!part.vocal || !part.formants) continue;
            part.formants.forEach((fm, f) => {
                fm.fg.gain.linearRampToValueAtTime(rel[f], now + 0.2);
            });
        }
    }

    setReverbMix(v) {
        this.reverbMix = v;
        if (this.reverbGain && this.dryGain) {
            const now = this.ctx.currentTime;
            this.reverbGain.gain.linearRampToValueAtTime(v, now + 0.2);
            this.dryGain.gain.linearRampToValueAtTime(1 - v * 0.5, now + 0.2);
        }
    }

    setTempo(bpm) { this.tempo = bpm; }

    getAnalyserData() {
        if (!this.analyser) return null;
        const d = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(d);
        return d;
    }
    getFrequencyData() {
        if (!this.analyser) return null;
        const d = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(d);
        return d;
    }
}
