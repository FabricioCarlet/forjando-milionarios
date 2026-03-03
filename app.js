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

const limpar = (n) => n ? n.toString().replace(/\D/g, '') : '';

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
            await new Promise(resolve => setTimeout(resolve, 2000));
            await client.sendMessage(chatId, mensagem);
            console.log(`✅ Mensagem enviada para ${numLimpo}`);
        } else {
            console.error("❌ Robô Offline.");
        }
    } catch (e) { console.error(`❌ Erro Zap: ${e.message}`); }
}

async function executarVarredura72h() {
    console.log("⚙️ Executando Varredura...");
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
                await enviarWhatsApp(u.numero, "💀 *TEMPO ESGOTADO!*");
                await db.adotarOrfaos(u.numero, numeroAdmin);
                await db.removerPorExpiracao(u.numero);
            }
        }
    } catch (err) { console.error("Erro na varredura:", err); }
}
setInterval(executarVarredura72h, 3600000);

app.post('/api/cadastrar', async (req, res) => {
    try {
        let { nome, numero, cpf, indicadoPor } = req.body;
        let numLimpo = limpar(numero);
        const senha = Math.floor(100000 + Math.random() * 900000).toString();
        const idFinal = numLimpo + '@c.us';
        const paiId = indicadoPor === 'direto' ? 'direto' : (limpar(indicadoPor) + '@c.us');
        const existe = await db.buscarPorNumeroOuCPF(idFinal, cpf);
        if (existe) return res.status(400).json({ sucesso: false, erro: "Já cadastrado!" });
        await db.criarParticipante({ nome, cpf, numero: idFinal, senha, indicadoPor: paiId, status: 'pendente', fase: 1 });
        await enviarWhatsApp(numLimpo, `👑 *BEM-VINDO!* Sua senha: ${senha}`);
        res.json({ sucesso: true });
    } catch (err) { res.status(500).json({ sucesso: false }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { numero, senha } = req.body;
        const numId = numero.includes('@c.us') ? numero : limpar(numero) + '@c.us';
        const p = await db.buscarParticipante(numId);
        if (p && p.senha === senha) {
            const convidados = await db.buscarRede(numId);
            res.json({ sucesso: true, dados: { ...p, convidados } });
        } else { 
            res.status(401).json({ sucesso: false, erro: "Credenciais inválidas ou conta expirada." }); 
        }
    } catch (e) { res.status(500).json({ sucesso: false }); }
});

// Outras rotas permanecem iguais...
app.get('/api/admin/listar', authAdmin, async (req, res) => { const u = await db.listarTudo(); res.json(u); });
app.post('/api/admin/status', authAdmin, async (req, res) => {
    const { numero, status } = req.body;
    await db.atualizarStatus(numero, status);
    if(status === 'ativo') await enviarWhatsApp(numero, "🚀 *CONTA ATIVADA!*");
    res.json({ sucesso: true });
});
app.get('/Fabricio_Carlet_Admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function iniciarServidor() {
    await db.conectar();
    const PORTA = process.env.PORT || 3000;
    app.listen(PORTA, () => console.log(`🚀 Forja Online na Porta ${PORTA}`));
}
iniciarServidor();