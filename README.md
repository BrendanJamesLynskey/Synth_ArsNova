# Synth Ars Nova — Isorhythmic Sung Motet

A web-based synthesizer that weaves the 14th-century French **Ars Nova** in real time in the browser. The isorhythmic motet was *sung*, so the haunting upper voices are now **real recorded singing**: the shared [`vocal-voices.js`](vocal-voices.js) library plays actual sung vowels from the [**VocalSet**](https://zenodo.org/records/1193957) corpus (CC BY 4.0), pitch-mapped with **formant-preserving** TD-PSOLA, over an **isorhythmic** *talea/color* engine carried on a sustained **instrumental tenor**. (The earlier pure-synthesis engines, including FOF/*CHANT*, remain available.)

> **Credit:** sampled voices derived from [**VocalSet**](https://zenodo.org/records/1193957) (Wilkins, Seetharaman, Wahl & Pardo, ISMIR 2018), CC BY 4.0.

**[Launch the app](https://brendanjameslynskey.github.io/Synth_ArsNova/)** — auto-detects your device and recommends desktop or mobile.

---

## The style

The **Ars Nova** — the "new art" — takes its name from a treatise associated with **Philippe de Vitry** (c. 1322). It broke from the older *Ars Antiqua* by notating duple ("imperfect") time as the equal of triple, and by giving rhythm a precision and independence it had never had. Its towering figure is **Guillaume de Machaut**, poet-composer of ballades, rondeaux, and isorhythmic motets, and author of the *Messe de Nostre Dame* — the first complete polyphonic setting of the Mass ordinary by a single composer.

Its defining device is **isorhythm**: a repeating rhythmic pattern — the *talea* — laid over a repeating series of pitches — the *color*. Where the two are of different lengths they slip out of phase and realign only after many statements (after LCM iterations), scaffolding vast, mathematically-organised structures beneath faster upper voices (cantus, contratenor, triplum).

## How it sounds high quality

The motet was *sung*, so rather than pure tones the engine voices the upper parts with the shared **FOF vocal-synthesis** library ([`vocal-voices.js`](vocal-voices.js), default technique **FOF** — the IRCAM *CHANT* method), held over a sustained instrumental tenor:

- **FOF grains** — once per glottal period a burst of overlapping damped formant **grains** is fired, reconstructing a true sung vocal spectrum with real Latin-vowel formants (a e i o u). It runs sample-accurately in an `AudioWorklet`.
- **Persistent voices** — each upper voice (cantus · contratenor · triplum) is a small chorus of persistent library singers; only the pitch and vowel change from note to note, exactly as in real singing, and each voice sings its own vowel colour (cantus bright *a/e*, contratenor dark *o/u*, triplum *e/i*).
- **Living, haunting choir** — gentle per-note detune/jitter, two folds per note, and vibrato that blooms on held notes give the shimmering, human choral sound. Voices layer additively via the Ensemble control.
- **Instrumental tenor** — the isorhythmic cantus firmus is carried on a mellow **FM bowed/reed/organ** tone: long, sustained notes that ground the sung polyphony above.
- **Isorhythm engine** — the tenor is driven by a repeating *talea* + *color* of different lengths; faster sung voices weave stepwise figures above it. A soft limiter and a large chapel-**hall convolution reverb** (~6 s tail with early reflections) set it in stone.

## Where it sits — the lineage of early Western music

The Ars Nova is the flowering of the polyphony first raised at Notre-Dame:

```
Plainsong ──► Organum ──► Ars Nova ──► (Renaissance polyphony)
   │  (a 2nd voice   (rhythmic
   │   is added)      independence,
   │                  isorhythm)
   └── its tenors were drawn from plainchant as a cantus firmus
```

A parallel, secular, vernacular branch runs alongside it: **Troubadour** song → instrumental **Estampie** dances.

| App | Style | Synthesis technique |
|---|---|---|
| [Synth Gregorian](https://github.com/BrendanJamesLynskey/Synth_Gregorian) | Plainsong | Source–filter formant vocal synthesis |
| [Synth Organum](https://github.com/BrendanJamesLynskey/Synth_Organum) | Notre-Dame polyphony | FOF vocal synthesis in Pythagorean just intonation |
| **Synth Ars Nova** (this) | 14th-c. isorhythm | FOF vocal synthesis (shared `vocal-voices.js` library, sung upper voices) with an isorhythmic *talea/color* engine over an instrumental tenor |
| [Synth Troubadour](https://github.com/BrendanJamesLynskey/Synth_Troubadour) | Secular monophony | Formant vocal melody over a subtractive drone |
| [Synth Estampie](https://github.com/BrendanJamesLynskey/Synth_Estampie) | Medieval dance | Physical modelling (instrumental dance) |

## Quick start

```bash
git clone https://github.com/BrendanJamesLynskey/Synth_ArsNova.git
cd Synth_ArsNova
python3 -m http.server 8080
```

Open <http://localhost:8080> and press **Sound the Motet**. Any static file server works — there is no build step or dependency.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page — detects device, links to desktop or mobile |
| `desktop.html` | Desktop web app |
| `style.css` | Courtly-Gothic styles (vermilion, royal purple, gold) |
| `vocal-voices.js` | Shared library of interchangeable vocal-synthesis engines (FOF, formant, additive, vocal-tract) |
| `arsnova-engine.js` | Isorhythm engine driving `vocal-voices.js` (sung voices) + FM instrumental tenor (Web Audio API) |
| `app.js` | UI controller, isorhythmic-grid visualizer, gilt motes |
| `arsnova_mobile.html` | Self-contained mobile version (single file) |

## Controls

| Control | Description |
|---|---|
| **Mode** | One of the 8 church tones (Dorian → Hypomixolydian) — the pitch collection |
| **Voice** | Overall ensemble volume |
| **Vocal Colour** | Vocal-formant openness of the sung voices (and the tenor's tone) — from covered to bright and open |
| **Hall Reverb** | Wet/dry mix of the gothic-hall convolution reverb |
| **Pace** | Tactus speed of the upper voices over the isorhythmic tenor |
| **Ensemble** | Duet (2 · Tenor+Cantus), Trio (3 · +Contratenor), Quatre (4 · +Triplum) |

## License

MIT
