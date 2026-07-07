# Synth Ars Nova — Isorhythmic FM Synthesizer

A web-based synthesizer that weaves the 14th-century French **Ars Nova** in real time in the browser. No samples, no libraries — the reedy medieval winds and buzzy organ timbres are built with true **FM (frequency-modulation) synthesis**, over an **isorhythmic** tenor, using only the Web Audio API.

**[Launch the app](https://brendanjameslynskey.github.io/Synth_ArsNova/)** — auto-detects your device and recommends desktop or mobile.

---

## The style

The **Ars Nova** — the "new art" — takes its name from a treatise associated with **Philippe de Vitry** (c. 1322). It broke from the older *Ars Antiqua* by notating duple ("imperfect") time as the equal of triple, and by giving rhythm a precision and independence it had never had. Its towering figure is **Guillaume de Machaut**, poet-composer of ballades, rondeaux, and isorhythmic motets, and author of the *Messe de Nostre Dame* — the first complete polyphonic setting of the Mass ordinary by a single composer.

Its defining device is **isorhythm**: a repeating rhythmic pattern — the *talea* — laid over a repeating series of pitches — the *color*. Where the two are of different lengths they slip out of phase and realign only after many statements (after LCM iterations), scaffolding vast, mathematically-organised structures beneath faster upper voices (cantus, contratenor, triplum).

## How it sounds high quality

Rather than pure tones, the engine voices each part with **true FM synthesis** — a carrier oscillator whose frequency is modulated by a second oscillator:

- **Carrier + modulator** — every note is a real carrier/modulator pair. The **carrier:modulator ratio** sets the timbre family; the **modulation index** (the modulator's depth in Hz on the carrier frequency) sets its brightness and buzz.
- **Reedy attack** — the modulation index is *enveloped* per note: a fast-decaying burst at onset gives the double-reed bite of a shawm before settling to a rounder sustain.
- **Three FM presets** — a **shawm / bombarde** (ratio ≈ 2.5, high index, bright buzzy double reed), a **portative organ** (ratio 1, moderate index, rounder), and a **medieval fiddle / cantus** (ratio ≈ 1.5), plus a triplum blend. Each note carries an amplitude ADSR, subtle vibrato, and per-note detune jitter so the ensemble is a living sound.
- **Isorhythm engine** — the tenor is driven by a repeating *talea* + *color* of different lengths; faster cantus / contratenor / triplum voices weave stepwise figures above it. A large gothic-**hall convolution reverb** (~6 s tail with early reflections) sets it in stone.

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
| [Synth Organum](https://github.com/BrendanJamesLynskey/Synth_Organum) | Notre-Dame polyphony | Additive synthesis in Pythagorean just intonation |
| **Synth Ars Nova** (this) | 14th-c. isorhythm | FM synthesis |
| [Synth Troubadour](https://github.com/BrendanJamesLynskey/Synth_Troubadour) | Secular monophony | Subtractive synthesis |
| [Synth Estampie](https://github.com/BrendanJamesLynskey/Synth_Estampie) | Medieval dance | Physical modelling |

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
| `arsnova-engine.js` | FM + isorhythm synthesis engine (Web Audio API) |
| `app.js` | UI controller, isorhythmic-grid visualizer, gilt motes |
| `arsnova_mobile.html` | Self-contained mobile version (single file) |

## Controls

| Control | Description |
|---|---|
| **Mode** | One of the 8 church tones (Dorian → Hypomixolydian) — the pitch collection |
| **Voice** | Overall ensemble volume |
| **FM Timbre** | Global FM modulation index — from rounded to bright, reedy and buzzy |
| **Hall Reverb** | Wet/dry mix of the gothic-hall convolution reverb |
| **Pace** | Tactus speed of the upper voices over the isorhythmic tenor |
| **Ensemble** | Duet (2 · Tenor+Cantus), Trio (3 · +Contratenor), Quatre (4 · +Triplum) |

## License

MIT
