const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

/* ================== CONFIG ================== */
const ADMIN_NUMBER = '5573998214536@c.us'; // para receber triagens/avisos
const ADDRESS =
  'Av. Presidente Vargas, 1439\n' +
  'Bairro Santa Clara – Santarém\n' +
  'Clínica CEMED – Sala 06';

const START_HOUR = 8;        // 08:00
const END_HOUR   = 18;       // 18:00
const TZ_OFFSET_MIN = -180;  // UTC-3

/* ================== CLIENT (pronto p/ Railway) ================== */
let SELF_ID = null; // id do próprio bot, para evitar enviar a si mesmo

function createClient() {
  return new Client({
    authStrategy: new LocalAuth(), // no Railway pode perder sessão em reinício
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    },
    webVersionCache: { type: 'local' } // essencial p/ receber mensagens
  });
}

let client = createClient();
initializeClient(client);

function initializeClient(c) {
  c.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📲 Escaneie o QR Code com o WhatsApp');
  });

  c.on('ready', () => {
    try {
      SELF_ID = c.info?.wid?._serialized || null;
      console.log('✅ Bot conectado com sucesso!', SELF_ID ? `ID: ${SELF_ID}` : '');
    } catch {
      console.log('✅ Bot conectado com sucesso!');
    }
  });

  // Reconexão silenciosa
  c.on('disconnected', (reason) => {
    console.log('⚠️ Desconectado:', reason, '→ tentando reconectar em 2s…');
    setTimeout(() => {
      client = createClient();
      initializeClient(client);
      client.initialize();
    }, 2000);
  });

  c.on('auth_failure', (msg) => {
    console.log('⚠️ Falha de autenticação:', msg, '→ reinicializando…');
    setTimeout(() => {
      client = createClient();
      initializeClient(client);
      client.initialize();
    }, 1500);
  });

  c.on('loading_screen', (percent, message) => {
    console.log(`⏳ Carregando ${percent}% - ${message}`);
  });

  c.on('change_state', (state) => {
    console.log('🔁 Estado:', state);
  });

  /* ================== STATE ================== */
  const state = new Map(); // chatId -> { step, data }

  /* ================== HELPERS ================== */
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function isAfterHours() {
    const now = new Date();
    const t = new Date(now.getTime() + TZ_OFFSET_MIN * 60000);
    const day = t.getUTCDay(); // 0=Dom
    const hour = t.getUTCHours();
    const sunday = day === 0;
    const within = hour >= START_HOUR && hour < END_HOUR;
    return sunday || !within;
  }

  function resetChat(chatId) { state.delete(chatId); }
  function ensureChat(chatId) {
    if (!state.has(chatId)) state.set(chatId, { step: 'idle', data: {} });
    return state.get(chatId);
  }

  function chatIdToWaLink(chatId) {
    return 'https://wa.me/' + (chatId || '').split('@')[0];
  }

  async function sendMenu(msg) {
    const txt =
      '👋 Olá! Sou *Dea*, assistente do *Dr. André Franco*.\n' +
      'Como posso ajudar?\n\n' +
      '*1)* Agendar avaliação\n' +
      '*2)* Implante dentário\n' +
      '*3)* Ortodontia / Aparelho\n' +
      '*4)* Localização da clínica\n' +
      '*5)* Falar com atendente\n' +
      '*6)* Outros assuntos\n' +
      '*7)* Clínica geral\n\n' +
      'Digite o número desejado.\n' +
      '_Dica: envie *menu* a qualquer momento para voltar._';
    return msg.reply(txt);
  }

  // Nome + idade (aceita juntos ou separados)
  function parseNomeIdade(rawText) {
    const raw = (rawText || '').trim();
    const idadeMatch = raw.match(/(\d{1,3})\s*(anos)?/i);
    const idade = idadeMatch ? idadeMatch[1] : null;
    let nome = raw;
    if (idadeMatch) {
      nome = raw.slice(0, idadeMatch.index) + raw.slice(idadeMatch.index + idadeMatch[0].length);
    }
    nome = nome
      .replace(/\b(meu nome e|meu nome é|nome|tenho|idade|anos|,|\.|\-|\:)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (nome && nome.length < 2) return { nome: null, idade };
    return { nome: nome || null, idade };
  }

  // Palavras para abrir MENU
  const menuWords = new Set([
    'menu','opcoes','opções','opcao','opção','voltar','começar','comecar','reiniciar',
    'oi','oi tudo bem','ola','olá','ola tudo bem','olá tudo bem',
    'bom dia','boa tarde','boa noite','inicio','início'
  ]);

  // Palavras que enviam AO ATENDENTE imediatamente
  const autoAtendenteTerms = [
    'clareamento','clarear','branquear',
    'quanto custa','valor','valores','preco','preço','custa','custo','forma de pagamento','parcel',
    'siso','extracao','extração','tirar dente',
    'canal','endodontia',
    'protese','prótese','coroa','ponte',
    'restauracao','restauração','obturação','obturacao',
    'limpeza','profilaxia',
    'harmonizacao','harmonização','estetica','estética',
    'enxerto','cirurgia','raio x','raio-x','rx',
    'urgencia','urgência','dor','muita dor','emergencia','emergência',
    'convenio','convênio','plano','plano odontologico','plano odontológico',
    'orcamento','orçamento',
    'crianca','criança','infantil','crianças',
    'tem vaga hoje','pode me ligar','pode ligar',
    'tempo de tratamento','quanto tempo','dói','doi','garantia'
  ];

  /* ================== MAIN ================== */
  c.on('message', async (msg) => {
    const raw = (msg.body || '').trim();
    const text = normalize(raw);
    const chatId = msg.from;

    console.log('📩 Mensagem:', raw, '| de:', chatId);

    if (text === '!ping') return msg.reply('pong!');

    // Saudação → menu (inclusive “é do consultório do dr andré franco?”)
    const isGreeting =
      menuWords.has(text) ||
      (text.includes('consultorio') && text.includes('andre') && text.includes('franco')) ||
      (text.includes('consultório') && text.includes('andré') && text.includes('franco')) ||
      text.includes('e do consultorio do dr andre franco') ||
      text.includes('é do consultório do dr andré franco');

    if (isGreeting) {
      resetChat(chatId);
      return sendMenu(msg);
    }

    if (['cancelar','sair','parar','0'].includes(text)) {
      resetChat(chatId);
      return msg.reply('✅ Conversa cancelada. Digite *menu* para recomeçar.');
    }

    // Aviso fora do horário (suave)
    if (isAfterHours() && !isGreeting) {
      await msg.reply(
        '🕒 *Fora do horário de atendimento*\n' +
        'Atendemos de *segunda a sábado com horário marcado*.\n' +
        'Pode me enviar suas informações e eu encaminho para retorno no próximo período útil.\n\n' +
        'Envie *menu* para começar quando quiser.'
      );
    }

    const ctx = ensureChat(chatId);

    /* ======== TRIAGEM (nome+idade → disponibilidade → telefone) ======== */
    if (ctx.step && ctx.step.startsWith('triage:')) {
      if (menuWords.has(text)) {
        resetChat(chatId);
        return sendMenu(msg);
      }

      if (ctx.step.endsWith(':nomeidade')) {
        const { nome, idade } = parseNomeIdade(raw);
        if (!ctx.data.nome && nome) ctx.data.nome = nome;
        if (!ctx.data.idade && idade) ctx.data.idade = idade;

        if (!ctx.data.nome) {
          return msg.reply('Por favor, informe seu *nome completo*.\n_Ex.: Ana Martins_');
        }
        if (!ctx.data.idade) {
          return msg.reply(`Obrigado, *${ctx.data.nome}*. Agora me diga sua *idade*.\n_Ex.: 32 anos_`);
        }

        ctx.step = ctx.step.replace(':nomeidade', ':disponibilidade');
        return msg.reply(
          `Perfeito, *${ctx.data.nome}* (${ctx.data.idade} anos).\n` +
          'Informe *dia/turno de preferência*.\n_Ex.: Terça à tarde_'
        );
      }

      if (ctx.step.endsWith(':disponibilidade')) {
        if (raw.length < 2) {
          return msg.reply('Pode me dizer seu *dia/turno de preferência*? _Ex.: quinta de manhã._');
        }
        ctx.data.disponibilidade = raw;
        ctx.step = ctx.step.replace(':disponibilidade', ':telefone');
        return msg.reply('Certo! Agora me passe o *telefone para contato*.\n_Ex.: (93) 9XXXX-XXXX_');
      }

      if (ctx.step.endsWith(':telefone')) {
        ctx.data.telefone = raw;

        await msg.reply(
          '✅ *Resumo do pedido*\n' +
          `• Procedimento: ${ctx.data.procedimento}\n` +
          `• Nome: ${ctx.data.nome}\n` +
          `• Idade: ${ctx.data.idade}\n` +
          `• Disponibilidade: ${ctx.data.disponibilidade}\n` +
          `• Telefone: ${ctx.data.telefone}\n\n` +
          'Em breve o atendente entrará em contato.\nDigite *menu* para voltar.'
        );

        // envia ao admin (se não for o próprio bot)
        try {
          const aviso =
            '📥 *Nova triagem*\n' +
            `• Procedimento: ${ctx.data.procedimento}\n` +
            `• Nome: ${ctx.data.nome}\n` +
            `• Idade: ${ctx.data.idade}\n` +
            `• Disponibilidade: ${ctx.data.disponibilidade}\n` +
            `• Telefone: ${ctx.data.telefone}\n` +
            `• Origem: ${chatId}\n` +
            `• Abrir: ${chatIdToWaLink(chatId)}`;

          if (ADMIN_NUMBER && ADMIN_NUMBER !== SELF_ID) {
            await c.sendMessage(ADMIN_NUMBER, aviso);
          } else {
            // se o admin for o mesmo número do bot, manda no próprio chat do paciente
            await c.sendMessage(chatId, '_(Nota interna)_ Encaminhado ao atendente.\n' + aviso);
          }
        } catch (e) { console.log('ADMIN err:', e.message); }

        resetChat(chatId);
        return;
      }

      return msg.reply(
        '❓ Não entendi.\n' +
        '👉 Digite *menu* para ver as opções\n' +
        '👉 Ou *5* / *atendente* para falar com uma pessoa.'
      );
    }

    /* ======= INTENÇÕES (números + palavras) ======= */
    const isAgendar  = text === '1' || text.includes('avaliacao') || text.includes('consulta');
    const isImplante = text === '2' || text.includes('implante');
    const isOrto     = text === '3' || text.includes('aparelho') || text.includes('ortodont');
    const isLocal    = text === '4' || text.includes('local') || text.includes('endereco') || text.includes('endereço');
    const isAtend    = text === '5' || text.includes('atendente') || text.includes('falar com') || text.includes('humano');
    const isOutros   = text === '6' || text.includes('outro');
    const isClinica  = text === '7' || text.includes('clinica geral') || text.includes('clínica geral');

    // Atendente imediato por termos automáticos
    if (autoAtendenteTerms.some(t => text.includes(normalize(t)))) {
      try {
        await msg.reply('✅ Perfeito! Vou te encaminhar para um *atendente humano*. Aguarde um instante.');
        const aviso =
          '📨 *Encaminhado ao atendente (automático por assunto)*\n' +
          `• Origem: ${chatId}\n` +
          `• Mensagem: ${raw}\n` +
          `• Abrir: ${chatIdToWaLink(chatId)}`;

        if (ADMIN_NUMBER && ADMIN_NUMBER !== SELF_ID) {
          await c.sendMessage(ADMIN_NUMBER, aviso);
        } else {
          await c.sendMessage(chatId, '_(Nota interna)_ Encaminhado ao atendente.\n' + aviso);
        }
      } catch (e) { console.log('ADMIN aviso err:', e.message); }
      return;
    }

    // 1) Agendar
    if (isAgendar) {
      const s = ensureChat(chatId);
      s.step = 'triage:agendar:nomeidade';
      s.data = { procedimento: 'Avaliação' };
      return msg.reply(
        '📅 *Agendar avaliação*\n' +
        'Envie *nome e idade*.\n_Ex.: Maria Silva, 30_'
      );
    }

    // 2) Implante
    if (isImplante) {
      const s = ensureChat(chatId);
      s.step = 'triage:implante:nomeidade';
      s.data = { procedimento: 'Implante dentário' };
      return msg.reply(
        '🔩 *Implante dentário*\n' +
        'Envie *nome e idade*.\n_Ex.: João Pereira, 45_'
      );
    }

    // 3) Ortodontia
    if (isOrto) {
      const s = ensureChat(chatId);
      s.step = 'triage:ortodontia:nomeidade';
      s.data = { procedimento: 'Ortodontia / Aparelho' };
      return msg.reply(
        '🦷 *Ortodontia / Aparelho*\n' +
        'Envie *nome e idade*.\n_Ex.: Pedro Souza, 19_'
      );
    }

    // 4) Localização
    if (isLocal) {
      return msg.reply(
        '📍 *Localização da Clínica*\n' +
        `${ADDRESS}\n\n` +
        'Digite *menu* para voltar.'
      );
    }

    // 5) Atendente → imediato
    if (isAtend) {
      try {
        await msg.reply('✅ Perfeito! Vou te encaminhar para um *atendente humano*. Aguarde um instante.');
        const aviso =
          '📨 *Solicitação de atendente (manual)*\n' +
          `• Origem: ${chatId}\n` +
          `• Mensagem: ${raw}\n` +
          `• Abrir: ${chatIdToWaLink(chatId)}`;

        if (ADMIN_NUMBER && ADMIN_NUMBER !== SELF_ID) {
          await c.sendMessage(ADMIN_NUMBER, aviso);
        } else {
          await c.sendMessage(chatId, '_(Nota interna)_ Encaminhado ao atendente.\n' + aviso);
        }
      } catch (e) { console.log('ADMIN aviso err:', e.message); }
      return;
    }

    // 6) Outros → imediato
    if (isOutros) {
      try {
        await msg.reply('✅ Perfeito! Vou te encaminhar para um *atendente humano*. Aguarde um instante.');
        const aviso =
          '📨 *Outros assuntos → atendente*\n' +
          `• Origem: ${chatId}\n` +
          `• Mensagem: ${raw}\n` +
          `• Abrir: ${chatIdToWaLink(chatId)}`;

        if (ADMIN_NUMBER && ADMIN_NUMBER !== SELF_ID) {
          await c.sendMessage(ADMIN_NUMBER, aviso);
        } else {
          await c.sendMessage(chatId, '_(Nota interna)_ Encaminhado ao atendente.\n' + aviso);
        }
      } catch (e) { console.log('ADMIN aviso err:', e.message); }
      return;
    }

    // 7) Clínica geral
    if (isClinica) {
      const s = ensureChat(chatId);
      s.step = 'triage:clinica:nomeidade';
      s.data = { procedimento: 'Clínica geral' };
      return msg.reply(
        '🩺 *Clínica geral*\n' +
        'Envie *nome e idade* para avançar.\n_Ex.: Ana Barbosa, 30_'
      );
    }

    // Fallback
    return msg.reply(
      '❓ Não entendi.\n' +
      '👉 Digite *menu* para ver as opções\n' +
      '👉 Ou *5* / *atendente* para falar com uma pessoa.'
    );
  });

  // Start
  c.initialize();
}
