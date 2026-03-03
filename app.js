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

// Configuração do WhatsApp Otimizada para o Render
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "forja_extrema", dataPath: './sessoes' }), 
    puppeteer: { 
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote'],
        handleSIGINT: false,
        handleSIGTERM: false
    }
});

const limpar = (n) => n ? n.replace(/\D/g, '') : '';

// Middleware de Segurança do Admin
const authAdmin = (req, res, next) => {
    const senhaAcesso = req.headers['x-admin-pass'];
    if (senhaAcesso === process.env.ADMIN_SENHA) {
        next();
    } else {
        res.status(403).json({ erro: "Acesso Negado." });
    }
};

async function enviarWhatsApp(numero, mensagem) {
    try {
        let numLimpo = limpar(numero);
        if (!numLimpo.startsWith('55')) numLimpo = '55' + numLimpo;
        const chatId = `${numLimpo}@c.us`;

        if (client.info && client.info.wid) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Anti-crash
            await client.sendMessage(chatId, mensagem);
            console.log(`✅ Mensagem enviada para ${numLimpo}`);
        } else {
            console.error("❌ Robô Offline. Mensagem não enviada.");
        }
    } catch (e) { console.error(`❌ Erro Zap: ${e.message}`); }
}

// LOGICA DE VARREDURA 72H (O Coração do Negócio)
async function executarVarredura72h() {
    console.log("⚙️ Executando Varredura de Regras...");
    try {
        const agora = new Date();
        const participantes = await db.listarTudo();
        const numeroAdmin = process.env.ADMIN_WHATSAPP;

        for (let u of participantes) {
            if (u.status !== 'ativo' || !u.dataAtivacao) continue;
            
            const diffHoras = (agora - new Date(u.dataAtivacao)) / (1000 * 60 * 60);
            const convidados = await db.buscarRede(u.numero);
            const amigosAtivos = convidados.filter(a => a.status === 'ativo').length;

            if (amigosAtivos >= 2) continue;

            if (diffHoras >= 72) {
                await enviarWhatsApp(u.numero, "💀 *TEMPO ESGOTADO!*\nInfelizmente você foi removido por não completar seu ciclo.");
                await db.adotarOrfaos(u.numero, numeroAdmin);
                await db.removerPorExpiracao(u.numero);
            } else if (diffHoras >= 70 && diffHoras < 71) {
                await enviarWhatsApp(u.numero, "🚨 *ÚLTIMO AVISO:* Você tem menos de 2 horas!");
            } else if (diffHoras >= 48 && diffHoras < 49) {
                await enviarWhatsApp(u.numero, "⚠️ *AVISO 48H:* Metade do seu tempo já passou!");
            }
        }
    } catch (err) { console.error("Erro na varredura:", err); }
}

setInterval(executarVarredura72h, 3600000); // Roda a cada 1 hora

// ROTAS ADMIN
app.get('/api/admin/listar', authAdmin, async (req, res) => {
    const usuarios = await db.listarTudo();
    res.json(usuarios); // Envia tudo, inclusive SENHA
});

app.post('/api/admin/status', authAdmin, async (req, res) => {
    const { numero, status } = req.body;
    await db.atualizarStatus(numero, status);
    if(status === 'ativo') {
        await enviarWhatsApp(numero, "🚀 *CONTA ATIVADA!* O tempo começou.");
    }
    res.json({ sucesso: true });
});

app.post('/api/admin/reset', authAdmin, async (req, res) => {
    try {
        await db.resetarBancoTotal();
        res.json({ sucesso: true });
    } catch (err) { res.status(500).json({ sucesso: false }); }
});

// ROTAS PUBLICAS
app.post('/api/cadastrar', async (req, res) => {
    try {
        let { nome, numero, cpf, indicadoPor } = req.body;
        let numLimpo = limpar(numero);
        const senha = Math.floor(100000 + Math.random() * 900000).toString();
        const idFinal = numLimpo + '@c.us';
        const paiId = indicadoPor === 'direto' ? 'direto' : (limpar(indicatedPor) + '@c.us');

        const existe = await db.buscarPorNumeroOuCPF(idFinal, cpf);
        if (existe) return res.status(400).json({ sucesso: false, erro: "Já cadastrado!" });

        await db.criarParticipante({ nome, cpf, numero: idFinal, senha, indicadoPor: paiId, status: 'pendente', fase: 1 });
        await enviarWhatsApp(numLimpo, `👑 *BEM-VINDO!* Sua senha: ${senha}`);
        res.json({ sucesso: true });
    } catch (err) { res.status(500).json({ sucesso: false }); }
});

app.post('/api/login', async (req, res) => {
    const { numero, senha } = req.body;
    const numId = limpar(numero) + '@c.us';
    const p = await db.buscarParticipante(numId);
    if (p && p.senha === senha) {
        const convidados = await db.buscarRede(numId);
        res.json({ sucesso: true, dados: { ...p, convidados } });
    } else { res.json({ sucesso: false }); }
});

app.get('/Fabricio_Carlet_Admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function iniciarServidor() {
    await db.conectar();
    const PORTA = process.env.PORT || 3000;
    app.listen(PORTA, () => { 
        console.log(`🚀 Forja Online na Porta ${PORTA}`);
        // client.initialize(); // Ligar apenas quando quiser ler o QR Code
    });
}
iniciarServidor();