const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// تقديم الملفات الثابتة
app.use(express.static(path.join(__dirname)));

// حفظ الاتصالات لكل مستخدم بناءً على التوكن (Token)
// tokens[token] = { tiktokConnection, isConnected, username, settings }
const sessions = new Map();

io.on('connection', (socket) => {
    console.log('🔌 عميل جديد اتصل:', socket.id);

    // تسجيل الدخول (سواء لوحة التحكم أو شاشة التنبيهات)
    socket.on('join_room', ({ token }) => {
        if (!token) return;
        socket.join(token);
        socket.userToken = token;
        
        if (!sessions.has(token)) {
            sessions.set(token, {
                tiktokConnection: null,
                isConnected: false,
                username: '',
                settings: null
            });
        }
        
        const session = sessions.get(token);

        // إرسال الحالة الحالية للعميل المتصل للتو
        socket.emit('status', {
            connected: session.isConnected,
            username: session.username
        });

        if (session.settings) {
            socket.emit('update_settings', session.settings);
        }
    });

    // تحديث الإعدادات
    socket.on('update_settings', (data) => {
        const token = socket.userToken;
        if (!token) return;
        
        const session = sessions.get(token);
        if (session) {
            session.settings = data.settings;
            // إرسال الإعدادات لشاشة التنبيهات الخاصة بهذا التوكن فقط
            io.to(token).emit('update_settings', data.settings);
        }
    });

    // طلب الاتصال ببث تيك توك
    socket.on('connect_tiktok', async (username) => {
        const token = socket.userToken;
        if (!token) return;

        const session = sessions.get(token);
        
        if (session.isConnected && session.tiktokConnection) {
            session.tiktokConnection.disconnect();
        }

        session.username = username.replace('@', '').trim();
        console.log(`\n🎯 [${token}] جاري الاتصال ببث: @${session.username}...`);

        io.to(token).emit('status', { connected: false, username: session.username, connecting: true });

        session.tiktokConnection = new WebcastPushConnection(session.username);

        try {
            const state = await session.tiktokConnection.connect();
            session.isConnected = true;
            console.log(`✅ [${token}] تم الاتصال ببث @${session.username} بنجاح!`);
            
            io.to(token).emit('status', { connected: true, username: session.username, viewers: state.roomInfo?.user_count || 0 });

            // ===== الاستماع للأحداث من البث =====

            session.tiktokConnection.on('follow', (data) => {
                io.to(token).emit('alert', {
                    type: 'follow',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'تابعك الآن! 🎉',
                    amount: 0
                });
            });

            session.tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                const coins = data.diamondCount * (data.repeatCount || 1);
                io.to(token).emit('alert', {
                    type: 'gift',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: `أرسل ${data.giftName} 🎁`,
                    giftName: data.giftName,
                    giftImage: data.giftPictureUrl,
                    amount: data.repeatCount || 1,
                    coins: coins
                });
            });

            session.tiktokConnection.on('like', (data) => {
                io.to(token).emit('alert', {
                    type: 'like',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'أعجب بالبث! ❤️',
                    amount: data.likeCount || 0
                });
            });

            session.tiktokConnection.on('share', (data) => {
                io.to(token).emit('alert', {
                    type: 'share',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'شارك البث مع أصدقائه! 🔗',
                    amount: 0
                });
            });

            session.tiktokConnection.on('subscribe', (data) => {
                io.to(token).emit('alert', {
                    type: 'sub',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'اشترك في القناة! 🌟',
                    amount: 0
                });
            });

            session.tiktokConnection.on('member', (data) => {
                io.to(token).emit('alert', {
                    type: 'join',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'انضم للبث! 👋',
                    amount: 0
                });
            });

            session.tiktokConnection.on('roomUser', (data) => {
                io.to(token).emit('viewers_update', { count: data.viewerCount });
            });

            session.tiktokConnection.on('disconnected', () => {
                session.isConnected = false;
                console.log(`⚠️ [${token}] انقطع الاتصال بالبث.`);
                io.to(token).emit('status', { connected: false, username: session.username });
            });

            session.tiktokConnection.on('error', (err) => {
                console.error(`❌ [${token}] خطأ:`, err.message);
            });

        } catch (err) {
            session.isConnected = false;
            let errorMsg = 'فشل الاتصال بالبث.';
            if (err.message.includes('LIVE has ended') || err.message.includes('not found')) {
                errorMsg = 'البث غير موجود أو انتهى. تأكد أن البث شغال وأن اسم المستخدم صحيح.';
            } else if (err.message.includes('rate limit')) {
                errorMsg = 'كثرة المحاولات، انتظر دقيقة وحاول مرة ثانية.';
            }
            io.to(token).emit('status', { connected: false, username: session.username, error: errorMsg });
        }
    });

    // طلب قطع الاتصال
    socket.on('disconnect_tiktok', () => {
        const token = socket.userToken;
        if (!token) return;
        const session = sessions.get(token);
        if (session && session.tiktokConnection) {
            session.tiktokConnection.disconnect();
            session.isConnected = false;
            console.log(`🔌 [${token}] تم قطع الاتصال يدوياً.`);
            io.to(token).emit('status', { connected: false, username: session.username });
        }
    });

    // طلب تنبيه تجريبي
    socket.on('test_alert', (type) => {
        const token = socket.userToken;
        if (!token) return;
        
        console.log(`🧪 [${token}] تنبيه تجريبي: ${type}`);
        const testAlerts = {
            follow: { type: 'follow', name: 'أحمد الاختبار', username: 'test_user', message: 'تابعك الآن! 🎉', amount: 0 },
            gift: { type: 'gift', name: 'سارة الاختبار', username: 'test_user', message: 'أرسلت وردة 🌹', giftName: 'وردة', amount: 5, coins: 50 },
            like: { type: 'like', name: 'خالد الاختبار', username: 'test_user', message: 'أعجب بالبث! ❤️', amount: 100 },
            share: { type: 'share', name: 'ياسر الاختبار', username: 'test_user', message: 'شارك البث! 🔗', amount: 0 },
            sub: { type: 'sub', name: 'فهد الاختبار', username: 'test_user', message: 'اشترك في القناة! 🌟', amount: 0 },
            join: { type: 'join', name: 'زائر الاختبار', username: 'test_user', message: 'انضم للبث! 👋', amount: 0 },
            donation: { type: 'donation', name: 'داعم كبير', username: 'donor', message: 'تبرع بمبلغ!', amount: 50, currency: 'SAR', giftImage: 'https://cdn-icons-png.flaticon.com/512/3141/3141103.png' }
        };
        io.to(token).emit('alert', testAlerts[type] || testAlerts['follow']);
    });

    socket.on('disconnect', () => {
        console.log('🔌 عميل قطع الاتصال:', socket.id);
    });
});

server.listen(PORT, () => {
    const isRenderUrl = process.env.RENDER_EXTERNAL_URL;
    const baseUrl = isRenderUrl ? isRenderUrl : `http://localhost:${PORT}`;

    console.log(`\n${'='.repeat(55)}`);
    console.log(`🚀 نظام التنبيهات الذكي يعمل كمنصة SaaS بنجاح!`);
    console.log(`${'='.repeat(55)}`);
    console.log(`\n🎮 المنصة الأساسية:    ${baseUrl}/`);
    console.log(`${'='.repeat(55)}\n`);
});
