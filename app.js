/**
 * Synth Ars Nova — UI Controller
 */

const engine = new ArsNovaEngine();
if (typeof window !== "undefined") window.engine = engine;
let animationId = null;
let isChanting = false;

// === Transport ===

async function toggleChant() {
    const btn = document.getElementById('btnChant');
    const icon = document.getElementById('mainIcon');

    if (!isChanting) {
        await engine.begin();
        isChanting = true;
        btn.classList.add('playing');
        btn.querySelector('.btn-text').textContent = 'Silence';
        btn.querySelector('.btn-icon').textContent = '■';
        icon.classList.add('active');
        startVisualization();
        startMotes();
    } else {
        engine.end();
        isChanting = false;
        btn.classList.remove('playing');
        btn.querySelector('.btn-text').textContent = 'Sound the Motet';
        btn.querySelector('.btn-icon').textContent = '♪';
        icon.classList.remove('active');
        stopVisualization();
    }
}

// === Controls ===

function setMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${mode}"]`).classList.add('active');
    engine.setMode(mode);
}

function setVoices(count) {
    document.querySelectorAll('.choir-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.choir-btn[data-voices="${count}"]`).classList.add('active');
    engine.setVoices(count);
}

function updateVoice() { engine.setVoiceVolume(document.getElementById('voiceVol').value / 100); }
function updateBright() { engine.setBrightness(document.getElementById('brightAmt').value / 100); }
function updateReverb() { engine.setReverbMix(document.getElementById('reverbMix').value / 100); }
function updateTempo() { engine.setTempo(parseInt(document.getElementById('tempoSlider').value)); }

// === Visualization: an isorhythmic grid of gilded light ===

function startVisualization() {
    const canvas = document.getElementById('vizCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    function draw() {
        animationId = requestAnimationFrame(draw);
        const waveData = engine.getAnalyserData();
        const freqData = engine.getFrequencyData();
        if (!waveData || !freqData) return;

        ctx.fillStyle = 'rgba(13, 8, 18, 0.3)';
        ctx.fillRect(0, 0, width, height);

        // Four faint tenor-grid lines (the isorhythmic scaffold)
        ctx.strokeStyle = 'rgba(200, 168, 78, 0.12)';
        ctx.lineWidth = 1;
        for (let l = 1; l <= 4; l++) {
            const y = height * (0.25 + l * 0.11);
            ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(width - 20, y); ctx.stroke();
        }

        // Frequency bars as gilded gothic tracery
        const barCount = 72;
        const barWidth = width / barCount;
        const freqStep = Math.floor(freqData.length / barCount);
        for (let i = 0; i < barCount; i++) {
            const value = freqData[i * freqStep] / 255;
            const barHeight = value * height * 0.7;
            const x = i * barWidth;
            const g = ctx.createLinearGradient(x, height, x, height - barHeight);
            g.addColorStop(0, `rgba(200, 168, 78, ${0.1 + value * 0.4})`);
            g.addColorStop(0.5, `rgba(158, 74, 140, ${value * 0.4})`);
            g.addColorStop(1, `rgba(198, 43, 58, ${value * 0.3})`);
            ctx.fillStyle = g;
            ctx.fillRect(x + 1, height - barHeight, barWidth - 2, barHeight);
        }

        // Flowing waveform — the melisma of the upper voices
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(240, 214, 122, 0.6)';
        ctx.lineWidth = 1.5;
        const slice = width / waveData.length;
        let x = 0;
        for (let i = 0; i < waveData.length; i++) {
            const v = waveData[i] / 128.0;
            const y = (v * height) / 2;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            x += slice;
        }
        ctx.stroke();
    }
    draw();
}

function stopVisualization() {
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    const canvas = document.getElementById('vizCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth, height = canvas.offsetHeight;
    let alpha = 1;
    function fade() {
        ctx.fillStyle = 'rgba(13, 8, 18, 0.05)';
        ctx.fillRect(0, 0, width, height);
        alpha -= 0.02;
        if (alpha > 0) requestAnimationFrame(fade);
    }
    fade();
}

// === Floating gilt motes ===

let motesInterval = null;
function startMotes() {
    const container = document.getElementById('incenseContainer');
    if (motesInterval) return;
    motesInterval = setInterval(() => {
        if (!isChanting) return;
        const p = document.createElement('div');
        p.className = 'smoke-particle';
        p.style.left = (30 + Math.random() * (window.innerWidth - 60)) + 'px';
        p.style.bottom = '0px';
        p.style.setProperty('--drift', ((Math.random() - 0.5) * 90) + 'px');
        const dur = 7 + Math.random() * 8;
        p.style.animationDuration = dur + 's';
        const s = 3 + Math.random() * 4;
        p.style.width = s + 'px'; p.style.height = s + 'px';
        container.appendChild(p);
        setTimeout(() => p.remove(), dur * 1000);
    }, 340);
}

window.addEventListener('resize', () => { if (isChanting) { stopVisualization(); startVisualization(); } });

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('vizCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.fillStyle = 'rgba(13, 8, 18, 1)';
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    ctx.strokeStyle = 'rgba(200, 168, 78, 0.12)';
    ctx.lineWidth = 1;
    for (let l = 1; l <= 4; l++) {
        const y = canvas.offsetHeight * (0.25 + l * 0.11);
        ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(canvas.offsetWidth - 20, y); ctx.stroke();
    }
    ctx.font = '14px Cinzel, serif';
    ctx.fillStyle = 'rgba(200, 168, 78, 0.35)';
    ctx.textAlign = 'center';
    ctx.fillText('Press "Sound the Motet" to begin', canvas.offsetWidth / 2, canvas.offsetHeight / 2 + 4);
});
