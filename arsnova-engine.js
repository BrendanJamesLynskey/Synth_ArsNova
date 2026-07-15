/**
 * Ars Nova Synthesis Engine — FOF Vocal Synthesis + Isorhythm
 *
 * The 14th-century French Ars Nova (Philippe de Vitry, Guillaume de Machaut)
 * was SUNG: the isorhythmic motet is polyphony for human voices. This engine
 * therefore voices the faster upper parts (cantus · contratenor · triplum)
 * with the shared `vocal-voices.js` vocal-synthesis library, and holds them
 * over a slow, sustained INSTRUMENTAL tenor — historically the isorhythmic
 * cantus firmus was very often carried on an instrument while the upper voices
 * were sung.
 *
 *   - VOICE (upper) : the `vocal-voices.js` library (default technique FOF —
 *                     Fonction d'Onde Formantique, the IRCAM CHANT method): a
 *                     burst of overlapping formant grains per glottal period
 *                     reconstructs a true sung vocal spectrum with real Latin
 *                     vowel formants (a e i o u). Each upper voice is a small
 *                     chorus of persistent detuned library singers; only the
 *                     fold pitch and vowel change from note to note, exactly as
 *                     in real singing, for a living, haunting choral shimmer.
 *   - TENOR (instr) : a restrained FM tone (a mellow bowed/reed/organ colour) on
 *                     long sustained notes — the grounding cantus firmus.
 *
 * On top of that sits the defining Ars Nova innovation: the ISORHYTHM — and
 * here it is the REAL thing: the tenor of Kyrie I from Machaut's Messe de
 * Nostre Dame (Dorian, final D). A 4-note TALEA (durations 3·1·2·3 semibreves,
 * closed by a 3-semibreve tenor REST) is laid over a 28-note COLOR; 28/4 = 7,
 * so exactly seven taleae state the whole color, the last omitting its rest to
 * end on the Dorian final D. The sung triplum and motetus move 4–8 attacks per
 * tenor attack (the Ars Nova speed stratification), land OPEN 5th+octave
 * sonorities at every talea cadence, hocket briefly in the last talea, close
 * with the DOUBLE LEADING-TONE cadence (C#→D over G#→A), then restate the
 * color in DIMINUTION — all washed in a large chapel convolution reverb.
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
        this.limiter = null;
        this.voiceBus = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.convolver = null;
        this.analyser = null;

        // Tenor sits low; upper voices are lifted an octave.
        this.basePitch = 146.83;        // D3

        // One semibreve (the tenor's counting unit) = 30/tempo seconds —
        // ≈ 0.47 s at the default tactus, so tenor notes run ~0.5–1.4 s.

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

        // === The isorhythm: Machaut, Messe de Nostre Dame — Kyrie I tenor ===
        // The authentic tenor (Dorian, final D), machine-extracted from the
        // public-domain score. TALEA: 4 durations in semibreves, then a
        // 3-semibreve tenor REST — that periodic tenor silence is diagnostic
        // and must be audible. COLOR: 28 pitches as diatonic steps above the
        // finalis (0=D3 1=E3 2=F3 3=G3 4=A3 5=B3 6=C4). Model:
        // pitch[i] = color[i mod 28], duration[i] = talea[i mod 4]; 28/4 = 7,
        // so exactly seven taleae realign the cycle; the 7th omits its closing
        // rest and ends on the Dorian final, D3.
        this.talea = [3, 1, 2, 3];       // durations, in semibreves
        this.taleaRestBeats = 3;         // tenor rest closing every talea but the last
        this.color = [
            4, 4, 3, 4,     // A  A  G  A
            6, 5, 4, 3,     // C' B  A  G
            4, 4, 3, 2,     // A  A  G  F
            0, 2, 1, 3,     // D  F  E  G
            4, 0, 1, 3,     // A  D  E  G
            3, 2, 1, 0,     // G  F  E  D
            1, 2, 1, 0      // E  F  E  D   ← ends on the Dorian final
        ];
        this.tenorIndex = 0;             // 0..27 through the color
        this.inRest = false;             // true while a talea's closing tenor rest sounds
        this.pass = 0;                   // 0 = integer statement · 1 = diminution (talea halved)

        // Upper-voice line configs by part index (1..3). Ranges are absolute
        // diatonic steps above D3 (7 per octave): the triplum lives D4–E5 in
        // the treble band of the sampled voice bank (voice:'auto'), the
        // motetus G3–B4 in the male band. `fast` voices move at the minim
        // with semiminim ornaments and syncopation — 4–8 attacks per tenor
        // attack, the Ars Nova speed stratification. Cadence fields: finalStep
        // is the closing D–A–D tone; penStep(+penCents) the leading tone of
        // the double-leading-tone cadence (C#5 / G#4, raised 100 cents);
        // preStep the 7-6 / 4-3 suspension sounded just before it.
        this.upperRoles = [
            null,
            { name: 'triplum',  lo: 7, hi: 15, fast: true,  finalStep: 14, penStep: 13, penCents: 100, preStep: 14 },
            { name: 'motetus',  lo: 3, hi: 12, fast: false, finalStep: 11, penStep: 10, penCents: 100, preStep: 11 },
            { name: 'triplum2', lo: 7, hi: 13, fast: true,  finalStep: 7,  penStep: 8,  penCents: 0,   preStep: 8  }
        ];
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;

        // Soft limiter before the destination keeps the ensemble from clipping.
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -8; this.limiter.knee.value = 8;
        this.limiter.ratio.value = 6; this.limiter.attack.value = 0.004; this.limiter.release.value = 0.25;
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);

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

        // Load the vocal-synthesis worklets (FOF, vocal tract) once.
        await VocalVoices.init(this.ctx);
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

    /**
     * Build one ensemble part.
     *
     *  - INSTRUMENTAL TENOR (vocal:false): just a fade-in bus; notes are FM.
     *  - SUNG UPPER VOICE (vocal:true): a small chorus of persistent FOF library
     *        singers — voice.output → noteGain (per-note envelope) → busGain →
     *        voiceBus. Only the fold pitch and vowel change from note to note.
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
            // --- Persistent chorus of FOF library singers ---
            const noteGain = this.ctx.createGain();
            noteGain.gain.value = 0.0001;
            noteGain.connect(busGain);

            const vowels = cfg.vowels;
            const vowel0 = vowels[0];
            // Two folds per note (a hair of detune) make each singer fuller.
            const detunes = [0, 7];
            const singers = detunes.map((cents, di) => {
                const v = VocalVoices.create(this.ctx, {
                    technique: 'sampler', voice: 'auto', ensemble: 1,   // app already layers singers (was 'fof')
                    vowel: vowel0, detuneCents: detuneCents + cents,
                    breath: 0.06, vibDepth: 0.006 + di * 0.001
                });
                const sg = this.ctx.createGain();
                sg.gain.value = di === 0 ? 1.0 : 0.55;
                v.output.connect(sg); sg.connect(noteGain);
                return v;
            });

            part.noteGain = noteGain;
            part.singers = singers;
            part.vowels = vowels;
            part.vowel = vowel0;
            part.vowelPos = 0;
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
                if (part.singers) {
                    const s = part.singers;
                    setTimeout(() => { s.forEach(v => { try { v.dispose(); } catch (e) {} }); }, 1900);
                }
            } catch (e) {}
        }
        this.parts = [];
    }

    /** Morph a sung voice's library chorus toward a new vowel. */
    setVowel(part, vowel) {
        if (!this.vowels[vowel] || !part.singers) return;
        const now = this.ctx.currentTime;
        part.singers.forEach(v => v.setVowel(vowel, now));
        part.vowel = vowel;
    }

    // === The isorhythmic engine — Machaut, Kyrie I (Messe de Nostre Dame) ===

    /**
     * Diatonic step above the finalis (7 per octave, may exceed/undershoot)
     * + explicit octave + optional accidental (cents) → frequency.
     * Step 0 = D3 in mode 1; +100 cents raises a leading tone (C#, G#).
     */
    noteFreq(step, octave, accCents) {
        const m = this.modes[this.currentMode];
        const idx = ((step % 7) + 7) % 7;
        const oct = Math.floor(step / 7) + (octave || 0);
        return this.centsToFreq(m.intervals[idx] + (accCents || 0)) * Math.pow(2, oct);
    }

    clampStep(s, role) { return Math.max(role.lo, Math.min(role.hi, s)); }

    /**
     * Nearest consonance with the tenor within the role's range; moves
     * part.step. Intervals are diatonic steps above the tenor — perfect:
     * unison/5th/8ve/12th/15th; imperfect adds 3rds/6ths (and 4ths, usable
     * above the tenor in Ars Nova practice).
     */
    pickConsonant(part, role, tenorStep, perfectOnly) {
        const ivs = perfectOnly ? [0, 4, 7, 11, 14]
                                : [0, 2, 3, 4, 5, 7, 9, 10, 11, 12, 14];
        let best = this.clampStep(part.step, role);
        let bestCost = Infinity;
        for (const iv of ivs) {
            const cand = tenorStep + iv;
            if (cand < role.lo || cand > role.hi) continue;
            let cost = Math.abs(cand - part.step) + Math.random() * 0.8;
            if (cand === part.step) cost += 0.6;          // keep the line moving
            if (cost < bestCost) { bestCost = cost; best = cand; }
        }
        part.step = best;
        return best;
    }

    /** One stepwise passing/neighbour move, kept inside the role's range. */
    stepwise(part, role) {
        let dir = Math.random() < 0.5 ? -1 : 1;
        if (part.step <= role.lo) dir = 1;
        else if (part.step >= role.hi) dir = -1;
        else if (Math.random() < 0.35) {
            dir = part.step > (role.lo + role.hi) / 2 ? -1 : 1;   // lean back toward mid-range
        }
        part.step += dir;
        return part.step;
    }

    /**
     * Compose one sung part's notes for a tenor span, on a minim grid:
     * returns [{ step, at (minims), len (minims), cents }].
     *
     *  - final:   hold the open D–A–D sonority for the whole span.
     *  - penult:  the DOUBLE LEADING-TONE cadence — one anticipatory minim
     *             (a 7-6 / 4-3 suspension over the tenor's E), then C#5 in the
     *             triplum and G#4 in the motetus held to resolve D5 / A4.
     *  - cadence: land an OPEN perfect sonority (unison/5th/8ve, no third) on
     *             the tenor pitch at every talea boundary and hold it.
     *  - hocket:  triplum and motetus alternate note/rest at the minim.
     *  - else:    free counterpoint — consonances on strong minims (semibreve
     *             starts), stepwise passing tones between, with occasional
     *             SYNCOPATION (a weak minim seizing the consonance and holding
     *             it across the beat) and semiminim ornament pairs.
     */
    composeLine(part, role, vIndex, spanMin, tenorStep, opts) {
        if (opts.final) {
            part.step = role.finalStep;
            return [{ step: role.finalStep, at: 0, len: spanMin }];
        }
        if (opts.penult) {
            part.step = role.penStep;
            if (spanMin < 2) return [{ step: role.penStep, cents: role.penCents, at: 0, len: spanMin }];
            return [
                { step: role.preStep, at: 0, len: 1 },
                { step: role.penStep, cents: role.penCents, at: 1, len: spanMin - 1 }
            ];
        }
        if (opts.cadence) {
            const goal = this.pickConsonant(part, role, tenorStep, true);
            return [{ step: goal, at: 0, len: spanMin }];
        }
        if (opts.hocket) {
            if (vIndex > 2) {   // any extra voice holds a perfect tone under the hocket
                return [{ step: this.pickConsonant(part, role, tenorStep, true), at: 0, len: spanMin }];
            }
            const notes = [];
            for (let m = vIndex === 1 ? 0 : 1; m < spanMin; m += 2) {
                const step = m % 2 === 0 ? this.pickConsonant(part, role, tenorStep, false)
                                         : this.stepwise(part, role);
                notes.push({ step, at: m, len: 1 });
            }
            return notes;
        }
        const notes = [];
        let m = 0;
        if (!role.fast) {
            // Motetus: nearer the semibreve — held consonances, minim pairs.
            while (m < spanMin) {
                if (spanMin - m >= 2 && Math.random() < 0.5) {
                    notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 2 });
                    m += 2;
                } else {
                    notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 1 });
                    m += 1;
                    if (m < spanMin) { notes.push({ step: this.stepwise(part, role), at: m, len: 1 }); m += 1; }
                }
            }
            return notes;
        }
        // Triplum: minim motion with syncopations and semiminim ornaments.
        while (m < spanMin) {
            const strong = m % 2 === 0;
            if (strong) {
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 1 });
                m += 1;
            } else if (!opts.dim && m + 2 <= spanMin && Math.random() < 0.18) {
                // Syncopation across the beat — the nervous Ars Nova surface.
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 2 });
                m += 2;
            } else if (!opts.dim && Math.random() < 0.2) {
                // Semiminim pair filling one weak minim.
                notes.push({ step: this.stepwise(part, role), at: m, len: 0.5 });
                notes.push({ step: this.stepwise(part, role), at: m + 0.5, len: 0.5 });
                m += 1;
            } else {
                notes.push({ step: this.stepwise(part, role), at: m, len: 1 });
                m += 1;
            }
        }
        return notes;
    }

    /**
     * Weave the sung upper voices across one tenor span (note or talea rest).
     * Composition happens in composeLine; emission goes through the untouched
     * playVoiceNote path (persistent singer chorus + shared note envelope),
     * advancing the part's vowel per note as before.
     */
    weaveUpperVoices(spanMin, minimSec, tenorStep, opts) {
        for (let v = 1; v < this.parts.length; v++) {
            const part = this.parts[v];
            const role = this.upperRoles[Math.min(v, this.upperRoles.length - 1)];
            if (part.step === undefined || part.step === null) {
                part.step = this.clampStep(tenorStep + (role.fast ? 7 : 4), role);
            }
            const notes = this.composeLine(part, role, v, spanMin, tenorStep, opts || {});
            for (const n of notes) {
                const freq = this.noteFreq(n.step, 0, n.cents || 0);
                part.vowelPos = (part.vowelPos + 1) % part.vowels.length;
                const vowel = part.vowels[part.vowelPos];
                const prevFreq = n.at > 0 ? part._lastFreq : null;
                this.playVoiceNote(part, freq, n.len * minimSec * 0.92, n.at * minimSec, vowel, prevFreq);
                part._lastFreq = freq;
            }
        }
    }

    start() {
        this.isPlaying = true;
        this.tenorIndex = 0;
        this.inRest = false;
        this.pass = 0;
        for (const part of this.parts) { part.step = undefined; part._lastFreq = null; }
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
     * One tenor event of the Machaut isorhythm: pitch[i] = color[i mod 28],
     * duration[i] = talea[i mod 4]; after every 4th color note the tenor falls
     * SILENT for 3 semibreves (the talea rest) while the sung voices sail on —
     * except after the 7th, final talea, which ends straight on D3. Each talea
     * closes with an open-5th+octave cadence; notes 24–25 hocket; the last two
     * carry the double-leading-tone close. When the color completes, a second
     * pass restates it in DIMINUTION (talea durations halved), then da capo.
     */
    scheduleTenorNote() {
        if (!this.isPlaying || !this.parts.length) return;
        const sb = 30 / this.tempo;              // one semibreve ≈ 0.47 s at the default tactus
        const minim = sb / 2;
        const dim = this.pass === 1;             // diminution pass

        // --- Talea rest: the tenor is silent, the upper voices keep moving ---
        if (this.inRest) {
            this.inRest = false;
            const restBeats = dim ? this.taleaRestBeats / 2 : this.taleaRestBeats;
            const spanMin = Math.max(2, Math.round(restBeats * 2));
            // Anchor the counterpoint on the tenor pitch about to re-enter.
            const anchor = this.color[this.tenorIndex % this.color.length];
            this.weaveUpperVoices(spanMin, minim, anchor, { dim });
            this.stepTimeout = setTimeout(() => this.scheduleTenorNote(), restBeats * sb * 1000);
            return;
        }

        const i = this.tenorIndex;
        const taleaPos = i % this.talea.length;
        const tenorStep = this.color[i];
        const durBeats = dim ? this.talea[taleaPos] / 2 : this.talea[taleaPos];
        const spanSec = durBeats * sb;
        const spanMin = Math.max(1, Math.round(durBeats * 2));
        const isFinal = i === this.color.length - 1;

        // --- The instrumental tenor: one note of the cantus firmus ---
        const tenor = this.parts[0];
        if (tenor && tenor.role === 'tenor') {
            const freq = this.noteFreq(tenorStep, tenor.octave, 0);
            this.playTenorNote(tenor, freq, spanSec * 0.96, 0);
        }

        // --- The sung upper voices, woven across the same span ---
        this.weaveUpperVoices(spanMin, minim, tenorStep, {
            cadence: taleaPos === this.talea.length - 1 && !isFinal,
            final: isFinal,
            penult: i === this.color.length - 2,
            hocket: !dim && i >= 24 && i <= 25,   // short hocket opening the last talea
            dim
        });

        // --- Advance the isorhythm ---
        this.tenorIndex++;
        let gap = spanSec;
        if (isFinal) {
            // Color complete: breathe, then the diminution pass (or da capo).
            this.tenorIndex = 0;
            this.pass = (this.pass + 1) % 2;
            for (const part of this.parts) { part.step = undefined; part._lastFreq = null; }
            gap = spanSec + sb * 2.5;
        } else if (taleaPos === this.talea.length - 1) {
            this.inRest = true;                   // every talea but the last closes with its rest
        }
        this.stepTimeout = setTimeout(() => this.scheduleTenorNote(), gap * 1000);
    }

    /**
     * Sing one note on an upper voice by steering the part's persistent FOF
     * library chorus (pitch + vowel) and re-shaping the shared per-note
     * amplitude envelope (part.noteGain). Stepwise notes glide legato from the
     * previous pitch; the library adds its own gentle vibrato and breath.
     */
    playVoiceNote(part, freq, duration, delay, vowel, slideFrom) {
        if (!isFinite(freq) || freq <= 0 || !isFinite(duration) || duration <= 0) return;
        const t0 = this.ctx.currentTime + (delay || 0);

        if (vowel) this.setVowel(part, vowel);

        const glide = (slideFrom && isFinite(slideFrom)) ? Math.min(0.12, duration * 0.4) : 0;
        part.singers.forEach(v => {
            if (glide > 0) { v.setFrequency(slideFrom, t0, 0); v.setFrequency(freq, t0, glide); }
            else v.setFrequency(freq, t0, 0);
            v.setLevel(1, t0);
        });

        const g = part.noteGain.gain;
        const attack = Math.min(0.09, duration * 0.4);
        const release = Math.max(0.18, duration * 0.55);
        const peak = 0.7;
        g.cancelScheduledValues(t0);
        g.setValueAtTime(Math.max(0.0001, g.value), t0);
        g.linearRampToValueAtTime(peak, t0 + attack);
        g.setValueAtTime(peak * 0.92, t0 + Math.max(attack, duration * 0.6));
        g.exponentialRampToValueAtTime(0.0008, t0 + duration + release);
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
        // Re-seat each sung line: weaveUpperVoices re-initialises part.step on
        // the next span, in the new mode's interval colouring.
        for (const part of this.parts) part.step = undefined;
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
     * Brightness / Timbre → the instrumental tenor's FM colour (mod-index scale,
     * applied per note in playTenorNote). Same method name the UI already calls;
     * the sung upper voices now come from the shared FOF library.
     */
    setBrightness(v) {
        this.brightness = v;
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
