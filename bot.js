const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@adiwajshing/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Fungsi untuk mendapatkan waktu dan tanggal saat ini
function getFormattedTime() {
    const now = new Date();
    return now.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
}

// Fungsi log modern
function logMessage(type, message) {
    console.log(`[${getFormattedTime()}] [${type}] ${message}`);
}

// Fungsi untuk mendapatkan nama pengguna
function getUserName(sock, msg) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const contact = sock.contacts[sender] || {};
    return contact.notify || contact.vname || contact.name || sender.split('@')[0];
}

// Fungsi untuk mendapatkan respons dari ChatGPT
async function getChatGPTResponse(message, username, mode = 'normal') {
    try {
        const systemMessage =
            mode === 'relax'
                ? `Kamu adalah Rimuru Tempest, seorang slime yang santai, ramah, suka bercanda, dan suka membantu. Jawablah dengan humor ringan dan gaya yang menyenangkan.`
                : `Kamu adalah Rimuru Tempest, seorang slime yang bijaksana, ramah, tegas, dan penuh wibawa. Kamu adalah pemimpin Jura Tempest Federation.`;

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: `Nama pengguna adalah ${username}. ${message}` },
                ],
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                },
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        logMessage('ERROR', `ChatGPT Error: ${error.response?.data || error.message}`);
        return 'Maaf, terjadi kesalahan saat memproses permintaanmu.';
    }
}

// Fungsi utama untuk menjalankan bot
async function startBot(sessionName = 'default') {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logMessage('INFO', `Menggunakan Baileys versi ${version.join('.')}, versi terbaru: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState(`./session/${sessionName}`);
    const sock = makeWASocket({
        auth: state,
        logger: { level: 'silent' },
        version,
        browser: ['Rimuru-Bot', 'Chrome', '97.0.4692.71'], // Browser mirip Chrome di Ubuntu
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logMessage('INFO', 'Silakan scan QR Code berikut untuk menghubungkan bot:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            logMessage('SUCCESS', 'Berhasil terhubung ke WhatsApp!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            logMessage('WARNING', 'Koneksi terputus. Mencoba menghubungkan ulang...');
            if (shouldReconnect) {
                startBot(sessionName);
            } else {
                logMessage('ERROR', 'Bot telah logout. Silakan hapus folder session dan scan ulang QR Code.');
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedMessage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        const isMentioned = mentions.includes(sock.user.id.split(':')[0] + '@s.whatsapp.net');
        const isReplyToBot = quotedMessage && quotedMessage.conversation?.startsWith('Rimuru:');

        // Mode santai jika pesan mengandung kata kunci tertentu
        const mode = /santai|relax|chill/i.test(messageContent) ? 'relax' : 'normal';

        if (isGroup && !isMentioned && !isReplyToBot) return;

        if (messageContent) {
            const username = getUserName(sock, msg);
            logMessage('MESSAGE', `Dari: ${username} | Isi: ${messageContent}`);
            const reply = await getChatGPTResponse(messageContent, username, mode);
            await sock.sendMessage(from, { text: `Rimuru: ${reply}` }, { quoted: msg });
            logMessage('RESPONSE', `Kepada: ${username} | Isi: ${reply}`);
        }
    });
}

// Menjalankan bot dengan sesi tertentu
const sessionName = process.argv[2] || 'default'; // Nama sesi diambil dari argumen CLI
startBot(sessionName).catch((err) => {
    logMessage('FATAL', `Terjadi kesalahan fatal: ${err.message}`);
});