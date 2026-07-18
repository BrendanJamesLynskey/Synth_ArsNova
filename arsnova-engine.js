/**
 * Ars Nova Synthesis Engine — FOF Vocal Synthesis + Isorhythm
 *
 * The 14th-century French Ars Nova (Philippe de Vitry, Guillaume de Machaut)
 * was SUNG: the isorhythmic motet is polyphony for human voices. This engine
 * therefore voices the faster upper parts (triplum · motetus) with the shared
 * `vocal-voices.js` vocal-synthesis library, and holds them over a slow,
 * sustained INSTRUMENTAL tenor (+ contratenor) — historically the isorhythmic
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
 * The engine now carries a small REPERTOIRE of real Ars Nova music and
 * alternates between two pieces on successive starts (setPiece() overrides):
 *
 * 1 · THE ISORHYTHMIC MOTET — Machaut, Kyrie I (Messe de Nostre Dame).
 *     The REAL tenor (Dorian, final D): a 4-note TALEA (3·1·2·3 semibreves,
 *     closed by a 3-semibreve tenor REST) over a 28-note COLOR; 28/4 = 7, so
 *     exactly seven taleae state the color, the last omitting its rest to end
 *     on the Dorian final D. Above it the sung triplum and motetus are woven
 *     with the concrete Ars Nova idioms:
 *       - mensural surface: minims with semiminim ornament pairs and true
 *         SYNCOPATION (semiminim · minim · semiminim chains that seize and
 *         hold the pitch across the tactus);
 *       - COLORATION (hemiola): taleae 3 and 5 group the triplum and motetus
 *         in dotted-minim pairs — three-becomes-two, the "red note" effect;
 *       - DOUBLE LEADING-TONE cadences closing EVERY talea: both voices raise
 *         a semitone below their goal tones (octave + fifth over the tenor)
 *         during the penultimate tenor note and resolve on the boundary, the
 *         triplum decorating with the under-third (Landini) turn; the final
 *         close is C#→D over G#→A;
 *       - a strict HOCKET ladder opening talea 6: triplum and motetus trade
 *         single minims of one shared descending line, rest for note;
 *       - a DIMINUTION pass restating the whole color with the talea halved;
 *       - an optional CONTRATENOR (4-voice mode): a second INSTRUMENTAL
 *         scaffold in the tenor's register that moves note-against-note in
 *         fifths/thirds/octaves and bridges the tenor's talea rests. (The
 *         contratenor line is rule-based in Machaut's manner, not the literal
 *         Mass contratenor.)
 *
 * 2 · THE VIRELAI — Machaut, "Douce dame jolie", the most famous Ars Nova
 *     melody, encoded note-for-note (D Dorian) from the standard modern
 *     transcription and sung through the full AbbaA virelai form: refrain ·
 *     two verse couplets (ouvert / clos endings) · tierce · refrain. One sung
 *     voice carries the monophonic tune — with its lilting semiminim
 *     syncopes and the C#→D under-tone closes — over a soft instrumental
 *     bourdon (a common medieval performance practice, not in the source).
 *
 * All of it is washed in a large chapel convolution reverb.
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

        // === Instrumental FM presets (carrier:modulator ratio + base mod index) ===
        // Tenor: a mellow bowed/reed/organ colour for the sustained cantus firmus.
        // Contratenor: a slightly hollower, reedier partner in the same register.
        this.tenorPreset  = { ratio: 1.0, index: 2.2, wave: 'sine' };
        this.contraPreset = { ratio: 2.0, index: 1.4, wave: 'sine' };

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

        // Upper-voice line configs by role name. Ranges are absolute diatonic
        // steps above D3 (7 per octave): the triplum lives D4–E5 in the treble
        // band of the sampled voice bank (voice:'auto', which splits at F#4;
        // the bank tops out at F#5), the motetus G3–B4 in the male band.
        // `fast` voices move at the minim with semiminim ornaments and
        // syncopation — 4–8 attacks per tenor attack, the Ars Nova speed
        // stratification. Cadence fields: cadIvs are the diatonic intervals
        // above the tenor this voice may take as a cadence goal (octave/15th
        // for the triplum, 5th/12th for the motetus — the double-leading-tone
        // pair); finalStep is the closing D5 / A4 of the final D–A–D sonority.
        this.upperRoles = {
            triplum: { lo: 7, hi: 15, fast: true,  cadIvs: [7, 11, 14], finalStep: 14 },
            motetus: { lo: 3, hi: 12, fast: false, cadIvs: [4, 11],     finalStep: 11 }
        };

        // Contratenor range: diatonic steps around the tenor's register,
        // G2 (step −4) up to B3 (step 5). Instrumental, so no bank limits.
        this.contraRole = { lo: -4, hi: 5 };

        // === Repertoire selection ===
        // 'auto' alternates motet ↔ virelai on successive starts; setPiece()
        // pins one. activePiece is what is actually sounding right now.
        this.piece = 'auto';
        this.activePiece = 'motet';
        this._pieceCycle = 0;

        // === The virelai: Machaut, "Douce dame jolie" (monophonic, D Dorian) ===
        // Encoded note-for-note from the standard modern transcription
        // (flutetunes.com edition, G Dorian, transposed here down a fourth to
        // the engine's D-Dorian base). Each note is [step, lenSemibreves,
        // accCents]: step = diatonic degree above D3 (7 = D4, 14 = D5);
        // accCents raises/lowers ficta (+100 on step 6 = C#4, −100 on step 12
        // = Bb4). Range C#4–D5 — comfortably inside the sampled bank.
        // Four phrases: a1 (ouvert, ends E4) · a2 (clos, C#→D under-tone) ·
        // bo (verse, ouvert on A4) · bc (verse, clos, C#→D). The virelai form
        // AbbaA = a1 a2 · bo bc · a1 a2 · a1 a2.
        this.virelai = {
            a1: [ [11,1],[11,1],[7,1],[6,1],[7,1],
                  [9,0.5],[8,1],[7,0.5],[8,1],
                  [8,1],[7,1],[11,1],
                  [11,0.5],[10,1],[9,0.5],
                  [9,0.5],[8,1],[7,0.5],[8,1] ],
            a2: [ [11,1],[7,1],[7,1],[6,1],[7,1],
                  [9,0.5],[8,1],[7,0.5],[8,1],
                  [10,1],[9,1.5],[8,0.5],
                  [7,1],[6,1,100],[7,3] ],
            bo: [ [12,1],[14,1],[14,1],[13,1],[12,1],[11,2],
                  [11,0.5],[10,1],[9,0.5],[11,2],
                  [12,0.5,-100],[11,0.5],[10,0.5],[9,0.5],
                  [8,1],[7,1],[9,1],[10,1],[11,3] ],
            bc: [ [12,1],[14,1],[14,1],[13,1],[12,1],[11,2],
                  [11,0.5],[10,1],[9,0.5],[11,2],
                  [12,0.5,-100],[11,0.5],[10,0.5],[9,0.5],
                  [8,1],[7,1],[8,0.5],[7,1],[6,0.5,100],[7,3] ]
        };
        this.virelaiForm = ['a1','a2','bo','bc','a1','a2','a1','a2'];
        this.virelaiPos = 0;
        // A loose vowel plan echoing "Dou-ce da-me jo-li-e".
        this.virelaiVowels = ['u','e','a','e','o','i','e'];
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
            part.preset = cfg.role === 'contratenor' ? this.contraPreset : this.tenorPreset;
        }

        return part;
    }

    setupVoices() {
        this.teardownVoices();
        // Additive layering in the historical order: 2 = Tenor+Triplum,
        // 3 = +Motetus (the classic three-voice motet), 4 = +Contratenor
        // (the full Machaut-Mass texture). Indices 0 and 3 are INSTRUMENTAL
        // scaffold voices; 1 and 2 are SUNG, each with its own vowel colour
        // (triplum bright e/i/a · motetus dark o/a/u).
        const layout = [
            { role: 'tenor',       vocal: false, octave: 0, vol: 0.50, density: 0,   vowels: null            },
            { role: 'triplum',     vocal: true,  octave: 1, vol: 0.32, density: 3.0, vowels: ['e','i','a']   },
            { role: 'motetus',     vocal: true,  octave: 0, vol: 0.32, density: 1.4, vowels: ['o','a','u']   },
            { role: 'contratenor', vocal: false, octave: 0, vol: 0.38, density: 0,   vowels: null            }
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
        return this.noteFreqIn(this.currentMode, step, octave, accCents);
    }

    /** Same, but pinned to a given mode (the virelai is always Dorian). */
    noteFreqIn(modeNum, step, octave, accCents) {
        const m = this.modes[modeNum];
        const idx = ((step % 7) + 7) % 7;
        const oct = Math.floor(step / 7) + (octave || 0);
        return this.centsToFreq(m.intervals[idx] + (accCents || 0)) * Math.pow(2, oct);
    }

    clampStep(s, role) { return Math.max(role.lo, Math.min(role.hi, s)); }

    /**
     * The raised leading tone one diatonic step below a cadence goal: returns
     * { step, cents } such that it sounds exactly 100 cents below the goal —
     * C# under D, G# under A, F# under G, and (in Phrygian colourings) the
     * step that is already a semitone away untouched. Mode-generic.
     */
    leadingTone(goalStep) {
        const m = this.modes[this.currentMode];
        const gIdx = ((goalStep % 7) + 7) % 7;
        const lStep = goalStep - 1;
        const lIdx = ((lStep % 7) + 7) % 7;
        const gap = ((m.intervals[gIdx] - m.intervals[lIdx]) % 1200 + 1200) % 1200;
        return { step: lStep, cents: gap - 100 };
    }

    /**
     * Choose this voice's cadence goal over an arriving tenor step: the
     * in-range candidate among role.cadIvs (octave-class for the triplum,
     * fifth-class for the motetus) nearest the line's current position.
     */
    cadenceGoal(part, role, tenorStep) {
        // Fast voices decorate the goal with the under-third (goal − 2), so
        // their goal must sit at least a 3rd above the range floor.
        const floor = role.fast ? role.lo + 2 : role.lo;
        let best = null, bestCost = Infinity;
        for (const iv of role.cadIvs) {
            const cand = tenorStep + iv;
            if (cand < floor || cand > role.hi) continue;
            const cost = Math.abs(cand - (part.step !== undefined ? part.step : cand));
            if (cost < bestCost) { bestCost = cost; best = cand; }
        }
        return best !== null ? best : this.clampStep(tenorStep + role.cadIvs[role.cadIvs.length - 1], role);
    }

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
        if (part._bias) { dir = part._bias; part._bias = 0; }     // recover after a leap
        if (part.step <= role.lo) dir = 1;
        else if (part.step >= role.hi) dir = -1;
        else if (Math.random() < 0.35) {
            dir = part.step > (role.lo + role.hi) / 2 ? -1 : 1;   // lean back toward mid-range
        }
        part.step += dir;
        return part.step;
    }

    /**
     * The triplum's ANGULAR melodic move: usually stepwise, but roughly one
     * time in five it leaps a 3rd–5th (toward whichever side has room) and
     * biases the next stepwise move back the other way — the wide, nervous
     * triplum contour of the Ars Nova motet.
     */
    angular(part, role) {
        if (Math.random() < 0.22 && !part._bias) {
            const leap = 2 + Math.floor(Math.random() * 3);       // 3rd, 4th or 5th
            const room = (role.hi - part.step) - (part.step - role.lo);
            const dir = room > 0 ? 1 : -1;
            part.step = this.clampStep(part.step + dir * leap, role);
            part._bias = -dir;                                    // step back after the leap
            return part.step;
        }
        return this.stepwise(part, role);
    }

    /**
     * Compose one sung part's notes for a tenor span, on a minim grid:
     * returns [{ step, at (minims), len (minims), cents }].
     *
     *  - final:      hold the closing tone of the open D–A–D sonority.
     *  - preCadence: the note BEFORE a talea boundary — the voice moves onto
     *                its raised leading tone (octave-class goal for the
     *                triplum, fifth-class for the motetus: the DOUBLE
     *                LEADING-TONE) so that both semitones resolve exactly ON
     *                the boundary downbeat; the triplum decorates its last
     *                minim with the under-third (Landini) turn.
     *  - cadence:    the boundary arrival itself — land the goal tone of the
     *                open perfect sonority and hold it through the tenor note.
     *  - coloration: HEMIOLA — dotted-minim pairs (3 minims → 2 notes), the
     *                "red note" 3:2 regrouping, in both upper voices at once.
     *  - else:       free counterpoint — consonances on strong minims,
     *                angular/stepwise tones between, semiminim ornament pairs,
     *                and true SYNCOPATION: semiminim · minim(s) · semiminim
     *                chains that seize the pitch off the beat and hold it
     *                across the tactus.
     *  (Hocket is coordinated across voices in weaveUpperVoices.)
     */
    composeLine(part, role, vIndex, spanMin, tenorStep, opts) {
        if (opts.final) {
            part.step = role.finalStep;
            part._cadGoal = null;
            return [{ step: role.finalStep, at: 0, len: spanMin }];
        }
        if (opts.preCadence) {
            // Goal over the ARRIVING tenor note (or the final D–A–D tones).
            const goal = opts.toFinal ? role.finalStep
                                      : this.cadenceGoal(part, role, opts.preCadence.nextStep);
            part._cadGoal = goal;
            const lt = this.leadingTone(goal);
            const notes = [];
            let m = 0;
            if (spanMin >= 4) {          // free head, then a one-minim anticipation
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: 0, len: spanMin - 3 });
                notes.push({ step: goal, at: spanMin - 3, len: 1 });
                m = spanMin - 2;
            } else if (spanMin >= 3) {
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: 0, len: 1 });
                m = 1;
            }
            if (role.fast && spanMin - m >= 2) {
                // Leading tone, then the under-third (Landini) turn: C#·B → D.
                notes.push({ step: lt.step, cents: lt.cents, at: m, len: spanMin - m - 1 });
                notes.push({ step: goal - 2, at: spanMin - 1, len: 1 });
            } else {
                // Motetus (and cramped spans): the raised tone held to resolve.
                notes.push({ step: lt.step, cents: lt.cents, at: m, len: spanMin - m });
            }
            part.step = goal;
            return notes;
        }
        if (opts.cadence) {
            const goal = (part._cadGoal !== null && part._cadGoal !== undefined)
                       ? part._cadGoal : this.cadenceGoal(part, role, tenorStep);
            part._cadGoal = null;
            part.step = goal;
            return [{ step: goal, at: 0, len: spanMin }];
        }
        if (opts.coloration) {
            // Hemiola: regroup the minims 3→2 as dotted-minim pairs. Both
            // upper voices carry it together, so the cross-rhythm against the
            // tenor's semibreves is unmistakable.
            const notes = [];
            let m = 0;
            while (spanMin - m >= 3) {
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 1.5 });
                notes.push({ step: this.stepwise(part, role), at: m + 1.5, len: 1.5 });
                m += 3;
            }
            while (m < spanMin) {
                notes.push({ step: this.stepwise(part, role), at: m, len: 1 });
                m += 1;
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
        // Triplum: minim motion with syncopation chains, angular leaps and
        // semiminim ornaments — the nervous Ars Nova surface.
        while (m < spanMin) {
            const strong = m % 2 === 0;
            if (strong && !opts.dim && m + 2 <= spanMin && Math.random() < 0.25) {
                // True mensural syncope: semiminim · minim · semiminim — the
                // middle note seizes the consonance OFF the beat and holds it
                // across the next minim boundary.
                notes.push({ step: this.stepwise(part, role), at: m, len: 0.5 });
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m + 0.5, len: 1 });
                notes.push({ step: this.stepwise(part, role), at: m + 1.5, len: 0.5 });
                m += 2;
            } else if (strong) {
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 1 });
                m += 1;
            } else if (!opts.dim && m + 2 <= spanMin && Math.random() < 0.18) {
                // A weak minim seizing the consonance and holding it across the beat.
                notes.push({ step: this.pickConsonant(part, role, tenorStep, false), at: m, len: 2 });
                m += 2;
            } else if (!opts.dim && Math.random() < 0.34) {
                // Semiminim pair filling one weak minim.
                notes.push({ step: this.angular(part, role), at: m, len: 0.5 });
                notes.push({ step: this.stepwise(part, role), at: m + 0.5, len: 0.5 });
                m += 1;
            } else {
                notes.push({ step: this.angular(part, role), at: m, len: 1 });
                m += 1;
            }
        }
        return notes;
    }

    /**
     * Weave the sung upper voices across one tenor span (note or talea rest).
     * Composition happens in composeLine (or, for the hocket, right here so
     * the two voices trade minims of ONE shared line); emission goes through
     * the untouched playVoiceNote path (persistent singer chorus + shared
     * note envelope), advancing the part's vowel per note as before.
     */
    weaveUpperVoices(spanMin, minimSec, tenorStep, opts) {
        opts = opts || {};
        const sung = [];
        for (let v = 1; v < this.parts.length; v++) {
            if (this.parts[v].vocal) sung.push(this.parts[v]);
        }

        // --- HOCKET: one descending ladder, its minims dealt out note-for-rest
        // between triplum and motetus (a lone voice hockets against silence).
        if (opts.hocket && sung.length) {
            const start = tenorStep + 7;
            for (let k = 0; k < spanMin; k++) {
                // With one sung voice, the odd minims stay silent — the rests
                // are what make it a hocket.
                const part = sung.length === 1 ? (k % 2 === 0 ? sung[0] : null)
                                               : sung[k % sung.length];
                if (!part) continue;
                const role = this.upperRoles[part.role];
                const step = this.clampStep(start - Math.floor(k / 2) - (k % 2), role);
                const freq = this.noteFreq(step, 0, 0);
                part.vowelPos = (part.vowelPos + 1) % part.vowels.length;
                this.playVoiceNote(part, freq, minimSec * 0.8, k * minimSec, part.vowels[part.vowelPos], null);
                part.step = step;
                part._lastFreq = freq;
            }
            return;
        }

        for (const part of sung) {
            const role = this.upperRoles[part.role];
            if (!role) continue;
            if (part.step === undefined || part.step === null) {
                part.step = this.clampStep(tenorStep + (role.fast ? 7 : 4), role);
            }
            const notes = this.composeLine(part, role, 0, spanMin, tenorStep, opts);
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

    /**
     * The CONTRATENOR: the second instrumental scaffold voice (4-voice mode).
     * It moves in the tenor's stratum — one or two notes per tenor note,
     * always a fifth/third/unison/octave-class consonance with the tenor,
     * chosen by nearest motion within G2–B3 — and it BRIDGES the tenor's
     * talea rests, exactly the contratenor's job in the Machaut Mass.
     * (Rule-based in Machaut's manner; not the literal Mass contratenor.)
     */
    playContratenor(durBeats, sb, tenorStep, isRest) {
        const contra = this.parts.find(p => !p.vocal && p.role === 'contratenor');
        if (!contra) return;
        const role = this.contraRole;
        if (contra.step === undefined || contra.step === null) contra.step = tenorStep - 4;

        const pick = () => {
            const ivs = [-7, -4, -2, 0, 2, 4];   // 8ve/5th/3rd below · unison · 3rd/5th above
            let best = this.clampStep(contra.step, role), bestCost = Infinity;
            for (const iv of ivs) {
                const cand = tenorStep + iv;
                if (cand < role.lo || cand > role.hi) continue;
                let cost = Math.abs(cand - contra.step) + Math.random() * 0.9;
                if (cand === contra.step) cost += 0.5;
                if (cost < bestCost) { bestCost = cost; best = cand; }
            }
            contra.step = best;
            return best;
        };

        if (isRest || durBeats < 3) {
            // Short values and rest-bridges: a single held tone.
            this.playTenorNote(contra, this.noteFreq(pick(), contra.octave, 0), durBeats * sb * 0.94, 0);
        } else {
            // Long tenor notes: breve + semibreve — the contratenor moves
            // while the tenor stands, thickening the scaffold.
            const d1 = durBeats - 1;
            this.playTenorNote(contra, this.noteFreq(pick(), contra.octave, 0), d1 * sb * 0.94, 0);
            this.playTenorNote(contra, this.noteFreq(pick(), contra.octave, 0), sb * 0.9, d1 * sb);
        }
    }

    start() {
        this.isPlaying = true;
        this.tenorIndex = 0;
        this.inRest = false;
        this.pass = 0;
        this.virelaiPos = 0;
        for (const part of this.parts) { part.step = undefined; part._lastFreq = null; part._cadGoal = null; part._bias = 0; }
        // Pick the piece: 'auto' alternates motet ↔ virelai on successive starts.
        this.activePiece = this.piece === 'auto'
            ? (this._pieceCycle++ % 2 === 0 ? 'motet' : 'virelai')
            : this.piece;
        if (this.activePiece === 'virelai') this.scheduleVirelaiPhrase();
        else this.scheduleTenorNote();
    }

    /** Pin the repertoire: 'motet' · 'virelai' · 'auto' (alternate per start). */
    setPiece(name) {
        if (name === 'motet' || name === 'virelai' || name === 'auto') this.piece = name;
    }

    /**
     * One phrase of "Douce dame jolie", sung note-for-note by the first sung
     * voice through the AbbaA virelai form (refrain · couplet ouvert/clos ·
     * tierce · refrain), with a small breath between phrases and a longer one
     * when the whole form comes round. The instrumental tenor holds a soft
     * D bourdon under the a-phrases and A under the b-phrases (a performance
     * choice — the source is monophonic); in 4-voice mode the contratenor
     * adds the fifth above the bourdon. Pitch is pinned to Dorian.
     */
    scheduleVirelaiPhrase() {
        if (!this.isPlaying || !this.parts.length) return;
        const sb = 30 / this.tempo;
        const key = this.virelaiForm[this.virelaiPos];
        const phrase = this.virelai[key];
        const isB = key === 'bo' || key === 'bc';

        const singer = this.parts.find(p => p.vocal);
        const phraseLen = phrase.reduce((s, n) => s + n[1], 0);

        // Bourdon: tenor on D3 (a-phrases) / A3 (b-phrases); contratenor a 5th up.
        const tenor = this.parts[0];
        if (tenor && !tenor.vocal) {
            this.playTenorNote(tenor, this.noteFreqIn(1, isB ? 4 : 0, 0, 0), phraseLen * sb * 0.96, 0);
        }
        const contra = this.parts.find(p => !p.vocal && p.role === 'contratenor');
        if (contra) {
            this.playTenorNote(contra, this.noteFreqIn(1, isB ? 8 : 4, 0, 0), phraseLen * sb * 0.96, 0);
        }

        if (singer) {
            let t = 0, prevFreq = null, prevStep = null;
            for (let ni = 0; ni < phrase.length; ni++) {
                const [step, len, cents] = phrase[ni];
                const freq = this.noteFreqIn(1, step, 0, cents || 0);
                const vowel = this.virelaiVowels[(this.virelaiPos * 3 + ni) % this.virelaiVowels.length];
                // Legato glide only on adjacent stepwise motion mid-phrase.
                const slide = (prevStep !== null && Math.abs(step - prevStep) === 1) ? prevFreq : null;
                this.playVoiceNote(singer, freq, len * sb * 0.94, t, vowel, slide);
                t += len * sb;
                prevFreq = freq; prevStep = step;
            }
            singer._lastFreq = prevFreq;
        }

        this.virelaiPos = (this.virelaiPos + 1) % this.virelaiForm.length;
        const formEnd = this.virelaiPos === 0;
        const gap = phraseLen * sb + (formEnd ? sb * 2.5 : sb * 0.4);
        this.stepTimeout = setTimeout(() => this.scheduleVirelaiPhrase(), gap * 1000);
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
     * except after the 7th, final talea, which ends straight on D3. The upper
     * voices raise their DOUBLE LEADING TONES over each talea's 3rd note and
     * resolve them exactly on its 4th (the boundary cadence); taleae 3 and 5
     * carry COLORATION (hemiola); talea 6 opens with a strict HOCKET; the last
     * two color notes make the final C#→D over G#→A close. When the color
     * completes, a second pass restates it in DIMINUTION (talea halved), then
     * da capo. In 4-voice mode the contratenor shadows every tenor note and
     * bridges the talea rests.
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
            this.playContratenor(restBeats, sb, anchor, true);   // the contratenor bridges the rest
            this.stepTimeout = setTimeout(() => this.scheduleTenorNote(), restBeats * sb * 1000);
            return;
        }

        const i = this.tenorIndex;
        const taleaPos = i % this.talea.length;
        const taleaIdx = Math.floor(i / this.talea.length);
        const tenorStep = this.color[i];
        const durBeats = dim ? this.talea[taleaPos] / 2 : this.talea[taleaPos];
        const spanSec = durBeats * sb;
        const spanMin = Math.max(1, Math.round(durBeats * 2));
        const isFinal = i === this.color.length - 1;
        const isPenult = i === this.color.length - 2;

        // --- The instrumental tenor: one note of the cantus firmus ---
        const tenor = this.parts[0];
        if (tenor && tenor.role === 'tenor') {
            const freq = this.noteFreq(tenorStep, tenor.octave, 0);
            this.playTenorNote(tenor, freq, spanSec * 0.96, 0);
        }

        // --- The contratenor scaffold (4-voice mode) ---
        this.playContratenor(durBeats, sb, tenorStep, false);

        // --- The sung upper voices, woven across the same span ---
        this.weaveUpperVoices(spanMin, minim, tenorStep, {
            // Leading tones sound over the talea's 3rd note and resolve on its 4th.
            preCadence: (taleaPos === 2 && !isFinal)
                ? { nextStep: this.color[(i + 1) % this.color.length] } : null,
            toFinal: isPenult,
            cadence: taleaPos === this.talea.length - 1 && !isFinal,
            final: isFinal,
            hocket: !dim && taleaIdx === 5 && taleaPos <= 1,          // strict hocket opening talea 6
            coloration: !dim && (taleaIdx === 2 || taleaIdx === 4) && taleaPos <= 1,   // hemiola taleae
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
