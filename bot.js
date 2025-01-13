const { default: makeWASocket, useMultiFileAuthState, generateWAMessageFromContent, DisconnectReason } = require("@adiwajshing/baileys");
const { Configuration, OpenAIApi } = require("openai");
const qrcode = require("qrcode-terminal");

// Konfigurasi OpenAI
const openaiConfig = new Configuration({
    apiKey: "API_KEY_OPENAI", // Ganti dengan API Key OpenAI Anda
});
const openai = new OpenAIApi(openaiConfig);

// Informasi karakter Rimuru Tempest
let character = {
    name: "Rimuru Tempest",
    description: "Aku adalah Rimuru Tempest, seorang slime yang bereinkarnasi ke dunia lain dan akhirnya menjadi Raja Tempest. Santai saja, aku bisa membantumu dengan apa pun!",
};

// Fungsi untuk mengatur karakter
function setCharacter(name, description) {
    character.name = name;
    character.description = description;
}

// Fungsi OpenAI Chat
async function getChatResponse(userMessage, userLanguage) {
    const prompt = `Act as if you are ${character.name}. ${character.description} Respond in the same language as the user. User's message: "${userMessage}"`;
    const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: prompt,
        max_tokens: 150,
        temperature: 0.7,
    });
    return response.data.choices[0].text.trim();
}

// Fungsi utama bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("Kamu telah logout. Silakan scan ulang QR code.");
            } else {
                startBot();
            }
        } else if (connection === "open") {
            console.log("Bot berhasil terhubung!");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");
        const botMention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id);
        const userMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const userLanguage = msg.message.conversation ? "id" : "en";

        if (isGroup && !botMention) return;

        // Dapatkan respon dari ChatGPT
        const reply = await getChatResponse(userMessage, userLanguage);

        // Kirim balasan
        await sock.sendMessage(sender, { text: reply }, { quoted: msg });
    });
}

startBot();
