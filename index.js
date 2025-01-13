require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const axios = require('axios');
const path = require('path');
const winston = require('winston');

const { OPENAI_API_KEY, CHARACTER_NAME, CHARACTER_DESCRIPTION } = process.env;

const openaiApi = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
});

const sessionDir = path.resolve(__dirname, 'session');

const getAuthState = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  return { state, saveCreds };
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'bot.log' }),
  ],
});

const startBot = async () => {
  const { state, saveCreds } = await getAuthState();

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.windows('Firefox'),
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const sender = msg.key.remoteJid;
      const isGroup = sender.endsWith('@g.us');
      const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

      if (!messageContent) continue;

      const isMentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id);
      const isReplyToBot = msg.message.extendedTextMessage?.contextInfo?.participant === sock.user.id;

      if (isGroup && !(isMentioned || isReplyToBot)) continue;

      // Mendapatkan nama pengguna
      const senderId = msg.key.participant || msg.key.remoteJid;
      const contact = await sock.fetchContact(senderId);
      const senderName = contact.notify || contact.name || contact.short || 'Pengguna';

      const prompt = `${CHARACTER_NAME} adalah ${CHARACTER_DESCRIPTION}. Balas dengan gaya santai, menggunakan bahasa yang sama dengan pengguna. Jika pengguna menggunakan bahasa Indonesia, balas dalam bahasa Indonesia. Jika pengguna menggunakan bahasa lain, balas dalam bahasa tersebut.\n\n${senderName}: ${messageContent}\n${CHARACTER_NAME}:`;

      try {
        const response = await openaiApi.post('/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: prompt }],
        });

        const reply = response.data.choices[0].message.content.trim();

        await sock.sendMessage(sender, { text: reply }, { quoted: msg });

        logger.info(`Pesan dari ${senderName} (${senderId}): ${messageContent}`);
        logger.info(`Balasan: ${reply}`);
      } catch (error) {
        logger.error('Error generating response:', error);
      }
    }
  });
};

startBot().catch((err) => logger.error('Bot error:', err));