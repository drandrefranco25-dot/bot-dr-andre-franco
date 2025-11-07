import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";

console.log("✅ Iniciando bot...");

// === CONFIGURAÇÕES ===
const CLINIC_NAME = "Dr. André Franco";
const PHONE_ATTENDANT = "559398214536"; // WhatsApp pessoal

// Inicialização do cliente
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
});

// Mostra QR Code
client.on("qr", (qr) => {
    console.log("📲 Escaneie o QR Code abaixo:");
    qrcode.generate(qr, { small: true });
});

// Quando estiver pronto
client.on("ready", () => {
    console.log("✅ Bot conectado com sucesso!");
});

// ====== LÓGICA DO MENU ======

client.on("message", async (msg) => {
    const txt = msg.body.toLowerCase();

    const send = (t) => client.sendMessage(msg.from, t);

    // SAUDAÇÃO AUTOMÁTICA
    const saudacoes = ["oi", "olá", "ola", "oi tudo bem", "ola tudo bem", "oie"];
    if (saudacoes.includes(txt)) {
        return send(
            `👋 Olá, tudo bem?\nSou Dea, assistente do *${CLINIC_NAME}*.\n\nEm que posso ajudar?\n\n1) Agendar avaliação\n2) Implante dentário\n3) Ortodontia / Aparelho\n4) Localização da clínica\n5) Falar com atendente\n6) Outros assuntos\n7) Clínica geral\n\nDigite o número desejado.\n\n👉 Dica: envie *menu* a qualquer momento para voltar.`
        );
    }

    // MENU
    if (txt === "menu") {
        return send(
            `📋 MENU\n\n1) Agendar avaliação\n2) Implante dentário\n3) Ortodontia / Aparelho\n4) Localização da clínica\n5) Falar com atendente\n6) Outros assuntos\n7) Clínica geral\n\nDigite o número desejado.`
        );
    }

    // OPÇÕES
    switch (txt) {
        case "1":
            return send(
                `📅 *Agendar avaliação*\nAtendemos de *segunda a sábado com horário marcado*.\n\nPor favor, me informe seu *nome completo*.`
            );

        case "2":
            return send(
                `🦷 *Implante dentário*\nPlanejamento seguro e individualizado.\n\nPara avançarmos, diga seu *nome completo*.`
            );

        case "3":
            return send(
                `😃 *Ortodontia / Aparelho*\nTratamento personalizado para seu sorriso.\n\nPor favor, me informe seu nome.`
            );

        case "4":
            return send(
                `📍 *Localização*\nAv. Presidente Vargas, 1439 – Santa Clara – Santarém\nClínica CEMED – Sala 06`
            );

        case "5":
        case "6":
            return send(`✅ Encaminhando para atendimento humano...\nAguarde.`);
        
        case "7":
            return send(
                `🦷 *Clínica Geral*\nRealizamos diversos tratamentos. Para melhor te ajudar, me diga seu nome.`
            );
    }

    // Se perguntar algo fora do menu
    if (
        txt.includes("clareamento") ||
        txt.includes("quanto custa") ||
        txt.includes("preço") ||
        txt.includes("valor")
    ) {
        return send(
            `💬 Vou encaminhar sua mensagem para um atendente humano.\nAguarde um instante.`
        );
    }

    // Se não reconheceu
    return send(
        "❓ Não entendi.\nDigite *menu* para ver as opções ou digite *5* para falar com atendente."
    );
});

// Inicia
client.initialize();
