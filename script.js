/* ============================================
   🚀 SMART ALERTS - Script Engine
   محرك التنبيهات الذكي مع جزيئات متطايرة
   ============================================ */

const alertContainer = document.getElementById('alert-container');
const canvas = document.getElementById('particles-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const socket = io();

// ===== تهيئة Canvas =====
let particles = [];
function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ===== إعدادات كل نوع تنبيه =====
const ALERT_CONFIG = {
    follow: {
        icon: '👤',
        label: 'NEW FOLLOWER',
        particleColor: '#00e5ff',
        particleEmoji: ['✨', '⭐', '💫'],
    },
    gift: {
        icon: '🎁',
        label: 'GIFT RECEIVED',
        particleColor: '#ffd700',
        particleEmoji: ['🪙', '💎', '✨', '🎁', '💰'],
    },
    like: {
        icon: '❤️',
        label: 'LIKES',
        particleColor: '#ff2d55',
        particleEmoji: ['❤️', '💖', '💕', '💗', '🩷'],
    },
    share: {
        icon: '🔗',
        label: 'SHARED',
        particleColor: '#00e676',
        particleEmoji: ['🔗', '🔄', '✨', '🌐'],
    },
    sub: {
        icon: '🌟',
        label: 'NEW SUBSCRIBER',
        particleColor: '#b388ff',
        particleEmoji: ['🌟', '👑', '💎', '✨', '🎉'],
    },
    join: {
        icon: '👋',
        label: 'JOINED',
        particleColor: '#536dfe',
        particleEmoji: ['👋', '🎊', '✨'],
    }
};

// ===== أصوات التنبيهات =====
const SOUNDS = {};
function loadSounds() {
    const urls = {
        follow: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3',
        gift:   'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b8f72927.mp3?filename=magic-wand-6214.mp3',
        like:   'https://cdn.pixabay.com/download/audio/2021/08/09/audio_d6d03f69a9.mp3?filename=pop-39222.mp3',
        share:  'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=notification-1-6296.mp3',
        sub:    'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3?filename=success-fanfare-trumpets-6185.mp3',
        join:   'https://cdn.pixabay.com/download/audio/2021/08/09/audio_d6d03f69a9.mp3?filename=pop-39222.mp3',
    };
    for (const [key, url] of Object.entries(urls)) {
        SOUNDS[key] = new Audio(url);
        SOUNDS[key].volume = 0.5;
    }
}
loadSounds();

function playSound(type) {
    const s = SOUNDS[type] || SOUNDS['follow'];
    const clone = s.cloneNode();
    clone.volume = 0.5;
    clone.play().catch(() => {});
}

// ===== نظام الجزيئات المتطايرة =====
class Particle {
    constructor(x, y, emoji, color) {
        this.x = x;
        this.y = y;
        this.emoji = emoji;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = -(Math.random() * 8 + 4);
        this.gravity = 0.15;
        this.life = 1;
        this.decay = Math.random() * 0.015 + 0.008;
        this.size = Math.random() * 16 + 14;
        this.rotation = Math.random() * 360;
        this.rotSpeed = (Math.random() - 0.5) * 8;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= 0.98;
        this.life -= this.decay;
        this.rotation += this.rotSpeed;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.font = `${this.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);
        ctx.restore();
    }
}

function spawnParticles(type, count = 25) {
    if (!ctx) return;
    const config = ALERT_CONFIG[type] || ALERT_CONFIG['follow'];
    const centerX = canvas.width / 2;
    const startY = 140;

    for (let i = 0; i < count; i++) {
        const emoji = config.particleEmoji[Math.floor(Math.random() * config.particleEmoji.length)];
        const x = centerX + (Math.random() - 0.5) * 300;
        particles.push(new Particle(x, startY, emoji, config.particleColor));
    }
}

function animateParticles() {
    if (!ctx) { requestAnimationFrame(animateParticles); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
        p.update();
        p.draw(ctx);
    }

    requestAnimationFrame(animateParticles);
}
animateParticles();

// ===== نظام قائمة الانتظار =====
let alertQueue = [];
let isShowingAlert = false;

function processQueue() {
    if (isShowingAlert || alertQueue.length === 0) return;
    isShowingAlert = true;
    const data = alertQueue.shift();
    renderAlert(data);
}

// ===== بناء وعرض التنبيه =====
function renderAlert(data) {
    const config = ALERT_CONFIG[data.type] || ALERT_CONFIG['follow'];

    // صوت
    playSound(data.type);

    // جزيئات
    const particleCount = data.type === 'gift' ? 40 : data.type === 'sub' ? 35 : 20;
    spawnParticles(data.type, particleCount);

    // بناء HTML
    const card = document.createElement('div');
    card.className = 'alert-card anim-enter';
    card.setAttribute('data-type', data.type);

    // الأفاتار
    let avatarHtml;
    if (data.avatar) {
        avatarHtml = `
            <img class="avatar-img avatar-enter" 
                 src="${data.avatar}" alt=""
                 onerror="this.outerHTML='<div class=\\'avatar-icon avatar-enter\\'>${config.icon}</div>'">
        `;
    } else {
        avatarHtml = `<div class="avatar-icon avatar-enter">${config.icon}</div>`;
    }

    // صورة الهدية
    let giftHtml = '';
    if (data.giftImage) {
        giftHtml = `
            <div class="gift-visual gift-enter">
                <img class="gift-img" src="${data.giftImage}" alt="${data.giftName || ''}">
            </div>
        `;
    }

    // العدد
    let amountHtml = '';
    if (data.amount > 0) {
        amountHtml = `<div class="alert-amount amount-enter">x${data.amount}</div>`;
    }

    card.innerHTML = `
        <div class="alert-body">
            <div class="alert-avatar-wrapper">
                <div class="avatar-ring"></div>
                ${avatarHtml}
            </div>
            <div class="alert-text text-enter">
                <span class="alert-label">${config.label}</span>
                <div class="alert-username">${data.name}</div>
                <div class="alert-msg">${data.message}</div>
            </div>
            ${giftHtml}
            ${amountHtml}
            <div class="alert-bar"></div>
        </div>
    `;

    alertContainer.appendChild(card);

    // إزالة بعد 5 ثواني
    setTimeout(() => {
        card.classList.remove('anim-enter');
        card.classList.add('anim-exit');
        setTimeout(() => {
            card.remove();
            isShowingAlert = false;
            processQueue();
        }, 600);
    }, 5000);
}

// ===== الاستماع من Socket.io =====
socket.on('alert', (data) => {
    alertQueue.push(data);
    processQueue();
});

socket.on('connect', () => console.log('✅ متصل بالخادم'));
socket.on('disconnect', () => console.log('⚠️ انقطع الاتصال'));
