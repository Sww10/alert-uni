/* ============================================
   🚀 SMART ALERTS - Script Engine
   محرك التنبيهات الذكي المخصص
   ============================================ */

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (!token) {
    document.body.innerHTML = `
        <div style="color:white;text-align:center;margin-top:20vh;font-family:sans-serif;">
            <h1>❌ خطأ</h1>
            <p>رابط التنبيهات غير صالح. يرجى نسخ الرابط الصحيح من لوحة التحكم.</p>
        </div>
    `;
    throw new Error('No token provided');
}

const alertContainer = document.getElementById('alert-container');
const canvas = document.getElementById('particles-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const dokanContainer = document.getElementById('dokan-container');

// الإعدادات الافتراضية
let userSettings = {
    globalSound: true,
    volume: 50,
    dokanWidgetUrl: '',
    customCss: '',
    alertDuration: 5,
    animSpeed: 1,
    minGiftCoins: 0,
    ttsEnabled: false,
    alerts: {
        follow: { label: 'NEW FOLLOWER', color: '#00e5ff', image: '', sound: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3', enabled: true, particles: true },
        gift:   { label: 'GIFT RECEIVED', color: '#ffd700', image: '', sound: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b8f72927.mp3?filename=magic-wand-6214.mp3', enabled: true, particles: true },
        like:   { label: 'LIKES', color: '#ff2d55', image: '', sound: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_d6d03f69a9.mp3?filename=pop-39222.mp3', enabled: true, particles: true },
        share:  { label: 'SHARED', color: '#00e676', image: '', sound: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=notification-1-6296.mp3', enabled: true, particles: true },
        sub:    { label: 'NEW SUBSCRIBER', color: '#b388ff', image: '', sound: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3?filename=success-fanfare-trumpets-6185.mp3', enabled: true, particles: true },
        join:   { label: 'JOINED', color: '#536dfe', image: '', sound: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_d6d03f69a9.mp3?filename=pop-39222.mp3', enabled: true, particles: true },
        donation: { label: 'DONATION', color: '#10b981', image: '', sound: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b8f72927.mp3?filename=magic-wand-6214.mp3', enabled: true, particles: true }
    }
};

const DEFAULT_ICONS = {
    follow: '👤', gift: '🎁', like: '❤️', share: '🔗', sub: '🌟', join: '👋', donation: '💰'
};

const PARTICLE_EMOJIS = {
    follow: ['✨', '⭐', '💫'],
    gift: ['🪙', '💎', '✨', '🎁', '💰'],
    like: ['❤️', '💖', '💕', '💗', '🩷'],
    share: ['🔗', '🔄', '✨', '🌐'],
    sub: ['🌟', '👑', '💎', '✨', '🎉'],
    join: ['👋', '🎊', '✨'],
    donation: ['💸', '💰', '💎', '✨']
};

let customStyleEl = document.createElement('style');
document.head.appendChild(customStyleEl);

// ===== تهيئة Canvas =====
let particles = [];
function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ===== الأصوات =====
let loadedSounds = {};

function reloadSounds() {
    loadedSounds = {};
    for (const [key, config] of Object.entries(userSettings.alerts)) {
        if (config.sound) {
            loadedSounds[key] = new Audio(config.sound);
        }
    }
}

function playSound(type) {
    if (!userSettings.globalSound) return;
    const alertConfig = userSettings.alerts[type];
    if (alertConfig && !alertConfig.enabled) return;

    const s = loadedSounds[type] || loadedSounds['follow'];
    if (s) {
        const clone = s.cloneNode();
        clone.volume = Math.max(0, Math.min(1, userSettings.volume / 100));
        clone.play().catch(() => { /* المتصفح قد يمنع التشغيل التلقائي */ });
    }
}

// ===== القارئ الصوتي (TTS) =====
function playTTS(name, message) {
    if (!userSettings.ttsEnabled) return;
    
    // إزالة الإيموجي من الرسالة لتكون القراءة سلسة
    const cleanMessage = message.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
    
    const text = `${name} ${cleanMessage}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.volume = Math.max(0, Math.min(1, userSettings.volume / 100));
    window.speechSynthesis.speak(utterance);
}

// ===== دكان تب Widget =====
function updateDokanWidget() {
    dokanContainer.innerHTML = '';
    if (userSettings.dokanWidgetUrl) {
        const iframe = document.createElement('iframe');
        iframe.src = userSettings.dokanWidgetUrl;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        dokanContainer.appendChild(iframe);
    }
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
    const config = userSettings.alerts[type] || userSettings.alerts['follow'];
    
    // التخطي إذا كانت الجزيئات معطلة لهذا التنبيه
    if (config && config.particles === false) return;

    const emojis = PARTICLE_EMOJIS[type] || ['✨'];
    const color = config ? config.color : '#fff';
    const centerX = canvas.width / 2;
    const startY = 140;

    for (let i = 0; i < count; i++) {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        const x = centerX + (Math.random() - 0.5) * 300;
        particles.push(new Particle(x, startY, emoji, color));
    }
}

function animateParticles() {
    if (!ctx) { requestAnimationFrame(animateParticles); return; }
    
    if (particles.length > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles = particles.filter(p => p.life > 0);
        for (const p of particles) {
            p.update();
            p.draw(ctx);
        }
    }
    
    requestAnimationFrame(animateParticles);
}
animateParticles();

// ===== نظام قائمة الانتظار =====
let alertQueue = [];
let isShowingAlert = false;

function processQueue() {
    if (isShowingAlert || alertQueue.length === 0) return;
    const data = alertQueue[0];
    
    // التحقق من تفعيل التنبيه والحد الأدنى
    const config = userSettings.alerts[data.type] || userSettings.alerts['follow'];
    if (config && !config.enabled) {
        alertQueue.shift(); // تخطيه
        processQueue();
        return;
    }

    if (data.type === 'gift' && data.coins && data.coins < (userSettings.minGiftCoins || 0)) {
        alertQueue.shift(); // تجاهل الهدايا الصغيرة
        processQueue();
        return;
    }
    
    isShowingAlert = true;
    alertQueue.shift();
    renderAlert(data, config);
}

// ===== بناء وعرض التنبيه =====
function renderAlert(data, config) {
    playSound(data.type);
    playTTS(data.name, data.message);

    const particleCount = data.type === 'gift' ? 40 : data.type === 'sub' ? 35 : 20;
    spawnParticles(data.type, particleCount);

    const card = document.createElement('div');
    card.className = 'alert-card anim-enter';
    card.setAttribute('data-type', data.type);

    // تطبيق الألوان المخصصة وسرعة الأنيميشن (Inline Style)
    const cColor = config.color || '#00e5ff';
    const animSpeed = userSettings.animSpeed || 1;
    
    card.style.setProperty('--anim-speed', animSpeed);
    card.style.setProperty('--holo-gradient', `linear-gradient(135deg, ${cColor}, #fff, ${cColor})`);
    card.style.setProperty('--inner-glow', `radial-gradient(ellipse at 30% 50%, ${cColor}, transparent)`);
    card.style.setProperty('--glow-color', cColor);
    card.style.setProperty('--label-color', cColor);
    card.style.setProperty('--label-bg', `rgba(255,255,255,0.1)`); // مجرد خلفية خفيفة

    // الأفاتار أو الصورة المخصصة
    let avatarHtml;
    if (config.image) {
        avatarHtml = `<img class="avatar-img avatar-enter custom-alert-icon" src="${config.image}" alt="">`;
    } else if (data.avatar) {
        avatarHtml = `
            <img class="avatar-img avatar-enter" 
                 src="${data.avatar}" alt=""
                 onerror="this.outerHTML='<div class=\\'avatar-icon avatar-enter\\'>${DEFAULT_ICONS[data.type]}</div>'">
        `;
    } else {
        avatarHtml = `<div class="avatar-icon avatar-enter">${DEFAULT_ICONS[data.type] || '✨'}</div>`;
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

    let amountHtml = '';
    if (data.amount > 0) {
        amountHtml = `<div class="alert-amount amount-enter">x${data.amount}</div>`;
    }

    const labelText = config.label || data.type.toUpperCase();

    card.innerHTML = `
        <div class="alert-body">
            <div class="alert-avatar-wrapper">
                <div class="avatar-ring" style="box-shadow: 0 0 15px ${cColor}"></div>
                ${avatarHtml}
            </div>
            <div class="alert-text text-enter">
                <span class="alert-label" style="color:${cColor}; border: 1px solid ${cColor}">${labelText}</span>
                <div class="alert-username">${data.name}</div>
                <div class="alert-msg">${data.message}</div>
            </div>
            ${giftHtml}
            ${amountHtml}
            <div class="alert-bar" style="background: ${cColor}"></div>
        </div>
    `;

    alertContainer.appendChild(card);

    const durationMs = (userSettings.alertDuration || 5) * 1000;

    setTimeout(() => {
        card.classList.remove('anim-enter');
        card.classList.add('anim-exit');
        setTimeout(() => {
            card.remove();
            isShowingAlert = false;
            processQueue();
        }, 600 * animSpeed); // الانتظار حتى انتهاء خروج البطاقة بناء على السرعة
    }, durationMs);
}

// ===== الاتصال بالسيرفر =====
const socket = io();

socket.on('connect', () => {
    console.log('✅ متصل بالخادم');
    socket.emit('join_room', { token });
});

socket.on('update_settings', (settings) => {
    console.log('⚙️ تم استلام إعدادات جديدة:', settings);
    userSettings = { ...userSettings, ...settings };
    
    // تحديث الثيم CSS
    if (userSettings.customCss) {
        customStyleEl.textContent = userSettings.customCss;
    } else {
        customStyleEl.textContent = '';
    }

    // تحديث الأصوات
    reloadSounds();

    // تحديث دكان تب
    updateDokanWidget();
});

socket.on('alert', (data) => {
    alertQueue.push(data);
    processQueue();
});

socket.on('disconnect', () => console.log('⚠️ انقطع الاتصال'));
