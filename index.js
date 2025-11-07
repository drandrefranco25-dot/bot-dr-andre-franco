import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@adiwajshing/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

// ====== CONFIGS ======
const CLINIC_NAME = 'Dr. André Franco';
const ATTENDANT_JID = '5573998214536@s.whatsapp.net'; // seu número
const HOURS = 'segunda a sábado com horário marcado';
const ADDRESS = 'Av. Presidente Vargas, 1439 - Santa Clara, Santarém (CEMED, sala 06)';

const greetings = [
  'oi','olá','ola','oi tudo bem','ola tudo bem','tudo bem',
  'bom dia','boa tarde','boa noite','inicio','início'
];

const menuText = () => `
👋 Olá! Sou Dea, assistente do *${CLINIC_NAME}*.

Como posso ajudar?

1) Agendar avaliação
2) Implante dentário
3) Ortodontia / Aparelho
4) Localização da clínica
5) Falar com atendente
6) Outros assuntos
7) Clínica geral

Digite o número desejado.

📌 *Dica:* envie "menu" a qualquer momento para voltar.
`;

async function startBot () {
  console.log('🚀 Iniciando bot (Baileys)…');

  const logger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState('./auth'); // será criado no servidor
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state
  });

  // QR + conexão
  sock.ev.on('connection.update', (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      console.log('\n🔐 QR RAW:\n' + qr + '\n');
      const url = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(qr);
      console.log('🔗 QR LINK (clique):\n' + url + '\n');
      qrcode.generate(qr, { small: true });
      console.log('📲 Escaneie: WhatsApp > Dispositivos conectados > Conectar aparelho\n');
    }

    if (connection === 'open') {
      console.log('✅ Bot conectado com sucesso!');
    } else if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Conexão fechada. Reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Mensagens
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages?.[0];
    if (!m || m.key.fromMe) return;

    const jid = m.key.remoteJid;
    const body =
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      '';
    const raw = (body || '').trim();
    const text = raw.toLowerCase();

    const send = (t) => sock.sendMessage(jid, { text: t });

    // Menu por saudação / comando
    if (text === 'menu' || greetings.some(g => text.includes(g))) {
      return send(menuText());
    }

    // Opções do menu
    if (text === '1') {
      return send(`📅 *Agendar avaliação*\nAtendemos de ${HOURS}.\n\nPor favor, me informe seu *nome completo*.`);
    }
    if (text === '2') {
      return send(`🔩 *Implante dentário*\nPlanejamento seguro e individualizado.\n\nPara avançar, me diga seu *nome completo*.`);
    }
    if (text === '3') {
      return send(`😬 *Ortodontia / Aparelho*\nTratamento personalizado.\n\nPara avançar, me diga seu *nome completo*.`);
    }
    if (text === '4') {
      return send(`📍 *Localização da clínica:*\n${ADDRESS}`);
    }
    if (text === '5' || text.includes('atendente') || text.includes('humano')) {
      await sock.sendMessage(ATTENDANT_JID, {
        text: `📨 *Encaminhado ao atendente*\n• De: ${jid}\n• Mensagem: ${raw}\n\nAbrir chat: https://wa.me/${jid.replace('@s.whatsapp.net','')}`
      });
      return send('✅ Vou te encaminhar para um *atendente humano*. Aguarde um instante.');
    }
    if (text === '6' || text.includes('outro')) {
      await sock.sendMessage(ATTENDANT_JID, {
        text: `📨 *Outros assuntos*\n• De: ${jid}\n• Mensagem: ${raw}\n\nAbrir chat: https://wa.me/${jid.replace('@s.whatsapp.net','')}`
      });
      return send('✅ Encaminhei para um atendente. Aguarde um instante.');
    }
    if (text === '7' || text.includes('clinica geral') || text.includes('clínica geral')) {
      return send(`🦷 *Clínica geral*\nLimpeza, restauração e prevenção.\n\nPara avançar, me diga seu *nome completo*.`);
    }

    // Preço/clareamento → atendente
    if (/(preç|custa|valor|clareament)/.test(text)) {
      await sock.sendMessage(ATTENDANT_JID, {
        text: `💲 *Pergunta de valor/clareamento*\n• De: ${jid}\n• Mensagem: ${raw}\n\nAbrir chat: https://wa.me/${jid.replace('@s.whatsapp.net','')}`
      });
      return send('💬 Vou encaminhar para um atendente humano. Aguarde um instante.');
    }

    // Nome livre (2+ palavras) → agradece
    if (!text.includes('?') && raw.split(' ').length >= 2) {
      return send(`✅ Obrigado, *${raw}*!\nComo posso ajudar agora?\n\nSe quiser, digite *menu*.`);
    }

    // Fallback
    return send(`❓ Não entendi.\nEnvie *menu* para ver as opções ou *5* para falar com atendente.`);
  });
}

startBot();
