/**
 * Ars Nova Synthesis Engine — FM (Frequency-Modulation) + Isorhythm
 *
 * The 14th-century French Ars Nova (Philippe de Vitry, Guillaume de Machaut)
 * is voiced here with true FM synthesis rather than pure tones, to catch the
 * reedy medieval winds and buzzy organ timbres of the age:
 *
 *   - CARRIER    : an OscillatorNode at the note pitch.
 *   - MODULATOR  : a second oscillator whose output, scaled by a modGain, is
 *                  wired into carrier.frequency. modGain.gain (in Hz) is the
 *                  peak frequency deviation, i.e. the modulation index × the
 *                  modulator frequency. A fast-decaying mod-index envelope
 *                  gives the reedy, double-reed attack.
 *   - RATIO      : carrier:modulator frequency ratio sets the timbre family
 *                  (shawm/bombarde, portative organ, medieval fiddle).
 *
 * On top of that sits the defining Ars Nova innovation: the ISORHYTHM. A
 * repeating rhythmic pattern (the TALEA — an array of durations) is laid over
 * a repeating pitch series (the COLOR — an array of scale degrees). Because
 * talea.length ≠ color.length, the two cycle out of phase and only realign
 * after LCM(talea, color) iterations. The tenor is driven isorhythmically;
 * faster cantus / contratenor / triplum voices weave above it, all tuned to
 * one of the 8 church modes and washed in a large hall convolution reverb.
 */

class ArsNovaEngine {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.currentMode = 1;
        this.numVoices = 2;             // Tenor + Cantus by default
        this.tempo = 64;                // tactus (upper-voice) beats per minute
        this.voiceVolume = 0.75;
        this.brightness = 0.55;         // global FM modulation-index scaler
        this.reverbMix = 0.55;

        this.parts = [];                // active FM voices (tenor + upper voices)
        this.stepTimeout = null;
        this.activeNotes = [];

        this.masterGain = null;
        this.voiceBus = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.convolver = null;
        this.analyser = null;

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

        // === FM voice presets (carrier:modulator ratio + base mod index) ===
        this.presets = {
            organ:  { ratio: 1.0, index: 2.6, wave: 'sine'     },  // portative organ — rounder
            fiddle: { ratio: 1.5, index: 4.4, wave: 'sine'     },  // medieval fiddle / cantus
            shawm:  { ratio: 2.5, index: 8.5, wave: 'sawtooth' },  // shawm / bombarde — bright buzzy double reed
            triplum:{ ratio: 2.0, index: 6.2, wave: 'sine'     }   // upper shawm/fiddle blend
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
    }

    /** Large gothic hall — ~6 s tail with sparse early reflections. */
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

    /**
     * Build one ensemble part: an FM voice with its own fade-in bus.
     *   role: label · preset: FM timbre · octave: register lift ·
     *   vol: mix level · density: notes per tactus beat (0 = isorhythmic tenor).
     */
    createPart(role, presetName, octave, vol, density, index) {
        const now = this.ctx.currentTime;
        const busGain = this.ctx.createGain();
        busGain.gain.setValueAtTime(0, now);
        busGain.gain.linearRampToValueAtTime(vol, now + 1.2 + index * 0.5);
        busGain.connect(this.voiceBus);

        // Per-part fixed detune so the ensemble is a living, slightly-out choir.
        const detuneCents = (index - 1.5) * 6 + (Math.random() - 0.5) * 4;

        return {
            role, preset: this.presets[presetName], octave, vol, density,
            busGain, detuneCents,
            mel: this.modes[this.currentMode].tenor    // upper-voice melodic pointer
        };
    }

    setupVoices() {
        this.teardownVoices();
        // Additive layering: 2 = Tenor+Cantus, 3 = +Contratenor, 4 = +Triplum.
        const layout = [
            { role: 'tenor',   preset: 'organ',   octave: 0, vol: 0.50, density: 0   },
            { role: 'cantus',  preset: 'fiddle',  octave: 1, vol: 0.34, density: 2.2 },
            { role: 'contra',  preset: 'shawm',   octave: 0, vol: 0.28, density: 1.4 },
            { role: 'triplum', preset: 'triplum', octave: 1, vol: 0.24, density: 3.0 }
        ];
        for (let i = 0; i < this.numVoices; i++) {
            const p = layout[i];
            this.parts.push(this.createPart(p.role, p.preset, p.octave, p.vol, p.density, i));
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
                n.amp.gain.linearRampToValueAtTime(0, now + 0.8);
                setTimeout(() => { try { n.carrier.stop(); n.mod.stop(); } catch (e) {} }, 1000);
            } catch (e) {}
        }
        this.activeNotes = [];
        this.teardownVoices();
    }

    /**
     * One tenor talea-step. The tenor takes its duration from the talea and its
     * pitch from the color; the two arrays advance independently and precess.
     * Faster upper voices are then woven across the same span.
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
            this.playFMNote(tenor, freq, tenorDur * 0.96, 0);
        }

        // Upper voices: subdivide the tenor span into faster, stepwise figures.
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
                this.playFMNote(part, freq, sub * 0.9, i * sub);
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
     * One true FM note: carrier + modulator + enveloped modulation index,
     * amplitude ADSR, subtle vibrato, and per-note detune jitter.
     */
    playFMNote(part, freq, duration, delay) {
        if (!isFinite(freq) || freq <= 0 || !isFinite(duration) || duration <= 0) return;
        const t0 = this.ctx.currentTime + (delay || 0);
        const p = part.preset;
        const jitter = (Math.random() - 0.5) * 7;
        const detune = part.detuneCents + jitter;

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

        // --- Modulation-index envelope (peak deviation, Hz) ---
        // index scaled globally by brightness → 0.4 … 1.7×
        const bright = 0.4 + this.brightness * 1.3;
        const peakDev = p.index * modFreq * bright;
        const modGain = this.ctx.createGain();
        const atk = Math.min(0.02, duration * 0.2);
        const dec = Math.min(0.22, duration * 0.6);
        modGain.gain.setValueAtTime(Math.max(1, peakDev * 0.35), t0);
        modGain.gain.linearRampToValueAtTime(peakDev * 2.1, t0 + atk);           // reedy attack burst
        modGain.gain.exponentialRampToValueAtTime(Math.max(1, peakDev * 0.55), t0 + atk + dec);
        modGain.gain.exponentialRampToValueAtTime(Math.max(1, peakDev * 0.3), t0 + duration);
        mod.connect(modGain);
        modGain.connect(carrier.frequency);

        // --- Amplitude ADSR ---
        const amp = this.ctx.createGain();
        const a = Math.min(0.03, duration * 0.25);
        const r = Math.max(0.12, duration * 0.5);
        amp.gain.setValueAtTime(0, t0);
        amp.gain.linearRampToValueAtTime(1.0, t0 + a);
        amp.gain.setValueAtTime(0.85, t0 + Math.max(a, duration * 0.55));
        amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration + r);
        carrier.connect(amp);
        amp.connect(part.busGain);

        // --- Vibrato on held notes ---
        let vib = null;
        if (duration > 0.5) {
            vib = this.ctx.createOscillator();
            vib.type = 'sine';
            vib.frequency.value = 5.0 + Math.random() * 1.4;
            const vibDepth = this.ctx.createGain();
            vibDepth.gain.value = freq * 0.005;
            vib.connect(vibDepth); vibDepth.connect(carrier.frequency);
            vib.start(t0 + a); vib.stop(t0 + duration + r);
        }

        carrier.start(t0); mod.start(t0);
        const stopAt = t0 + duration + r + 0.1;
        carrier.stop(stopAt); mod.stop(stopAt);

        const node = { carrier, mod, amp };
        this.activeNotes.push(node);
        setTimeout(() => {
            const idx = this.activeNotes.indexOf(node);
            if (idx > -1) this.activeNotes.splice(idx, 1);
        }, (delay + duration + r + 0.2) * 1000);
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

    /** FM Brightness / Timbre → global modulation-index scaling. */
    setBrightness(v) { this.brightness = v; }

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
