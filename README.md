# Synth Ars Nova — Isorhythmic Sung Motet

A web-based synthesizer that weaves the 14th-century French **Ars Nova** in real time in the browser. No samples, no libraries — the isorhythmic motet was *sung*, so the haunting upper voices are built with **formant vocal synthesis** (a glottal source shaped into sung Latin vowels) over an **isorhythmic** *talea/color* engine carried on a sustained **instrumental tenor**, using only the Web Audio API.

**[Launch the app](https://brendanjameslynskey.github.io/Synth_ArsNova/)** — auto-detects your device and recommends desktop or mobile.

---

## The style

The **Ars Nova** — the "new art" — takes its name from a treatise associated with **Philippe de Vitry** (c. 1322). It broke from the older *Ars Antiqua* by notating duple ("imperfect") time as the equal of triple, and by giving rhythm a precision and independence it had never had. Its towering figure is **Guillaume de Machaut**, poet-composer of ballades, rondeaux, and isorhythmic motets, and author of the *Messe de Nostre Dame* — the first complete polyphonic setting of the Mass ordinary by a single composer.

Its defining device is **isorhythm**: a repeating rhythmic pattern — the *talea* — laid over a repeating series of pitches — the *color*. Where the two are of different lengths they slip out of phase and realign only after many statements (after LCM iterations), scaffolding vast, mathematically-organised structures beneath faster upper voices (cantus, contratenor, triplum).

## How it sounds high quality

The motet was *sung*, so rather than pure tones the engine models the human singing voice with **source–filter (formant) synthesis** for the upper parts, held over a sustained instrumental tenor:

- **Glottal source** — each sung note starts from a glottal-pulse `PeriodicWave` whose harmonics roll off ~1/n^1.1, like the flow through vibrating vocal folds.
- **Formant vocal tract** — each upper voice (cantus · contratenor · triplum) has its **own persistent vocal tract**: a bank of four parallel resonant band-pass **formants** tuned to sung Latin vowels (a e i o u). Only the fold pitch changes from note to note, exactly as in real singing, and each voice sings its own vowel colour (cantus bright *a/e*, contratenor dark *o/u*, triplum *e/i*).
- **Living, haunting choir** — gentle per-note detune/jitter, two folds per note, and vibrato that blooms on held notes give the shimmering, human choral sound. Voices layer additively via the Ensemble control.
- **Instrumental tenor** — the isorhythmic cantus firmus is carried on a mellow **FM bowed/reed/organ** tone: long, sustained notes that ground the sung polyphony above.
- **Isorhythm engine** — the tenor is driven by a repeating *talea* + *color* of different lengths; faster sung voices weave stepwise figures above it. A large chapel-**hall convolution reverb** (~6 s tail with early reflections) sets it in stone.

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
| **Synth Ars Nova** (this) | 14th-c. isorhythm | Formant vocal synthesis (sung upper voices) with an isorhythmic *talea/color* engine over an instrumental tenor |
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
| `arsnova-engine.js` | Formant vocal + isorhythm synthesis engine (Web Audio API) |
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
