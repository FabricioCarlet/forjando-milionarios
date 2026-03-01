require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');
const app = express();
const db = require('./src/database/db');
const path = require('path');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuração do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "forja_extrema", dataPath: './sessoes' }), 
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions'] 
    }
});

const limpar = (n) => n ? n.replace(/\D/g, '') : '';

// Middleware de Blindagem: Valida ADMIN_SENHA nos headers
const authAdmin = (req, res, next) => {
    const senhaAcesso = req.headers['x-admin-pass'];
    if (senhaAcesso === process.env.ADMIN_SENHA) {
        next();
    } else {
        console.warn(`🚨 Tentativa de acesso não autorizado de IP: ${req.ip}`);
        res.status(403).json({ erro: "Acesso Negado: Senha Administrativa Inválida." });
    }
};

async function enviarWhatsApp(numero, mensagem) {
    try {
        let numLimpo = limpar(numero);
        if (!numLimpo.startsWith('55')) numLimpo = '55' + numLimpo;
        const chatId = numLimpo.includes('@c.us') ? numLimpo : `${numLimpo}@c.us`;

        // Verifica se o cliente está pronto antes de enviar
        if (client.info && client.info.wid) {
            // Pequeno delay de 2 segundos para evitar o erro de "Detached Frame"
            await new Promise(resolve => setTimeout(resolve, 2000));
            await client.sendMessage(chatId, mensagem);
            console.log(`✅ Mensagem enviada para ${numLimpo}`);
        } else {
            console.error("❌ WhatsApp ainda não está pronto para enviar.");
        }
    } catch (e) { 
        console.error(`❌ Erro WhatsApp: ${e.message}`);
        // Se der erro de frame, tentamos reinicializar o estado interno se necessário
    }
}

// LOGICA DE VARREDURA 72H
async function executarVarredura72h() {
    console.log("⚙️ Varredura de Regras em execução...");
    try {
        const agora = new Date();
        const participantes = await db.listarTudo();
        const numeroAdmin = process.env.ADMIN_WHATSAPP;

        for (let u of participantes) {
            if (u.status !== 'ativo' || !u.dataAtivacao) continue;
            
            const diffHoras = (agora - new Date(u.dataAtivacao)) / (1000 * 60 * 60);
            const amigosAtivos = await db.collection.countDocuments({ indicadoPor: u.numero, status: 'ativo' });

            // Se o usuário já completou o ciclo (2 amigos), ele está seguro nesta fase
            if (amigosAtivos >= 2) continue;

            // REGRA 72H: EXCLUSÃO AUTOMÁTICA
            if (diffHoras >= 72) {
                await enviarWhatsApp(u.numero, "💀 *TEMPO ESGOTADO!*\nInfelizmente você não cumpriu o ciclo de 72h e sua conta foi removida. Seus indicados agora pertencem ao Admin.");
                await db.adotarOrfaos(u.numero.split('@')[0], numeroAdmin);
                await db.removerPorExpiracao(u.numero);
                console.log(`💀 Usuário Removido: ${u.numero}`);
            } 
            // REGRA 70H: ALERTA VERMELHO (2 HORAS RESTANTES)
            // REGRA 72H: EXCLUSÃO DEFINITIVA
            if (diffHoras >= 72) {
                await enviarWhatsApp(u.numero, "💀 *TEMPO ESGOTADO!*\nInfelizmente você não cumpriu o ciclo de 72h e sua conta foi removida. Seus indicados agora pertencem ao Admin.");
                await db.adotarOrfaos(u.numero.split('@')[0], numeroAdmin);
                await db.removerPorExpiracao(u.numero);
                console.log(`💀 Usuário Removido: ${u.numero}`);
            } 
            
            // REGRA 70H: MENSAGEM VERMELHA (O ÚLTIMO AVISO PERSUASIVO)
            else if (diffHoras >= 70 && diffHoras < 71) {
                const msg70h = `🚨 *AVISO DE EXCLUSÃO IMINENTE* 🚨\n\nOlá, *${u.nome}*!\nEste é o seu **último contato** antes da remoção definitiva.\n\n⏰ *VOCÊ TEM APENAS 120 MINUTOS!*\n\nAs regras foram claras e o seu tempo está acabando. Se não agir agora:\n1. Sua conta será **DELETADA** permanentemente.\n2. Você perderá sua posição rumo ao milhão.\n3. Seus indicados passarão a pertencer ao Admin.\n\n👉 *CADASTRE SEUS 2 AMIGOS AGORA!*`;
                await enviarWhatsApp(u.numero, msg70h);
            }

            // REGRA 48H: SEGUNDA ADVERTÊNCIA (AVISO AMARELO)
            else if (diffHoras >= 48 && diffHoras < 49) {
                await enviarWhatsApp(u.numero, "⚠️ *SEGUNDA ADVERTÊNCIA:* \nJá se passaram 48h. Você ainda precisa de 2 amigos ativos para garantir sua vaga no Forjando Milionários! Não pare agora.");
            }

            // REGRA 24H: PRIMEIRA ADVERTÊNCIA (AVISO AMARELO)
            else if (diffHoras >= 24 && diffHoras < 25) {
                await enviarWhatsApp(u.numero, "🟡 *PRIMEIRA ADVERTÊNCIA:* \nSeu prazo de 24h inicial venceu. Complete seu ciclo (2 amigos) para avançar para a próxima fase!");
            }
        }
    } catch (err) { console.error("Erro na varredura detalhada:", err); }
}

async function verificarEPromoverPai(idPai) {
    try {
        const amigosAtivos = await db.collection.countDocuments({ indicadoPor: idPai, status: 'ativo' });
        if (amigosAtivos >= 2) {
            const pai = await db.buscarParticipante(idPai);
            if(!pai) return;
            const novaFase = (parseInt(pai.fase) || 1) + 1;
            await db.atualizarFase(idPai, novaFase);
            await enviarWhatsApp(idPai, `🎊 *VITÓRIA!* Seus 2 amigos estão ativos. Você subiu para a *FASE ${novaFase}*!`);
        }
    } catch (e) { console.error("Erro na promoção:", e); }
}

// Inicia Robô de Limpeza (1h)
setInterval(executarVarredura72h, 3600000);

// EVENTOS WHATSAPP
client.on('qr', (qr) => qrcodeTerminal.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WHATSAPP CONECTADO E PRONTO!'));

// ROTAS ADMIN (TODAS PROTEGIDAS POR authAdmin)
app.get('/api/admin/listar', authAdmin, async (req, res) => {
    const usuarios = await db.listarTudo();
    res.json(usuarios);
});

app.post('/api/admin/status', authAdmin, async (req, res) => {
    const { numero, status } = req.body;
    const id = (numero.includes('@') ? numero : numero + '@c.us');
    await db.atualizarStatus(id, status);
    if(status === 'ativo') {
        await enviarWhatsApp(id, "🚀 *CONTA ATIVADA!* Seu cronômetro de 72h começou agora.");
        const user = await db.buscarParticipante(id);
        if(user && user.indicadoPor !== 'direto') verificarEPromoverPai(user.indicadoPor);
    }
    res.json({ sucesso: true });
});

app.post('/api/admin/avisar', authAdmin, async (req, res) => {
    const { para, mensagem } = req.body;
    if (para === 'all') {
        const todos = await db.listarTudo();
        for (let u of todos) await enviarWhatsApp(u.numero, mensagem);
    } else {
        await enviarWhatsApp(para, mensagem);
    }
    res.json({ sucesso: true });
});

app.post('/api/admin/reset', authAdmin, async (req, res) => {
    await db.resetarBancoTotal();
    res.json({ sucesso: true });
});

// ROTAS PUBLICAS
app.post('/api/cadastrar', async (req, res) => {
    try {
        let { nome, numero, cpf, indicadoPor } = req.body;
        let numLimpo = limpar(numero);
        if (!numLimpo.startsWith('55')) numLimpo = '55' + numLimpo;
        let paiId = indicadoPor === 'direto' ? 'direto' : (limpar(indicadoPor) + '@c.us');

        const existe = await db.buscarPorNumeroOuCPF(numLimpo + '@c.us', cpf);
        if (existe) return res.status(400).json({ sucesso: false, erro: "Número ou CPF já existem!" });

        const senha = Math.floor(100000 + Math.random() * 900000).toString();
        await db.criarParticipante({ nome, cpf, numero: numLimpo + '@c.us', senha, indicadoPor: paiId, status: 'pendente', fase: 1 });
        
        await enviarWhatsApp(numLimpo, `👑 *BEM-VINDO À FORJA!*\n\nSeu cadastro foi recebido.\n🔑 Senha: ${senha}\n\nStatus: *AGUARDANDO ATIVAÇÃO*`);
        res.json({ sucesso: true });
    } catch (err) { res.status(500).json({ sucesso: false }); }
});

app.post('/api/login', async (req, res) => {
    const { numero, senha } = req.body;
    const numId = limpar(numero) + '@c.us';
    const p = await db.buscarParticipante(numId);
    if (p && p.senha === senha) {
        const convidados = await db.collection.find({ indicadoPor: numId }).toArray();
        res.json({ sucesso: true, dados: { ...p, convidados } });
    } else { res.json({ sucesso: false }); }
});

app.get('/Fabricio_Carlet_Admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function iniciarServidor() {
    try {
        await db.conectar();
        const PORTA = process.env.PORT || 3000;
        // Primeiro o site fica online
        app.listen(PORTA, () => { 
            console.log(`🚀 Site Online em http://localhost:${PORTA}`);
            
            // O WhatsApp só tenta ligar SE não estivermos no Render (ambiente de produção)
            // Ou você pode comentar a linha abaixo para testar o site primeiro
            // client.initialize(); 
        });
    } catch (err) { console.error("Erro ao iniciar:", err); }
}

// Fecha o banco e o zap se o processo for interrompido
process.on('SIGINT', async () => {
    console.log("fechando recursos...");
    await client.destroy();
    process.exit();
});
iniciarServidor();