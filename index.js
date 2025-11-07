client.on('qr', (qr) => {
    console.log("🔐 QR RAW:");
    console.log(qr);
});

// ====== CONFIG ======
const CLINIC_NAME = "Dr. André Franco";
const ATTENDANT_PHONE = "5573998214536"; // seu número sem "+"; o @c.us será adicionado
const HOURS = "segunda a sábado com horário marcado";
const ADDRESS = "Av. Presidente Vargas, 1439 - Santa Clara, Santarém (CEMED, sala 06)";

// ====== CLIENT (config especial para Railway) ======
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    channel: "chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-first-run",
      "--no-zygote",
      "--single-process"
    ]
  },
  webVersionCache: { type: "local" }
});

// ===== ✅ EXIBIR QR COM LINK CLICÁVEL =====
client.on("qr", (qr) => {
  // Raw data
  console.log("\n=== QR RAW START ===");
  console.log(qr);
  console.log("=== QR RAW END ===\n");

  // Link pronto para imagem (NOVIDADE!)
  const imgUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=" +
    encodeURIComponent(qr);

  console.log("🔗 Abra este link para ver o QR como IMAGEM:");
  console.log(imgUrl + "\n");

  // QR ASCII
  qrcode.generate(qr, { small: true });

  console.log("📲 Escaneie o QR Code com o WhatsApp");
});

// ====== EVENTOS ======
client.on("ready", () => {
  console.log("✅ Bot conectado com sucesso!");
});

client.on("auth_failure", () => {
  console.log("❌ Falha de autenticação — escaneie o QR novamente.");
});

// ====== HELPER ======
function menu() {
  return `
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
}

async function sendToHuman(msg, original) {
  try {
    await client.sendMessage(
      `${ATTENDANT_PHONE}@c.us`,
      `📨 *Encaminhado ao atendente*\n• De: ${msg.from}\n• Mensagem: ${original}\n\nAbrir chat: https://wa.me/${msg.from.split("@")[0]}`
    );
  } catch (e) {
    console.log("Erro ao notificar atendente:", e.message);
  }

  await msg.reply(
    "✅ Vou te encaminhar para um *atendente humano*. Aguarde um instante."
  );
}

// Palavras que chamam menu
const greetings = [
  "oi",
  "olá",
  "ola",
  "oi tudo bem",
  "ola tudo bem",
  "tudo bem",
  "bom dia",
  "boa tarde",
  "boa noite",
  "início",
  "inicio"
];

// ====== LÓGICA ======
client.on("message", async (msg) => {
  const raw = (msg.body || "").trim();
  const text = raw.toLowerCase();

  // Saudação → Menu
  if (text === "menu" || greetings.some((g) => text.includes(g))) {
    return msg.reply(menu());
  }

  // Preço / clareamento → atendente
  if (/(preç|custa|valor|clareament)/.test(text)) {
    return sendToHuman(msg, raw);
  }

  // Opções do menu
  if (text === "1") {
    return msg.reply(
      `📅 *Agendar avaliação*\nAtendemos de ${HOURS}.\n\nPor favor, me informe seu *nome completo*.`
    );
  }

  if (text === "2") {
    return msg.reply(
      `🔩 *Implante dentário*\nPlanejamento seguro e individualizado.\n\nPara avançar, me diga seu *nome completo*.`
    );
  }

  if (text === "3") {
    return msg.reply(
      `😬 *Ortodontia / Aparelho*\nTratamento personalizado.\n\nPara avançar, me diga seu *nome completo*.`
    );
  }

  if (text === "4") {
    return msg.reply(`📍 *Localização da clínica:*\n${ADDRESS}`);
  }

  if (text === "5" || text.includes("atendente") || text.includes("humano")) {
    return sendToHuman(msg, raw);
  }

  if (text === "6" || text.includes("outro")) {
    return sendToHuman(msg, raw);
  }

  if (text === "7" || text.includes("clinica geral") || text.includes("clínica geral")) {
    return msg.reply(
      `🦷 *Clínica geral*\nLimpeza, restauração e prevenção.\n\nPara avançar, me diga seu *nome completo*.`
    );
  }

  // Se mandou nome (2+ palavras) → agradece
  if (!text.includes("?") && raw.split(" ").length >= 2) {
    return msg.reply(
      `✅ Obrigado, *${raw}*!\nComo posso ajudar agora?\n\nSe quiser, digite *menu*.`
    );
  }

  // Não entendeu
  return msg.reply(
    `❓ Não entendi.\nEnvie *menu* para ver as opções ou *5* para falar com atendente.`
  );
});

// =========== START ===========
client.initialize();
