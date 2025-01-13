const { default: makeWASocket, useMultiFileAuthState } = require('@adiwajshing/baileys');
const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Fungsi untuk mendapatkan respons dari ChatGPT dengan kepribadian Rimuru
async function getChatGPTResponse(message, mode = 'normal') {
    try {
        // Mode normal dan santai
        const systemMessage =
            mode === 'relax'
                ? `Kamu adalah Rimuru Tempest, seorang slime yang sangat santai, ramah, dan suka bercanda. Kamu tidak terlalu formal, sering menggunakan humor ringan, dan membuat percakapan terasa menyenangkan.`
                : `Kamu adalah Rimuru Tempest, seorang slime yang bereinkarnasi di dunia lain dan menjadi raja monster di Jura Tempest Federation. Kamu bijaksana, ramah, santai, tetapi bisa tegas jika diperlukan. Kamu sering menyebut teman-temanmu seperti Shion, Benimaru, dan Veldora.`;

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: message },
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
        console.error('Error from ChatGPT:', error.response?.data || error.message);
        return 'Maaf, terjadi kesalahan saat memproses permintaanmu.';
    }
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./creds.json');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
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
            const reply = await getChatGPTResponse(messageContent, mode);
            await sock.sendMessage(from, { text: `Rimuru: ${reply}` }, { quoted: msg });
        }
    });

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
            console.log('Bot WhatsApp terhubung sebagai Rimuru!');
        } else if (update.connection === 'close') {
            console.log('Koneksi terputus, mencoba menghubungkan ulang...');
            startBot();
        }
    });
}

startBot();