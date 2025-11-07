// CommonJS (compatível com seu package.json)
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🚀 Iniciando bot (teste mínimo)...');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    channel: 'chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ]
  },
  webVersionCache: { type: 'local' }
});

// NENHUMA outra linha usando `client` deve vir antes desta definição ↑↑↑

client.on('qr', (qr) => {
  console.log('🔐 QR RAW:');
  console.log(qr);
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(qr);
  console.log('🔗 QR LINK:', url);
  qrcode.generate(qr, { small: true });
  console.log('📲 Escaneie o QR Code');
});

client.on('ready', () => {
  console.log('✅ READY: Bot conectado com sucesso!');
});

client.initialize();
