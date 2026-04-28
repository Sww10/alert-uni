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

// تقديم الملفات الثابتة (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// متغير لحفظ حالة الاتصال
let tiktokConnection = null;
let isConnected = false;
let currentUsername = '';

// ===== Socket.io =====
io.on('connection', (socket) => {
    console.log('🔌 عميل جديد اتصل:', socket.id);

    // إرسال الحالة الحالية للعميل الجديد
    socket.emit('status', {
        connected: isConnected,
        username: currentUsername
    });

    // طلب الاتصال ببث تيك توك
    socket.on('connect_tiktok', async (username) => {
        if (isConnected && tiktokConnection) {
            tiktokConnection.disconnect();
        }

        currentUsername = username.replace('@', '').trim();
        console.log(`\n🎯 جاري الاتصال ببث: @${currentUsername}...`);

        io.emit('status', { connected: false, username: currentUsername, connecting: true });

        tiktokConnection = new WebcastPushConnection(currentUsername);

        try {
            const state = await tiktokConnection.connect();
            isConnected = true;
            console.log(`✅ تم الاتصال ببث @${currentUsername} بنجاح!`);
            console.log(`   👁️ المشاهدين: ${state.roomInfo?.user_count || 0}`);

            io.emit('status', { connected: true, username: currentUsername, viewers: state.roomInfo?.user_count || 0 });

            // ===== الاستماع للأحداث من البث =====

            // 1. متابعة جديدة (Follow)
            tiktokConnection.on('follow', (data) => {
                console.log(`👤 متابعة جديدة: ${data.nickname || data.uniqueId}`);
                io.emit('alert', {
                    type: 'follow',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'تابعك الآن! 🎉',
                    amount: 0
                });
            });

            // 2. هدية (Gift)
            tiktokConnection.on('gift', (data) => {
                // فقط عرض الهدايا المكتملة (عداد الهدايا المتكررة)
                if (data.giftType === 1 && !data.repeatEnd) return;

                const coins = data.diamondCount * (data.repeatCount || 1);
                console.log(`🎁 هدية من ${data.nickname}: ${data.giftName} (${coins} عملة)`);
                io.emit('alert', {
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

            // 3. إعجاب (Like)
            tiktokConnection.on('like', (data) => {
                console.log(`❤️ إعجاب من ${data.nickname}: ${data.likeCount} إعجاب`);
                io.emit('alert', {
                    type: 'like',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'أعجب بالبث! ❤️',
                    amount: data.likeCount || 0
                });
            });

            // 4. مشاركة البث (Share)
            tiktokConnection.on('share', (data) => {
                console.log(`🔗 مشاركة من ${data.nickname}`);
                io.emit('alert', {
                    type: 'share',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'شارك البث مع أصدقائه! 🔗',
                    amount: 0
                });
            });

            // 5. اشتراك (Subscribe)
            tiktokConnection.on('subscribe', (data) => {
                console.log(`🌟 اشتراك جديد: ${data.nickname}`);
                io.emit('alert', {
                    type: 'sub',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'اشترك في القناة! 🌟',
                    amount: 0
                });
            });

            // 6. تعليق (Chat) - اختياري لكنه مفيد
            tiktokConnection.on('chat', (data) => {
                // لا نرسل تنبيه لكل تعليق، فقط نسجله
            });

            // 7. انضمام للبث (Member Join)
            tiktokConnection.on('member', (data) => {
                console.log(`📥 انضم للبث: ${data.nickname}`);
                io.emit('alert', {
                    type: 'join',
                    name: data.nickname || data.uniqueId,
                    username: data.uniqueId,
                    avatar: data.profilePictureUrl,
                    message: 'انضم للبث! 👋',
                    amount: 0
                });
            });

            // تحديث عدد المشاهدين
            tiktokConnection.on('roomUser', (data) => {
                io.emit('viewers_update', { count: data.viewerCount });
            });

            // انقطاع الاتصال
            tiktokConnection.on('disconnected', () => {
                isConnected = false;
                console.log('⚠️ انقطع الاتصال بالبث.');
                io.emit('status', { connected: false, username: currentUsername });
            });

            tiktokConnection.on('error', (err) => {
                console.error('❌ خطأ:', err.message);
            });

        } catch (err) {
            isConnected = false;
            console.error(`❌ فشل الاتصال: ${err.message}`);

            let errorMsg = 'فشل الاتصال بالبث.';
            if (err.message.includes('LIVE has ended') || err.message.includes('not found')) {
                errorMsg = 'البث غير موجود أو انتهى. تأكد أن البث شغال وأن اسم المستخدم صحيح.';
            } else if (err.message.includes('rate limit')) {
                errorMsg = 'كثرة المحاولات، انتظر دقيقة وحاول مرة ثانية.';
            }

            io.emit('status', { connected: false, username: currentUsername, error: errorMsg });
        }
    });

    // طلب قطع الاتصال
    socket.on('disconnect_tiktok', () => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
            isConnected = false;
            console.log('🔌 تم قطع الاتصال يدوياً.');
            io.emit('status', { connected: false, username: currentUsername });
        }
    });

    // طلب تنبيه تجريبي
    socket.on('test_alert', (type) => {
        console.log(`🧪 تنبيه تجريبي: ${type}`);
        const testAlerts = {
            follow: { type: 'follow', name: 'أحمد الاختبار', username: 'test_user', message: 'تابعك الآن! 🎉', amount: 0 },
            gift: { type: 'gift', name: 'سارة الاختبار', username: 'test_user', message: 'أرسلت وردة 🌹', giftName: 'وردة', amount: 5, coins: 50 },
            like: { type: 'like', name: 'خالد الاختبار', username: 'test_user', message: 'أعجب بالبث! ❤️', amount: 100 },
            share: { type: 'share', name: 'ياسر الاختبار', username: 'test_user', message: 'شارك البث! 🔗', amount: 0 },
            sub: { type: 'sub', name: 'فهد الاختبار', username: 'test_user', message: 'اشترك في القناة! 🌟', amount: 0 },
            join: { type: 'join', name: 'زائر الاختبار', username: 'test_user', message: 'انضم للبث! 👋', amount: 0 },
        };
        io.emit('alert', testAlerts[type] || testAlerts['follow']);
    });

    socket.on('disconnect', () => {
        console.log('🔌 عميل قطع الاتصال:', socket.id);
    });
});

// تشغيل الخادم
server.listen(PORT, () => {
    console.log(`\n${'='.repeat(55)}`);
    console.log(`🚀 نظام التنبيهات الذكي يعمل بنجاح!`);
    console.log(`${'='.repeat(55)}`);
    console.log(`\n🎮 لوحة التحكم:       http://localhost:${PORT}/`);
    console.log(`📺 شاشة التنبيهات:    http://localhost:${PORT}/alert.html`);
    console.log(`\n💡 ضع رابط شاشة التنبيهات في TikTok Live Studio`);
    console.log(`${'='.repeat(55)}\n`);
});
