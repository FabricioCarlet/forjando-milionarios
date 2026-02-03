const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCodeLib = require('qrcode');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const crypto = require('crypto');

// ==========================================
// CONFIGURAÇÕES - DOMÍNIO CONFIGURADO
// ==========================================
const DOMINIO = 'https://www.forjandomilionarios.com.br';
const PORT = process.env.PORT || 3000;
const ADMIN_NUMERO = '5519982020202@c.us';
const ADMIN_SENHA = 'Fa76Ca!!22120929';
const ADMIN_NOME = 'Administrador Master';

// NOVA ESTRUTURA DE VALORES DAS FASES
const VALORES_FASES = {
  1: 50, 2: 100, 3: 200, 4: 300, 5: 400,
  6: 500, 7: 600, 8: 700, 9: 800, 10: 900,
  11: 1000, 12: 1500, 13: 2000, 14: 3000, 15: 4000,
  16: 6000, 17: 8000, 18: 12000, 19: 16000, 20: 24000,
  21: 32000, 22: 48000, 23: 64000, 24: 96000, 25: 128000,
  26: 192000, 27: 256000, 28: 384000, 29: 512000
};

const TEMPO_LIMITE_HORAS = 72;
const TOTAL_FASES = 29;
const DB_PATH = path.join(__dirname, 'data', 'sistema.json');
const LOG_PATH = path.join(__dirname, 'data', 'logs.txt');
const METAS = { milhao: 1000000, dezMilhoes: 10000000 };

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

let qrCodeAtual = '';
let estaPronto = false;
let clientWhatsApp = null;
let infoWhatsApp = null;

// ==========================================
// FUNÇÕES UTILITÁRIAS
// ==========================================
function gerarSenha() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function hashSenha(senha) {
  return crypto.createHash('md5').update(senha).digest('hex');
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(valor || 0);
}

function formatarNumero(valor) {
  return new Intl.NumberFormat('pt-BR').format(valor || 0);
}

function formatarWhatsApp(numero) {
  // Remove tudo que não for número
  let limpo = numero.replace(/\D/g, '');
  // Se não começar com 55, adiciona
  if (!limpo.startsWith('55')) {
    limpo = '55' + limpo;
  }
  return limpo + '@c.us';
}

function obterValorFase(fase) {
  return VALORES_FASES[fase] || VALORES_FASES[1];
}

// ==========================================
// BANCO DE DADOS
// ==========================================
class Database {
  constructor() {
    this.data = null;
    this.carregar();
    this.iniciarVerificadorCron();
  }

  garantirEstrutura() {
    if (!this.data) this.data = {};
    if (!this.data.admin) {
      this.data.admin = {
        numero: ADMIN_NUMERO,
        nome: ADMIN_NOME,
        total_arrecadado: 0,
        total_participantes_ja_cadastrados: 0,
        participantes_ativos: [],
        apadrinhamentos: [],
        historico_metas: [],
        participantes_banidos: []
      };
    }
    if (!this.data.participantes) this.data.participantes = {};
    if (!this.data.transacoes) this.data.transacoes = [];
    if (!this.data.sessoes) this.data.sessoes = {};
    if (!this.data.metricas) {
      this.data.metricas = {
        inicio_projeto: Date.now(),
        pico_concorrentes: 0,
        total_cancelados: 0,
        total_graduados: 0
      };
    }
    if (!this.data.admin.participantes_ativos) this.data.admin.participantes_ativos = [];
    if (!this.data.admin.apadrinhamentos) this.data.admin.apadrinhamentos = [];
    if (!this.data.admin.historico_metas) this.data.admin.historico_metas = [];
    if (!this.data.admin.participantes_banidos) this.data.admin.participantes_banidos = [];
    if (typeof this.data.admin.total_arrecadado !== 'number') this.data.admin.total_arrecadado = 0;
    if (typeof this.data.admin.total_participantes_ja_cadastrados !== 'number') this.data.admin.total_participantes_ja_cadastrados = 0;
    if (!this.data.metricas.inicio_projeto) this.data.metricas.inicio_projeto = Date.now();
    if (typeof this.data.metricas.pico_concorrentes !== 'number') this.data.metricas.pico_concorrentes = 0;
    if (typeof this.data.metricas.total_cancelados !== 'number') this.data.metricas.total_cancelados = 0;
    if (typeof this.data.metricas.total_graduados !== 'number') this.data.metricas.total_graduados = 0;
  }

  carregar() {
    try {
      if (!fs.existsSync(DB_PATH)) {
        this.data = {};
        this.garantirEstrutura();
        this.salvar();
        console.log('✅ Banco de dados criado');
        return;
      }
      const rawData = fs.readFileSync(DB_PATH, 'utf8');
      if (!rawData || rawData.trim() === '') {
        this.data = {};
        this.garantirEstrutura();
        this.salvar();
        return;
      }
      this.data = JSON.parse(rawData);
      this.garantirEstrutura();
      console.log(`📊 ${Object.keys(this.data.participantes).length} participantes carregados`);
    } catch (erro) {
      console.error('❌ Erro ao carregar DB:', erro);
      this.data = {};
      this.garantirEstrutura();
      this.salvar();
    }
  }

  salvar() {
    try {
      this.garantirEstrutura();
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    } catch (erro) {
      console.error('❌ Erro ao salvar:', erro);
    }
  }

  resetarTudo() {
    this.data.participantes = {};
    this.data.transacoes = [];
    this.data.sessoes = {};
    this.data.admin.participantes_ativos = [];
    this.data.admin.apadrinhamentos = [];
    this.data.admin.historico_metas = [];
    this.data.admin.participantes_banidos = [];
    this.data.admin.total_arrecadado = 0;
    this.data.admin.total_participantes_ja_cadastrados = 0;
    this.data.metricas.total_cancelados = 0;
    this.data.metricas.total_graduados = 0;
    this.data.metricas.pico_concorrentes = 0;
    this.data.metricas.inicio_projeto = Date.now();
    this.salvar();
    this.log('SISTEMA', 'Banco de dados zerado completamente');
    return { sucesso: true, mensagem: 'Sistema zerado' };
  }

  verificarDadosDuplicados(dados, numeroFormatado) {
    this.garantirEstrutura();
    
    const participantes = Object.values(this.data.participantes);
    
    // Verifica se número está banido
    const banido = this.data.admin.participantes_banidos.find(b => 
      b.numero === numeroFormatado || 
      b.cpf === dados.cpf || 
      b.rg === dados.rg ||
      b.email === dados.email
    );
    if (banido) {
      return {
        erro: true,
        mensagem: '⛔ ACESSO NEGADO: Estes dados estão bloqueados permanentemente por violação dos termos de uso ou tentativa de fraude. Entre em contato com o suporte se acredita que houve um erro.'
      };
    }

    // Verifica se dados já existem em participante ativo (não cancelado e não expirado)
    for (const p of participantes) {
      // Não bloqueia se for reativação de conta cancelada/expirada (prazo de 72h passou)
      const podeReativar = p.estado === 'cancelado' || 
                          (p.estado === 'ativo' && p.timestamp_inicio_ciclo && 
                           (Date.now() - p.timestamp_inicio_ciclo) > (TEMPO_LIMITE_HORAS * 60 * 60 * 1000));
      
      if (!podeReativar) {
        if (p.numero === numeroFormatado) {
          return { erro: true, mensagem: 'Este número de WhatsApp já está cadastrado e ativo no sistema. Faça login ou aguarde o prazo expirar para um novo cadastro.' };
        }
        if (dados.cpf && p.cpf === dados.cpf) {
          return { erro: true, mensagem: 'Este CPF já está cadastrado em uma conta ativa. Cada pessoa pode ter apenas uma conta ativa por vez.' };
        }
        if (dados.rg && p.rg === dados.rg) {
          return { erro: true, mensagem: 'Este RG já está cadastrado em uma conta ativa. Cada pessoa pode ter apenas uma conta ativa por vez.' };
        }
        if (dados.email && p.email === dados.email) {
          return { erro: true, mensagem: 'Este e-mail já está em uso em uma conta ativa. Utilize outro e-mail ou faça login na sua conta existente.' };
        }
        if (dados.pix && p.pix === dados.pix) {
          return { erro: true, mensagem: 'Esta chave PIX já está vinculada a uma conta ativa. Cada chave PIX só pode ser usada em uma conta.' };
        }
      }
    }
    
    return { erro: false };
  }

  deletarParticipante(numero) {
    this.garantirEstrutura();
    const p = this.data.participantes[numero];
    if (!p) return { erro: 'Participante não encontrado' };

    // Adiciona à lista de banidos ao deletar
    this.data.admin.participantes_banidos.push({
      numero: numero,
      nome: p.nome,
      cpf: p.cpf,
      rg: p.rg,
      email: p.email,
      pix: p.pix,
      data_banimento: new Date().toISOString(),
      motivo: 'Deletado pelo administrador'
    });

    if (p.amigos.amigo_1 && this.data.participantes[p.amigos.amigo_1.numero]) {
      this.deletarParticipante(p.amigos.amigo_1.numero);
    }
    if (p.amigos.amigo_2 && this.data.participantes[p.amigos.amigo_2.numero]) {
      this.deletarParticipante(p.amigos.amigo_2.numero);
    }

    this.data.admin.participantes_ativos = this.data.admin.participantes_ativos.filter(n => n !== numero);
    this.data.admin.apadrinhamentos = this.data.admin.apadrinhamentos.filter(a => a.filho !== numero);
    delete this.data.participantes[numero];
    this.salvar();
    this.log('DELETE', `Participante ${numero} deletado e banido`);
    return { sucesso: true, mensagem: 'Deletado e banido com sucesso' };
  }

  log(categoria, mensagem) {
    const linha = `[${new Date().toISOString()}] [${categoria}] ${mensagem}\n`;
    try {
      fs.appendFileSync(LOG_PATH, linha);
    } catch (e) {}
  }

  iniciarVerificadorCron() {
    cron.schedule('0 * * * *', () => {
      this.verificarExpirados();
    });
    console.log(`⏰ Verificador de expirados ativo`);
  }

  verificarExpirados() {
    this.garantirEstrutura();
    const agora = Date.now();
    const limite = TEMPO_LIMITE_HORAS * 60 * 60 * 1000;
    let cancelados = 0;
    
    Object.keys(this.data.participantes).forEach(numero => {
      const p = this.data.participantes[numero];
      if (p.estado === 'ativo' && !p.ciclo_completo && p.timestamp_inicio_ciclo) {
        const tempoDecorrido = agora - p.timestamp_inicio_ciclo;
        if (tempoDecorrido > limite) {
          this.cancelarParticipante(numero);
          cancelados++;
        }
      }
    });
    
    if (cancelados > 0) {
      this.data.metricas.total_cancelados += cancelados;
      this.log('CRON', `${cancelados} participantes cancelados por tempo`);
      this.salvar();
    }
  }

  cancelarParticipante(numero) {
    const p = this.data.participantes[numero];
    if (!p) return;
    p.estado = 'cancelado';
    p.data_cancelamento = new Date().toISOString();
    this.data.admin.participantes_ativos = this.data.admin.participantes_ativos.filter(n => n !== numero);
    this.apadrinharFilhos(numero);
    this.log('CANCELAMENTO', `${p.nome} (${numero}) cancelado`);
  }

  apadrinharFilhos(numeroPaiCancelado) {
    Object.keys(this.data.participantes).forEach(numero => {
      const filho = this.data.participantes[numero];
      if (filho.patrocinador === numeroPaiCancelado && filho.estado !== 'cancelado') {
        filho.patrocinador_original = numeroPaiCancelado;
        filho.patrocinador = ADMIN_NUMERO;
        filho.apadrinhado_pelo_admin = true;
        filho.data_apadrinhamento = new Date().toISOString();
        this.data.admin.apadrinhamentos.push({
          filho: numero,
          pai_original: numeroPaiCancelado,
          data: new Date().toISOString()
        });
        this.log('APADRINHAMENTO', `${filho.nome} -> Admin`);
      }
    });
  }

  getParticipante(numero) {
    return this.data.participantes[numero];
  }

  criarParticipante(dados, ignorarVerificacao = false) {
    this.garantirEstrutura();
    const { numero, nome, email, cpf, rg, pix } = dados;
    
    if (this.data.participantes[numero] && !ignorarVerificacao) {
      return { erro: 'Número já cadastrado' };
    }

    // Verificação de duplicidade (exceto quando admin cadastra ou reativação)
    if (!ignorarVerificacao) {
      const verificacao = this.verificarDadosDuplicados(dados, numero);
      if (verificacao.erro) {
        return { erro: verificacao.mensagem };
      }
    }

    const senha = gerarSenha();
    const senhaHash = hashSenha(senha);
    const valorAtual = obterValorFase(1);
    
    const novo = {
      numero,
      nome,
      email: email || '',
      cpf: cpf || '',
      rg: rg || '',
      pix: pix || '',
      senha: senhaHash,
      senha_original: senha,
      patrocinador: ADMIN_NUMERO,
      patrocinador_definitivo: null,
      fase_atual: 1,
      estado: 'cadastrado',
      ciclo_completo: false,
      timestamp_cadastro: Date.now(),
      timestamp_inicio_ciclo: null,
      data_ultima_acao: new Date().toISOString(),
      amigos: { amigo_1: null, amigo_2: null },
      recebimentos: {},
      doacao_para_admin_confirmada: false,
      historico: [{ acao: 'cadastro', data: new Date().toISOString() }]
    };

    for (let i = 1; i <= TOTAL_FASES; i++) {
      novo.recebimentos[`fase_${i}`] = {
        amigo_1: { recebido: false, data: null },
        amigo_2: { recebido: false, data: null },
        completo: false
      };
    }

    this.data.participantes[numero] = novo;
    this.data.admin.participantes_ativos.push(numero);
    this.data.admin.total_participantes_ja_cadastrados++;
    
    const ativos = Object.values(this.data.participantes).filter(p => p.estado === 'ativo').length;
    if (ativos > this.data.metricas.pico_concorrentes) {
      this.data.metricas.pico_concorrentes = ativos;
    }
    
    this.salvar();
    this.log('CADASTRO', `${nome} (${numero}) - Senha: ${senha}`);
    return { sucesso: true, dados: novo, senha: senha };
  }

  confirmarDoacaoPropria(numero) {
    this.garantirEstrutura();
    const p = this.data.participantes[numero];
    if (!p) return { erro: 'Participante não encontrado' };
    if (p.doacao_para_admin_confirmada) return { erro: 'Doação já confirmada anteriormente' };
    
    const valorFase = obterValorFase(p.fase_atual);
    
    p.doacao_para_admin_confirmada = true;
    p.estado = 'ativo';
    p.timestamp_inicio_ciclo = Date.now();
    p.data_ultima_acao = new Date().toISOString();
    
    this.data.admin.total_arrecadado += valorFase;
    this.data.transacoes.push({
      tipo: 'doacao_inicial',
      de: numero,
      de_nome: p.nome,
      valor: valorFase,
      data: new Date().toISOString()
    });
    
    this.data.admin.historico_metas.push({
      valor: this.data.admin.total_arrecadado,
      data: Date.now(),
      tipo: 'confirmacao'
    });
    
    p.historico.push({ acao: 'doacao_confirmada', fase: 1, data: new Date().toISOString() });
    this.salvar();
    
    this.log('DOACAO', `${p.nome} (${numero}) confirmada - R$${valorFase}`);
    return {
      sucesso: true,
      senha: p.senha_original,
      nome: p.nome,
      numero: p.numero,
      valor: valorFase
    };
  }

  cadastrarAmigo(numeroP, slot, dadosAmigo) {
    const p = this.data.participantes[numeroP];
    if (!p) return { sucesso: false, erro: 'Participante não existe' };
    if (!p.doacao_para_admin_confirmada) return { sucesso: false, erro: 'Aguarde confirmação da doação' };
    if (p.estado === 'cancelado') return { sucesso: false, erro: 'ID cancelado' };
    if (p.amigos[slot]) return { sucesso: false, erro: 'Slot já ocupado' };

    const numAmigoLimpo = formatarWhatsApp(dadosAmigo.numero);
    
    // Verifica se amigo já existe (exceto se estiver cancelado/expirado)
    const amigoExistente = this.data.participantes[numAmigoLimpo];
    if (amigoExistente) {
      const podeReativar = amigoExistente.estado === 'cancelado' || 
                          (amigoExistente.estado === 'ativo' && amigoExistente.timestamp_inicio_ciclo && 
                           (Date.now() - amigoExistente.timestamp_inicio_ciclo) > (TEMPO_LIMITE_HORAS * 60 * 60 * 1000));
      
      if (!podeReativar) {
        return { sucesso: false, erro: 'Este número já está cadastrado no sistema com uma conta ativa.' };
      }
    }

    const novoAmigo = this.criarParticipante({
      numero: numAmigoLimpo,
      nome: dadosAmigo.nome,
      email: dadosAmigo.email || '',
      cpf: dadosAmigo.cpf || '',
      rg: dadosAmigo.rg || '',
      pix: dadosAmigo.pix || ''
    }, true); // Ignora verificação dupla pois já verificamos acima

    if (novoAmigo.erro) return { sucesso: false, erro: novoAmigo.erro };

    const amigoObj = this.data.participantes[numAmigoLimpo];
    amigoObj.patrocinador_definitivo = numeroP;
    amigoObj.patrocinador = numeroP;
    
    p.amigos[slot] = {
      numero: numAmigoLimpo,
      nome: dadosAmigo.nome,
      data_cadastro: new Date().toISOString(),
      ativo: true
    };
    
    p.historico.push({ acao: 'cadastrou_amigo', slot, amigo: numAmigoLimpo, data: new Date().toISOString() });
    this.salvar();
    
    return { sucesso: true, dados: amigoObj, senha: novoAmigo.senha };
  }

  getStatus(numero) {
    const p = this.data.participantes[numero];
    if (!p) return null;
    
    const agora = Date.now();
    const tempoRestante = p.timestamp_inicio_ciclo
      ? Math.max(0, (TEMPO_LIMITE_HORAS * 60 * 60 * 1000) - (agora - p.timestamp_inicio_ciclo))
      : null;

    return {
      numero: p.numero,
      nome: p.nome,
      email: p.email,
      fase: p.fase_atual,
      max_fases: TOTAL_FASES,
      estado: p.estado,
      pode_convidar: p.doacao_para_admin_confirmada,
      amigos_cadastrados: {
        amigo_1: p.amigos.amigo_1 ? { nome: p.amigos.amigo_1.nome, ativo: true } : null,
        amigo_2: p.amigos.amigo_2 ? { nome: p.amigos.amigo_2.nome, ativo: true } : null
      },
      tempo_restante_ms: tempoRestante,
      tempo_restante_hrs: tempoRestante ? Math.floor(tempoRestante / (1000 * 60 * 60)) : null,
      ciclo_completo: p.ciclo_completo,
      graduado: p.estado === 'concluido',
      doacao_confirmada: p.doacao_para_admin_confirmada,
      valor_proxima_fase: obterValorFase(p.fase_atual)
    };
  }

  autenticarUsuario(numero, senha) {
    const p = this.data.participantes[numero];
    if (!p) return { erro: 'Usuário não encontrado' };
    
    const senhaHash = hashSenha(senha);
    if (p.senha !== senhaHash) return { erro: 'Senha incorreta' };
    
    const token = crypto.randomBytes(32).toString('hex');
    this.data.sessoes[token] = { numero: numero, nome: p.nome, criado: Date.now() };
    this.salvar();
    
    return { sucesso: true, token, dados: this.getStatus(numero) };
  }

  verificarToken(token) {
    if (!token || !this.data.sessoes) return null;
    const sessao = this.data.sessoes[token];
    if (!sessao) return null;
    if (Date.now() - sessao.criado > 24 * 60 * 60 * 1000) {
      delete this.data.sessoes[token];
      this.salvar();
      return null;
    }
    return sessao;
  }

  calcularProjecoes() {
    this.garantirEstrutura();
    const agora = Date.now();
    const inicio = this.data.metricas.inicio_projeto || agora;
    const tempoDecorrido = agora - inicio;
    const diasDecorridos = tempoDecorrido / (1000 * 60 * 60 * 24);
    const arrecadado = this.data.admin.total_arrecadado || 0;
    
    if (diasDecorridos < 0.1 || arrecadado < 10) {
      return {
        velocidade_diaria: 0,
        dias_para_milhao: Infinity,
        dias_para_dez_milhoes: Infinity,
        data_milhao: 'Aguardando dados...',
        data_dez_milhoes: 'Aguardando dados...',
        percentual_milhao: 0,
        percentual_dez_milhoes: 0
      };
    }
    
    const velocidadeDiaria = arrecadado / diasDecorridos;
    const restanteMilhao = Math.max(0, METAS.milhao - arrecadado);
    const restanteDezMilhoes = Math.max(0, METAS.dezMilhoes - arrecadado);
    
    const diasMilhao = velocidadeDiaria > 0 ? Math.ceil(restanteMilhao / velocidadeDiaria) : Infinity;
    const diasDezMilhoes = velocidadeDiaria > 0 ? Math.ceil(restanteDezMilhoes / velocidadeDiaria) : Infinity;
    
    const formatarData = (dias) => {
      if (dias === Infinity || dias > 36500) return 'Mais de 100 anos';
      const data = new Date(agora + (dias * 24 * 60 * 60 * 1000));
      return data.toLocaleDateString('pt-BR');
    };
    
    return {
      velocidade_diaria: velocidadeDiaria,
      dias_para_milhao: diasMilhao,
      dias_para_dez_milhoes: diasDezMilhoes,
      data_milhao: formatarData(diasMilhao),
      data_dez_milhoes: formatarData(diasDezMilhoes),
      percentual_milhao: Math.min(100, (arrecadado / METAS.milhao) * 100),
      percentual_dez_milhoes: Math.min(100, (arrecadado / METAS.dezMilhoes) * 100)
    };
  }
}

const db = new Database();

// ==========================================
// WHATSAPP - CÓDIGO CORRIGIDO
// ==========================================
async function enviarWhatsApp(numero, mensagem, tentativas = 5) {
  let checks = 0;
  
  while ((!estaPronto || !clientWhatsApp) && checks < 60) {
    await new Promise(r => setTimeout(r, 1000));
    checks++;
    if (checks % 10 === 0) {
      console.log(`⏳ Aguardando WhatsApp... (${checks}s)`);
    }
  }
  
  if (!estaPronto || !clientWhatsApp) {
    console.error(`❌ WhatsApp não está pronto após ${checks}s`);
    return { sucesso: false, erro: 'WhatsApp não conectado' };
  }

  if (!numero.includes('@c.us')) {
    console.error(`❌ Número inválido: ${numero}`);
    return { sucesso: false, erro: 'Formato inválido' };
  }

  console.log(`📤 Enviando mensagem para: ${numero}`);
  
  for (let i = 0; i < tentativas; i++) {
    try {
      const msgEnviada = await clientWhatsApp.sendMessage(numero, mensagem);
      if (msgEnviada && msgEnviada.id) {
        console.log(`✅ Mensagem ENVIADA: ${numero}`);
        return { sucesso: true, id: msgEnviada.id._serialized };
      }
    } catch (erro) {
      console.error(`❌ Tentativa ${i+1} falhou:`, erro.message);
      if (erro.message.includes('not registered')) {
        return { sucesso: false, erro: 'Número não tem WhatsApp' };
      }
      if (i < tentativas - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  
  return { sucesso: false, erro: 'Falha após tentativas' };
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    defaultViewport: null
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

clientWhatsApp = client;

client.on('qr', (qr) => {
  qrCodeAtual = qr;
  estaPronto = false;
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║ 📱 ESCANEIE O QR CODE ABAIXO COM O WHATSAPP ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('\n');
  qrcode.generate(qr, { small: true });
  console.log('\n⏳ Aguardando conexão...\n');
});

client.on('ready', () => {
  estaPronto = true;
  qrCodeAtual = '';
  infoWhatsApp = client.info;
  console.log('✅ WhatsApp CONECTADO E PRONTO!');
  console.log(`📱 Número: ${client.info.wid.user}`);
  console.log('');
});

client.on('authenticated', () => {
  console.log('🔐 Sessão autenticada (salva)');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  estaPronto = false;
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Desconectado:', reason);
  estaPronto = false;
  infoWhatsApp = null;
  setTimeout(() => {
    console.log('🔄 Tentando reconectar...');
    client.initialize().catch(err => console.error('Erro ao reconectar:', err));
  }, 5000);
});

client.on('message_create', async (msg) => {
  if (msg.fromMe) return;
  
  const numero = msg.from;
  const texto = msg.body.trim();
  const textoLower = texto.toLowerCase();
  const numeroLimpo = numero.replace(/[^\d]/g, '');
  const adminLimpo = ADMIN_NUMERO.replace(/[^\d]/g, '');
  const isAdmin = (numeroLimpo === adminLimpo);

  try {
    if (isAdmin && textoLower.startsWith('confirmar ')) {
      const alvo = texto.split(' ')[1];
      if (!alvo) return msg.reply('❌ Formato: confirmar 5511999999999');
      
      const numAlvo = formatarWhatsApp(alvo);
      const res = db.confirmarDoacaoPropria(numAlvo);
      
      if (res.sucesso) {
        await msg.reply(`✅ ${res.nome} confirmado! Enviando credenciais...`);
        
        const mensagemUsuario = `🎉 *PARABÉNS! SEU ACESSO FOI LIBERADO!* 🎉\n\n` +
          `👤 *Nome:* ${res.nome}\n` +
          `📱 *Login:* ${res.numero.replace('@c.us', '')}\n` +
          `🔑 *Senha:* ${res.senha}\n\n` +
          `💰 *Valor Confirmado:* R$ ${res.valor},00\n\n` +
          `🌐 *Acesse:* ${DOMINIO}/painel\n\n` +
          `⏰ *IMPORTANTE:* Você tem 72 HORAS para cadastrar 2 amigos!\n\n` +
          `⚠️ *Guarde sua senha:* ${res.senha}\n\n` +
          `Bem-vindo à Forja! 🚀`;

        const resultadoEnvio = await enviarWhatsApp(res.numero, mensagemUsuario);
        
        if (resultadoEnvio.sucesso) {
          await msg.reply(`✅ Enviado com sucesso para ${res.nome}`);
        } else {
          await msg.reply(`⚠️ Erro no envio automático: ${resultadoEnvio.erro}\nSenha do usuário: ${res.senha}\nEnvie manualmente se necessário.`);
        }
      } else {
        await msg.reply(`❌ Erro: ${res.erro}`);
      }
      return;
    }

    if (isAdmin && textoLower.startsWith('ver ')) {
      const alvo = texto.split(' ')[1];
      const numAlvo = formatarWhatsApp(alvo);
      const s = db.getStatus(numAlvo);
      
      if (s) {
        await msg.reply(`*${s.nome}*\n📍 Fase: ${s.fase}/${s.max_fases}\n⏰ ${s.tempo_restante_hrs || '-'}h restantes\n💰 Próxima doação: R$ ${s.valor_proxima_fase},00`);
      } else {
        await msg.reply('❌ Não encontrado');
      }
      return;
    }

    if (textoLower === 'senha' || textoLower === 'minha senha') {
      const p = db.getParticipante(numero);
      if (p) {
        await msg.reply(`🔑 *Sua senha:* ${p.senha_original}\n\n🌐 ${DOMINIO}/painel`);
      } else {
        await msg.reply('❌ Não cadastrado.');
      }
      return;
    }
  } catch (erro) {
    console.error('Erro no handler de mensagens:', erro);
  }
});

async function iniciarWhatsApp() {
  try {
    console.log('🚀 Iniciando WhatsApp...');
    await client.initialize();
  } catch (erro) {
    console.error('❌ Erro ao iniciar WhatsApp:', erro.message);
    if (erro.message.includes('browser') || erro.message.includes('puppeteer')) {
      console.error('💡 DICA: Verifique se o Chrome/Chromium está instalado');
    }
  }
}

// ==========================================
// SERVIDOR WEB
// ==========================================
const appExpress = express();

// Força HTTPS em produção
appExpress.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

appExpress.use(cors());
appExpress.use(express.json());

function authAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Autenticação necessária');
  }
  
  try {
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (credentials[1] === ADMIN_SENHA) {
      next();
    } else {
      res.set('WWW-Authenticate', 'Basic realm="Admin"');
      res.status(401).send('Senha incorreta');
    }
  } catch (e) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).send('Autenticação inválida');
  }
}

// ==========================================
// PÁGINA INICIAL
// ==========================================
appExpress.get('/', (req, res) => {
  const totalParticipantes = Object.keys(db.data.participantes).length;
  const ativosAgora = Object.values(db.data.participantes).filter(p => p.estado === 'ativo').length;
  const valorInicial = obterValorFase(1);
  
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Forjando Milionários - Sistema exclusivo de networking e multiplicação de capital">
  <title>Forjando Milionários - O Sistema que está Revolucionando Brasil</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👑</text></svg>">
  
  <!-- Preconnect para performance -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;500;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --gold-primary: #FFD700;
      --gold-dark: #B8860B;
      --gold-light: #FFF8DC;
      --purple-deep: #0a0014;
      --purple-royal: #1a0033;
      --neon-blue: #00f3ff;
      --neon-purple: #bc13fe;
      --success: #00ff88;
    }
    
    body {
      font-family: 'Rajdhani', sans-serif;
      background: linear-gradient(135deg, #000000 0%, #0a0014 50%, #1a0033 100%);
      min-height: 100vh;
      color: #fff;
      overflow-x: hidden;
      position: relative;
    }
    
    .particles {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      overflow: hidden;
      z-index: 0;
    }
    
    .particle {
      position: absolute;
      width: 4px; height: 4px;
      background: var(--gold-primary);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--gold-primary), 0 0 20px var(--gold-primary);
      animation: float 15s infinite;
      opacity: 0.6;
    }
    
    @keyframes float {
      0%, 100% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; }
    }
    
    .master-container {
      display: grid;
      grid-template-columns: 1fr 450px;
      min-height: 100vh;
      position: relative;
      z-index: 1;
    }
    
    .epic-content {
      padding: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
    }
    
    .urgency-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, rgba(255,0,0,0.2), rgba(255,0,0,0.1));
      border: 1px solid rgba(255,0,0,0.5);
      color: #ff4444;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: 700;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 30px;
      animation: pulse-red 2s infinite;
      width: fit-content;
    }
    
    @keyframes pulse-red {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0.4); }
      50% { box-shadow: 0 0 20px 10px rgba(255,0,0,0); }
    }
    
    .live-dot {
      width: 8px; height: 8px;
      background: #ff0000;
      border-radius: 50%;
      animation: blink 1s infinite;
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    .hero-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 5rem;
      font-weight: 900;
      line-height: 1.1;
      margin-bottom: 20px;
      text-transform: uppercase;
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-size: 200% auto;
      animation: shine 3s linear infinite;
      filter: drop-shadow(0 0 30px rgba(255,215,0,0.3));
      letter-spacing: -2px;
    }
    
    @keyframes shine {
      to { background-position: 200% center; }
    }
    
    .hero-subtitle {
      font-size: 1.8rem;
      color: rgba(255,255,255,0.9);
      margin-bottom: 40px;
      font-weight: 300;
      line-height: 1.4;
    }
    
    .highlight {
      color: var(--gold-primary);
      font-weight: 700;
      text-shadow: 0 0 10px rgba(255,215,0,0.5);
    }
    
    .social-proof {
      background: rgba(255,255,255,0.03);
      border-left: 4px solid var(--gold-primary);
      padding: 20px 25px;
      border-radius: 0 12px 12px 0;
      margin-bottom: 40px;
      backdrop-filter: blur(10px);
    }
    
    .proof-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.5rem;
      color: var(--success);
      font-weight: 700;
      text-shadow: 0 0 20px rgba(0,255,136,0.4);
    }
    
    .proof-text { color: rgba(255,255,255,0.7); font-size: 1.1rem; margin-top: 5px; }
    .proof-alert {
      color: var(--gold-primary);
      font-size: 0.9rem;
      margin-top: 10px;
      font-style: italic;
    }
    
    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 25px;
      margin-top: 20px;
    }
    
    .feature-card {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,215,0,0.1);
      border-radius: 16px;
      padding: 30px 20px;
      text-align: center;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    
    .feature-card::before {
      content: '';
      position: absolute;
      top: 0; left: -100%;
      width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,215,0,0.1), transparent);
      transition: left 0.5s;
    }
    
    .feature-card:hover::before { left: 100%; }
    
    .feature-card:hover {
      transform: translateY(-5px);
      border-color: rgba(255,215,0,0.3);
      box-shadow: 0 10px 40px rgba(255,215,0,0.1);
    }
    
    .feature-icon {
      font-size: 3rem;
      margin-bottom: 15px;
      filter: drop-shadow(0 0 10px rgba(255,215,0,0.3));
    }
    
    .feature-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.2rem;
      color: var(--gold-primary);
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .feature-desc {
      color: rgba(255,255,255,0.7);
      font-size: 0.95rem;
      line-height: 1.4;
    }
    
    .login-section {
      background: rgba(10,0,20,0.8);
      backdrop-filter: blur(20px);
      border-left: 1px solid rgba(255,215,0,0.2);
      padding: 60px 40px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    
    .login-section::before {
      content: '';
      position: absolute;
      top: -50%; right: -50%;
      width: 200%; height: 200%;
      background: radial-gradient(circle, rgba(255,215,0,0.05) 0%, transparent 70%);
      animation: rotate 20s linear infinite;
    }
    
    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .login-box {
      position: relative;
      z-index: 2;
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(255,215,0,0.2);
      border-radius: 24px;
      padding: 50px 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    
    .login-header {
      text-align: center;
      margin-bottom: 40px;
    }
    
    .login-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 2rem;
      color: var(--gold-primary);
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    
    .login-subtitle { color: rgba(255,255,255,0.6); font-size: 1rem; }
    
    input {
      width: 100%;
      padding: 18px 20px;
      margin-bottom: 20px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      color: #fff;
      font-size: 1rem;
      font-family: 'Rajdhani', sans-serif;
      transition: all 0.3s;
    }
    
    input:focus {
      outline: none;
      border-color: var(--gold-primary);
      box-shadow: 0 0 0 3px rgba(255,215,0,0.1);
    }
    
    input::placeholder { color: rgba(255,255,255,0.3); }
    
    .btn-primary {
      width: 100%;
      padding: 20px;
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
      border: none;
      border-radius: 12px;
      color: #000;
      font-family: 'Orbitron', sans-serif;
      font-size: 1.1rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      cursor: pointer;
      transition: all 0.3s;
      margin-bottom: 20px;
      position: relative;
      overflow: hidden;
    }
    
    .btn-primary::before {
      content: '';
      position: absolute;
      top: 0; left: -100%;
      width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      transition: left 0.5s;
    }
    
    .btn-primary:hover::before { left: 100%; }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(255,215,0,0.3);
    }
    
    .btn-secondary {
      width: 100%;
      padding: 18px;
      background: transparent;
      border: 2px solid rgba(255,215,0,0.5);
      border-radius: 12px;
      color: var(--gold-primary);
      font-family: 'Rajdhani', sans-serif;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .btn-secondary:hover {
      background: rgba(255,215,0,0.1);
      border-color: var(--gold-primary);
      box-shadow: 0 0 20px rgba(255,215,0,0.2);
    }
    
    .security-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 30px;
      color: rgba(255,255,255,0.5);
      font-size: 0.9rem;
    }
    
    #modalCadastro {
      display: none;
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.95);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
    }
    
    .modal-content {
      background: linear-gradient(135deg, #0a0014 0%, #1a0033 100%);
      border: 1px solid rgba(255,215,0,0.3);
      border-radius: 24px;
      padding: 50px;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 0 60px rgba(255,215,0,0.2);
      position: relative;
    }
    
    .modal-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.8rem;
      color: var(--gold-primary);
      margin-bottom: 10px;
      text-align: center;
    }
    
    .modal-subtitle {
      color: rgba(255,255,255,0.6);
      text-align: center;
      margin-bottom: 30px;
    }
    
    .warning-box {
      background: rgba(255,0,0,0.1);
      border: 1px solid rgba(255,0,0,0.3);
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
      font-size: 0.9rem;
      color: #ff6666;
      text-align: center;
    }
    
    .close-modal {
      position: absolute;
      top: 20px; right: 20px;
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      font-size: 1.5rem;
      cursor: pointer;
      width: auto;
      padding: 0;
    }
    
    .close-modal:hover { color: #fff; }
    
    .required { color: #ff4444; }
    .input-hint { font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-top: -15px; margin-bottom: 15px; }
    
    @media (max-width: 1024px) {
      .master-container { grid-template-columns: 1fr; }
      .epic-content { padding: 40px 30px; text-align: center; }
      .hero-title { font-size: 3rem; }
      .features-grid { grid-template-columns: 1fr; }
      .urgency-badge { margin: 0 auto 30px; }
      .login-section {
        border-left: none;
        border-top: 1px solid rgba(255,215,0,0.2);
      }
    }
  </style>
</head>
<body>
  <div class="particles">
    ${Array(20).fill(0).map((_, i) => `<div class="particle" style="left: ${Math.random() * 100}%; animation-delay: ${Math.random() * 15}s; animation-duration: ${15 + Math.random() * 10}s;"></div>`).join('')}
  </div>
  
  <div class="master-container">
    <div class="epic-content">
      <div class="urgency-badge">
        <div class="live-dot"></div>
        <span>Vagas Limitadas - ${ativosAgora} pessoas ativas agora</span>
      </div>
      
      <h1 class="hero-title">Forjando<br>Milionários</h1>
      <p class="hero-subtitle">O ecossistema exclusivo onde <span class="highlight">networking de elite</span> encontra <span class="highlight">multiplicação de capital</span>.</p>
      
      <div class="social-proof">
        <div class="proof-number">${totalParticipantes}</div>
        <div class="proof-text">Visionários já fizeram parte dessa jornada</div>
        <div class="proof-alert">⚠️ Acesso exclusivo - Seleção rigorosa de participantes</div>
      </div>
      
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🧬</div>
          <div class="feature-title">Sistema de evolução preciso</div>
          <div class="feature-desc">Algoritmos avançados que maximizam seu potencial de crescimento exponencial</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🛡️</div>
          <div class="feature-title">Fortaleza Digital</div>
          <div class="feature-desc">Criptografia militar e proteção absoluta dos seus dados e transações</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🚀</div>
          <div class="feature-title">Velocidade Quântica</div>
          <div class="feature-desc">Acompanhamento em tempo real da expansão do seu império financeiro</div>
        </div>
      </div>
    </div>
    
    <div class="login-section">
      <div class="login-box">
        <div class="login-header">
          <div class="login-title">Área de Acesso</div>
          <div class="login-subtitle">Entre na matrix do sucesso</div>
        </div>
        <input type="text" id="loginNumero" placeholder="WhatsApp (11999999999)">
        <input type="password" id="loginSenha" placeholder="Senha de Acesso">
        <button class="btn-primary" onclick="login()">🔐 Acessar Minha Conta</button>
        <button class="btn-secondary" onclick="mostrarCadastro()">Quero participar desse Projeto</button>
        <div class="security-badge">
          <span>🔒</span>
          <span>Conexão criptografada e segura</span>
        </div>
      </div>
    </div>
  </div>
  
  <div id="modalCadastro">
    <div class="modal-content">
      <button class="close-modal" onclick="document.getElementById('modalCadastro').style.display='none'">×</button>
      <h3 class="modal-title">Iniciar Jornada</h3>
      <p class="modal-subtitle">Preencha seus dados para análise de admissão</p>
      
      <input id="cadNome" placeholder="Nome Completo *" required>
      <input id="cadEmail" placeholder="Email Profissional *" type="email" required>
      <input id="cadWhats" placeholder="WhatsApp (11999999999) *" required>
      <p class="input-hint">Digite apenas o DDD + número. O 55 (Brasil) será adicionado automaticamente.</p>
      <input id="cadCpf" placeholder="CPF *" required maxlength="14">
      <input id="cadRg" placeholder="RG *" required>
      <input id="cadPix" placeholder="Chave PIX Principal *" required>
      
      <div class="warning-box">
        ⚠️ <strong>Importante:</strong> Após o cadastro, realize sua contribuição inicial de R$${valorInicial},00 para ativação imediata. 
        Nossa equipe analisará seu perfil e liberará o acesso em até 24h. 
        <br><br>
        <strong>Documentos únicos:</strong> CPF, RG, e-mail e PIX só podem ser usados em uma conta ativa.
      </div>
      
      <button class="btn-primary" onclick="cadastrar()" style="margin-bottom: 0;">Solicitar Admissão</button>
    </div>
  </div>
  
  <script>
    // Máscara para CPF
    document.getElementById('cadCpf').addEventListener('input', function(e) {
      let value = e.target.value.replace(/\\D/g, '');
      if (value.length <= 11) {
        value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
        value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
        value = value.replace(/(\\d{3})(\\d{1,2})$/, '$1-$2');
      }
      e.target.value = value;
    });
    
    function mostrarCadastro() {
      document.getElementById('modalCadastro').style.display = 'flex';
    }
    
    function validarCPF(cpf) {
      cpf = cpf.replace(/\\D/g, '');
      if (cpf.length !== 11 || /^(\d)\\1+$/.test(cpf)) return false;
      let soma = 0, resto;
      for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
      resto = (soma * 10) % 11;
      if (resto === 10 || resto === 11) resto = 0;
      if (resto !== parseInt(cpf.substring(9, 10))) return false;
      soma = 0;
      for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
      resto = (soma * 10) % 11;
      if (resto === 10 || resto === 11) resto = 0;
      if (resto !== parseInt(cpf.substring(10, 11))) return false;
      return true;
    }
    
    function validarEmail(email) {
      return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
    }
    
    async function cadastrar() {
      const nome = document.getElementById('cadNome').value.trim();
      const email = document.getElementById('cadEmail').value.trim();
      const whatsapp = document.getElementById('cadWhats').value.trim();
      const cpf = document.getElementById('cadCpf').value.trim();
      const rg = document.getElementById('cadRg').value.trim();
      const pix = document.getElementById('cadPix').value.trim();
      
      // Validações
      if (!nome || !email || !whatsapp || !cpf || !rg || !pix) {
        alert('❌ Por favor, preencha todos os campos obrigatórios.');
        return;
      }
      
      if (!validarEmail(email)) {
        alert('❌ Por favor, insira um e-mail válido.');
        return;
      }
      
      if (!validarCPF(cpf)) {
        alert('❌ CPF inválido. Por favor, verifique.');
        return;
      }
      
      // Remove caracteres do WhatsApp
      const whatsLimpo = whatsapp.replace(/\\D/g, '');
      if (whatsLimpo.length < 10) {
        alert('❌ Número de WhatsApp inválido. Digite DDD + número completo.');
        return;
      }
      
      const btn = document.querySelector('#modalCadastro .btn-primary');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      
      try {
        const res = await fetch('/api/cadastrar', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            nome: nome,
            email: email,
            whatsapp: whatsLimpo, // Envia sem formatação
            cpf: cpf,
            rg: rg,
            pix: pix
          })
        });
        
        const data = await res.json();
        
        if(data.sucesso) {
          alert('✅ Solicitação enviada com sucesso!\\n\\nNossa equipe analisará seu perfil e entrará em contato via WhatsApp em breve.\\n\\nPrepare-se para fazer a doação inicial de R$${valorInicial},00 para liberar seu acesso.');
          document.getElementById('modalCadastro').style.display='none';
          // Limpa formulário
          document.querySelectorAll('#modalCadastro input').forEach(input => input.value = '');
        } else {
          alert('❌ ' + (data.erro || 'Erro ao cadastrar. Tente novamente.'));
        }
      } catch (e) {
        alert('❌ Erro de conexão. Verifique sua internet e tente novamente.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Solicitar Admissão';
      }
    }
    
    async function login() {
      const numero = document.getElementById('loginNumero').value.trim();
      const senha = document.getElementById('loginSenha').value;
      
      if (!numero || !senha) {
        alert('❌ Por favor, preencha login e senha.');
        return;
      }
      
      const btn = document.querySelector('.btn-primary');
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ numero: numero, senha: senha })
        });
        
        const data = await res.json();
        
        if(data.sucesso) {
          localStorage.setItem('token', data.token);
          window.location.href = '/painel';
        } else {
          alert('❌ ' + (data.erro || 'Credenciais inválidas'));
        }
      } catch (e) {
        alert('❌ Erro de conexão.');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔐 Acessar Minha Conta';
      }
    }
    
    // Enter para login
    document.getElementById('loginSenha').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') login();
    });
  </script>
</body>
</html>`);
});

// ==========================================
// PAINEL ADMIN
// ==========================================
appExpress.get('/admin', authAdmin, (req, res) => {
  try {
    db.garantirEstrutura();
    const projeções = db.calcularProjecoes();
    const arrecadado = db.data.admin.total_arrecadado || 0;
    const participantes = Object.values(db.data.participantes || {});
    
    const stats = {
      totalCadastrados: participantes.length,
      ativos: participantes.filter(p => p.estado === 'ativo').length,
      pendentes: participantes.filter(p => !p.doacao_para_admin_confirmada && p.estado === 'cadastrado').length,
      graduados: participantes.filter(p => p.estado === 'concluido').length,
      cancelados: participantes.filter(p => p.estado === 'cancelado').length,
      apadrinhados: (db.data.admin.apadrinhamentos || []).length,
      picoConcorrentes: db.data.metricas.pico_concorrentes || 0,
      velocidadeMedia: projeções.velocidade_diaria.toFixed(2)
    };

    let listaParticipantes = participantes
      .sort((a, b) => (b.timestamp_cadastro || 0) - (a.timestamp_cadastro || 0))
      .map(p => {
        const tempoRestante = p.timestamp_inicio_ciclo
          ? Math.max(0, Math.floor((72 * 60 * 60 * 1000 - (Date.now() - p.timestamp_inicio_ciclo)) / (1000 * 60 * 60)))
          : '-';
        
        let statusClass = 'status-gray';
        let statusText = 'Desconhecido';
        
        if (p.estado === 'concluido') {
          statusClass = 'status-green';
          statusText = 'GRADUADO';
        } else if (p.estado === 'cancelado') {
          statusClass = 'status-red';
          statusText = 'CANCELADO';
        } else if (p.doacao_para_admin_confirmada) {
          statusClass = 'status-blue';
          statusText = `Fase ${p.fase_atual} (${tempoRestante}h)`;
        } else {
          statusClass = 'status-orange';
          statusText = 'AGUARDANDO DOAÇÃO';
        }

        const podeConfirmar = !p.doacao_para_admin_confirmada && p.estado !== 'cancelado' && p.estado !== 'concluido';
        const numeroLimpo = p.numero.replace('@c.us', '');
        const lucroAtual = (p.fase_atual - 1) > 0 ? 
          Object.keys(VALORES_FASES).slice(0, p.fase_atual - 1).reduce((acc, f) => acc + VALORES_FASES[f], 0) : 0;

        return `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${numeroLimpo}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${p.amigos.amigo_1 ? '✓' : '○'} ${p.amigos.amigo_2 ? '✓' : '○'}</td>
          <td>R$ ${formatarNumero(lucroAtual)}</td>
          <td>R$ ${formatarNumero(obterValorFase(p.fase_atual))}</td>
          <td>
            ${podeConfirmar ? `<button class="btn-confirm" onclick="confirmar('${numeroLimpo}', '${p.nome}')">✓ CONFIRMAR R$${obterValorFase(p.fase_atual)}</button>` : '<span style="color:#666;">-</span>'}
            <button class="btn-delete" onclick="deletar('${numeroLimpo}', '${p.nome}')" style="margin-left:5px;">🗑️</button>
          </td>
        </tr>
        `;
      }).join('');

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forjando Milionários - Painel Admin</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
    }
    
    .header {
      background: linear-gradient(135deg, rgba(102,126,234,0.2), rgba(118,75,162,0.2));
      border-bottom: 2px solid #667eea;
      padding: 30px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 2.5em;
      font-weight: 800;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 30px;
    }
    
    .danger-zone {
      background: rgba(244,67,54,0.1);
      border: 2px solid #f44336;
      border-radius: 10px;
      padding: 15px;
      margin: 20px 0;
      text-align: center;
    }
    
    .btn-danger {
      background: linear-gradient(135deg, #f44336, #d32f2f);
      border: none;
      color: #fff;
      padding: 12px 25px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 700;
    }
    
    .metas-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 25px;
    }
    
    .meta-card {
      background: linear-gradient(135deg, rgba(0,0,0,0.4), rgba(102,126,234,0.1));
      border: 2px solid;
      border-radius: 20px;
      padding: 30px;
    }
    
    .meta-milhao { border-color: #ffd700; }
    .meta-dez-milhoes { border-color: #00bcd4; }
    
    .progress-container {
      background: rgba(0,0,0,0.3);
      border-radius: 15px;
      height: 30px;
      overflow: hidden;
      margin: 15px 0;
    }
    
    .progress-bar {
      height: 100%;
      border-radius: 15px;
      transition: width 0.5s ease;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 10px;
      font-weight: 700;
      font-size: 0.9em;
    }
    
    .meta-milhao .progress-bar {
      background: linear-gradient(90deg, #ffd700, #ffed4e);
      color: #000;
    }
    
    .meta-dez-milhoes .progress-bar {
      background: linear-gradient(90deg, #00bcd4, #00e5ff);
      color: #000;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 40px 0;
    }
    
    .stat-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(102,126,234,0.3);
      border-radius: 16px;
      padding: 25px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2.2em;
      font-weight: 800;
      color: #667eea;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 0.9em;
    }
    
    th {
      background: rgba(102,126,234,0.2);
      padding: 15px;
      text-align: left;
      color: #667eea;
      text-transform: uppercase;
      font-size: 0.85em;
    }
    
    td {
      padding: 12px 15px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    
    .btn-confirm {
      background: linear-gradient(135deg, #4caf50, #45a049);
      border: none;
      color: #fff;
      padding: 8px 15px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.8em;
    }
    
    .btn-delete {
      background: linear-gradient(135deg, #f44336, #d32f2f);
      border: none;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8em;
    }
    
    .status-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8em;
      font-weight: 600;
    }
    
    .status-green { background: rgba(76,175,80,0.2); color: #4caf50; }
    .status-red { background: rgba(244,67,54,0.2); color: #f44336; }
    .status-blue { background: rgba(33,150,243,0.2); color: #2196f3; }
    .status-orange { background: rgba(255,152,0,0.2); color: #ff9800; }
    
    .fase-legend {
      background: rgba(255,255,255,0.05);
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      font-size: 0.85em;
    }
    
    .fase-legend h4 { margin-bottom: 10px; color: #667eea; }
    .fase-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  </style>
</head>
<body>
  <div class="header">
    <h1>👑 PAINEL ADMINISTRATIVO</h1>
    <p>Sistema Forjando Milionários - Gestão Completa</p>
  </div>
  
  <div class="container">
    <div class="danger-zone">
      <h3 style="color: #f44336; margin-bottom: 10px;">⚠️ ZONA DE TESTES</h3>
      <button class="btn-danger" onclick="zerarTudo()">💣 ZERAR TUDO</button>
    </div>
    
    <div class="metas-grid">
      <div class="meta-card meta-milhao">
        <h3 style="color: #ffd700; margin-bottom: 15px;">💰 Primeiro Objetivo: R$ 1.000.000,00</h3>
        <div style="font-size: 2em; color: #ffd700; font-weight: 800; margin-bottom: 10px;">${formatarMoeda(arrecadado)}</div>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${projeções.percentual_milhao}%">${projeções.percentual_milhao.toFixed(4)}%</div>
        </div>
        <p>Faltam: ${formatarMoeda(Math.max(0, METAS.milhao - arrecadado))} | Previsão: ${projeções.data_milhao}</p>
      </div>
      
      <div class="meta-card meta-dez-milhoes">
        <h3 style="color: #00bcd4; margin-bottom: 15px;">🏆 Segundo Objetivo: R$ 10.000.000,00</h3>
        <div style="font-size: 2em; color: #00bcd4; font-weight: 800; margin-bottom: 10px;">${formatarMoeda(arrecadado)}</div>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${projeções.percentual_dez_milhoes}%">${projeções.percentual_dez_milhoes.toFixed(6)}%</div>
        </div>
        <p>Faltam: ${formatarMoeda(Math.max(0, METAS.dezMilhoes - arrecadado))} | Previsão: ${projeções.data_dez_milhoes}</p>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${formatarMoeda(arrecadado)}</div><div>Total Arrecadado</div></div>
      <div class="stat-card"><div class="stat-value">${stats.totalCadastrados}</div><div>Total Cadastrados</div></div>
      <div class="stat-card"><div class="stat-value">${stats.ativos}</div><div>Ativos Agora</div></div>
      <div class="stat-card"><div class="stat-value">${stats.pendentes}</div><div>Aguardando Doação</div></div>
      <div class="stat-card"><div class="stat-value">${stats.graduados}</div><div>Graduados</div></div>
      <div class="stat-card"><div class="stat-value">${stats.apadrinhados}</div><div>Apadrinhados pelo Admin</div></div>
    </div>
    
    <details class="fase-legend">
      <summary><h4 style="display:inline;">📊 Tabela de Valores das Fases</h4></summary>
      <div style="margin-top:15px; max-height: 300px; overflow-y: auto;">
        ${Object.entries(VALORES_FASES).map(([fase, valor]) => `
          <div class="fase-row">
            <span>Fase ${fase}</span>
            <span style="color:#ffd700;font-weight:600;">R$ ${formatarNumero(valor)}</span>
          </div>
        `).join('')}
      </div>
    </details>
    
    <h3 style="margin: 30px 0 20px; color: #667eea;">📋 Participantes</h3>
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>WhatsApp</th>
          <th>Status</th>
          <th>Amigos</th>
          <th>Lucro Acumulado</th>
          <th>Próxima Doação</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>${listaParticipantes}</tbody>
    </table>
  </div>
  
  <script>
    function confirmar(numero, nome) {
      if(confirm('Confirmar doação de ' + nome + '?')) {
        fetch('/api/admin/confirmar/' + numero, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa('admin:${ADMIN_SENHA}') }
        })
        .then(r => r.json())
        .then(data => {
          if(data.sucesso) {
            alert('✅ Confirmado! WhatsApp será enviado automaticamente.');
            location.reload();
          } else {
            alert('❌ Erro: ' + data.erro);
          }
        });
      }
    }
    
    function deletar(numero, nome) {
      if(confirm('ATENÇÃO: Deletar ' + nome + ' permanentemente irá banir todos os dados (CPF, RG, Email, PIX) do sistema. Continuar?')) {
        fetch('/api/admin/deletar/' + numero, {
          method: 'DELETE',
          headers: { 'Authorization': 'Basic ' + btoa('admin:${ADMIN_SENHA}') }
        })
        .then(r => r.json())
        .then(data => {
          if(data.sucesso) {
            alert('🗑️ Deletado e banido!');
            location.reload();
          } else {
            alert('❌ Erro: ' + data.erro);
          }
        });
      }
    }
    
    function zerarTudo() {
      const senha = prompt('DIGITE A SENHA DO ADMIN:');
      if(senha === '${ADMIN_SENHA}') {
        if(confirm('ISSO VAI APAGAR TUDO! Tem certeza?')) {
          fetch('/api/admin/resetar', {
            method: 'POST',
            headers: { 'Authorization': 'Basic ' + btoa('admin:${ADMIN_SENHA}') }
          })
          .then(r => r.json())
          .then(data => {
            if(data.sucesso) {
              alert('💥 Sistema zerado!');
              location.reload();
            }
          });
        }
      }
    }
    
    setInterval(() => location.reload(), 30000);
  </script>
</body>
</html>`);
  } catch (erro) {
    res.status(500).send('Erro: ' + erro.message);
  }
});

appExpress.post('/api/admin/confirmar/:numero', authAdmin, (req, res) => {
  const numero = formatarWhatsApp(req.params.numero);
  const resultado = db.confirmarDoacaoPropria(numero);
  
  if(resultado.sucesso) {
    // Envia mensagem imediatamente de forma síncrona para garantir entrega
    (async () => {
      try {
        const mensagem = `🎉 *PARABÉNS! SEU ACESSO FOI LIBERADO!* 🎉\n\n` +
          `👤 *Nome:* ${resultado.nome}\n` +
          `📱 *Login:* ${resultado.numero.replace('@c.us', '')}\n` +
          `🔑 *Senha:* ${resultado.senha}\n\n` +
          `💰 *Valor Confirmado:* R$ ${formatarNumero(resultado.valor)},00\n\n` +
          `🌐 *Acesse:* ${DOMINIO}/painel\n\n` +
          `⏰ *IMPORTANTE:* Você tem 72 HORAS para cadastrar 2 amigos!\n\n` +
          `⚠️ *Guarde sua senha:* ${resultado.senha}\n\n` +
          `Bem-vindo à Forja! 🚀`;

        const envio = await enviarWhatsApp(resultado.numero, mensagem);
        
        if(!envio.sucesso) {
          console.error('Falha ao enviar WhatsApp automaticamente:', envio.erro);
        }
      } catch(err) {
        console.error('Erro no envio automático:', err);
      }
    })();
    
    res.json({ sucesso: true, mensagem: 'Confirmado! Enviando credenciais via WhatsApp...' });
  } else {
    res.json({ erro: resultado.erro });
  }
});

appExpress.delete('/api/admin/deletar/:numero', authAdmin, (req, res) => {
  const numero = formatarWhatsApp(req.params.numero);
  const resultado = db.deletarParticipante(numero);
  res.json(resultado);
});

appExpress.post('/api/admin/resetar', authAdmin, (req, res) => {
  const resultado = db.resetarTudo();
  res.json(resultado);
});

// APIs públicas
appExpress.post('/api/cadastrar', (req, res) => {
  const dados = req.body;
  
  // Formata o número automaticamente
  dados.numero = formatarWhatsApp(dados.whatsapp);
  
  // Validações adicionais no servidor
  if (!dados.nome || !dados.email || !dados.cpf || !dados.rg || !dados.pix) {
    return res.json({ erro: 'Todos os campos são obrigatórios' });
  }
  
  // Remove caracteres especiais do CPF para armazenamento
  dados.cpf = dados.cpf.replace(/\D/g, '');
  
  const resultado = db.criarParticipante(dados);
  res.json(resultado.sucesso ? { sucesso: true } : { erro: resultado.erro });
});

appExpress.post('/api/login', (req, res) => {
  const { numero, senha } = req.body;
  const num = formatarWhatsApp(numero);
  const resultado = db.autenticarUsuario(num, senha);
  
  res.json(resultado.sucesso ? 
    { sucesso: true, token: resultado.token, dados: resultado.dados } : 
    { erro: resultado.erro }
  );
});

// Painel do usuário
appExpress.get('/painel', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forjando Milionários - Meu Painel</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💰</text></svg>">
  <style>
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63);
      color: #fff;
      margin: 0;
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: 250px 1fr;
      min-height: 100vh;
    }
    
    .sidebar {
      background: rgba(0,0,0,0.3);
      padding: 30px;
      border-right: 1px solid rgba(102,126,234,0.2);
    }
    
    .main { padding: 40px; }
    
    .stat-card {
      background: rgba(255,255,255,0.05);
      border-radius: 15px;
      padding: 25px;
      margin-bottom: 20px;
      border: 1px solid rgba(102,126,234,0.2);
    }
    
    .btn {
      background: linear-gradient(135deg, #667eea, #764ba2);
      border: none;
      color: #fff;
      padding: 15px 30px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      margin-right: 10px;
      margin-bottom: 10px;
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .amigo-card {
      background: rgba(255,255,255,0.03);
      border-radius: 10px;
      padding: 20px;
      margin: 10px 0;
      border: 1px solid rgba(102,126,234,0.2);
    }
    
    .progress-bar {
      width: 100%;
      height: 20px;
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s;
    }
    
    .valor-fase {
      background: rgba(255,215,0,0.1);
      border: 1px solid rgba(255,215,0,0.3);
      border-radius: 8px;
      padding: 10px;
      margin: 10px 0;
      text-align: center;
    }
    
    .valor-fase strong {
      color: #ffd700;
      font-size: 1.2em;
    }
    
    @media (max-width: 768px) {
      .dashboard { grid-template-columns: 1fr; }
      .sidebar {
        border-right: none;
        border-bottom: 1px solid rgba(102,126,234,0.2);
      }
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="sidebar">
      <h2 style="color: #667eea; margin-bottom: 30px;">⚙️ FM</h2>
      <p id="userName" style="font-size: 1.2em; font-weight: 600;">Carregando...</p>
      <p id="userFase" style="color: #667eea; margin-top: 10px;">Fase 1/${TOTAL_FASES}</p>
      <button onclick="sair()" style="margin-top: 30px; background: rgba(244,67,54,0.2); border: 1px solid #f44336; color: #f44336; padding: 10px 20px; border-radius: 8px; cursor: pointer; width: 100%;">Sair</button>
    </div>
    
    <div class="main">
      <h1 style="margin-bottom: 30px;">Painel de Controle</h1>
      
      <div class="stat-card">
        <h3>Progresso</h3>
        <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
        <p>Fase <span id="faseAtual">1</span> de ${TOTAL_FASES}</p>
      </div>
      
      <div class="stat-card">
        <h3>Tempo Restante</h3>
        <p id="timer" style="font-size: 2em; color: #ff9800; font-weight: 700;">72:00:00</p>
        <p style="color: rgba(255,255,255,0.6);">Você tem 72 horas para cadastrar 2 amigos após a confirmação da doação.</p>
      </div>
      
      <div class="stat-card">
        <h3>Próxima Doação</h3>
        <div class="valor-fase">
          Valor da Fase Atual: <strong id="valorFase">R$ 50,00</strong>
        </div>
        <p style="color: rgba(255,255,255,0.6); font-size: 0.9em;">
          Ao completar esta fase, você receberá o dobro do valor investido.
        </p>
      </div>
      
      <div class="stat-card">
        <h3>Seus Amigos</h3>
        <div id="amigosList"><p>Carregando...</p></div>
        <button class="btn" id="btnCadastrar" onclick="cadastrarAmigo()" style="margin-top: 15px;">+ Cadastrar Amigo</button>
      </div>
      
      <div class="stat-card" style="background: rgba(255,215,0,0.05); border-color: #ffd700;">
        <h3 style="color: #ffd700;">💰 Seu Saldo</h3>
        <p style="font-size: 2em; color: #ffd700; font-weight: 700;">R$ <span id="saldo">0,00</span></p>
        <p style="color: rgba(255,255,255,0.6);">Lucro acumulado por fases completadas</p>
      </div>
    </div>
  </div>
  
  <script>
    let token = localStorage.getItem('token');
    if(!token) window.location.href = '/';
    
    const valoresFases = ${JSON.stringify(VALORES_FASES)};
    
    async function carregar() {
      try {
        const res = await fetch('/api/meus-dados', {headers: {'Authorization': 'Bearer '+token}});
        const data = await res.json();
        
        if(data.erro) {
          localStorage.clear();
          window.location.href = '/';
          return;
        }
        
        document.getElementById('userName').textContent = data.dados.nome;
        document.getElementById('userFase').textContent = 'Fase ' + data.dados.fase + '/${TOTAL_FASES}';
        document.getElementById('faseAtual').textContent = data.dados.fase;
        document.getElementById('progressFill').style.width = ((data.dados.fase / ${TOTAL_FASES}) * 100) + '%';
        
        // Calcula saldo acumulado
        let saldoAcumulado = 0;
        for(let i = 1; i < data.dados.fase; i++) {
          saldoAcumulado += valoresFases[i] || 0;
        }
        document.getElementById('saldo').textContent = saldoAcumulado.toLocaleString('pt-BR', {minimumFractionDigits: 2});
        
        // Atualiza valor da fase atual
        const valorAtual = valoresFases[data.dados.fase] || 0;
        document.getElementById('valorFase').textContent = 'R$ ' + valorAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2});
        
        if(data.dados.tempo_restante_hrs !== null) {
          document.getElementById('timer').textContent = data.dados.tempo_restante_hrs + ':00:00';
          if(data.dados.tempo_restante_hrs <= 0) document.getElementById('timer').style.color = '#f44336';
        } else {
          document.getElementById('timer').textContent = 'Aguardando confirmação...';
        }
        
        const podeCadastrar = data.dados.doacao_confirmada && data.dados.estado === 'ativo';
        document.getElementById('btnCadastrar').disabled = !podeCadastrar;
        
        if(!podeCadastrar) {
          document.getElementById('btnCadastrar').title = 'Aguarde a confirmação da doação pelo administrador';
        }
        
        let html = '';
        if(data.dados.amigos_cadastrados.amigo_1) {
          html += '<div class="amigo-card">✓ <strong>' + data.dados.amigos_cadastrados.amigo_1.nome + '</strong></div>';
        }
        if(data.dados.amigos_cadastrados.amigo_2) {
          html += '<div class="amigo-card">✓ <strong>' + data.dados.amigos_cadastrados.amigo_2.nome + '</strong></div>';
        }
        if(!data.dados.amigos_cadastrados.amigo_1 && !data.dados.amigos_cadastrados.amigo_2) {
          html = '<p style="color: rgba(255,255,255,0.5);">Nenhum amigo cadastrado ainda.</p>';
        }
        document.getElementById('amigosList').innerHTML = html;
        
      } catch(e) {
        console.error('Erro ao carregar dados:', e);
      }
    }
    
    function sair() {
      localStorage.clear();
      window.location.href = '/';
    }
    
    function cadastrarAmigo() {
      const nome = prompt('Nome completo do amigo:');
      if(!nome) return;
      
      const numero = prompt('WhatsApp (11999999999):');
      if(!numero) return;
      
      const btn = document.getElementById('btnCadastrar');
      btn.disabled = true;
      btn.textContent = 'Cadastrando...';
      
      fetch('/api/cadastrar-amigo', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer '+token},
        body: JSON.stringify({slot: 'auto', nome, numero})
      })
      .then(r => r.json())
      .then(data => {
        if(data.sucesso) {
          alert('✅ Amigo cadastrado com sucesso! Ele receberá as instruções via WhatsApp.');
          carregar();
        } else {
          alert('❌ Erro: ' + (data.erro || 'Erro desconhecido'));
        }
      })
      .catch(e => {
        alert('❌ Erro de conexão.');
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = '+ Cadastrar Amigo';
      });
    }
    
    carregar();
    setInterval(carregar, 30000);
  </script>
</body>
</html>`);
});

appExpress.get('/api/meus-dados', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.json({erro: 'Não autenticado'});
  
  const sessao = db.verificarToken(token);
  if(!sessao) return res.json({erro: 'Sessão expirada'});
  
  res.json({dados: db.getStatus(sessao.numero)});
});

appExpress.post('/api/cadastrar-amigo', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.json({erro: 'Não autenticado'});
  
  const sessao = db.verificarToken(token);
  if(!sessao) return res.json({erro: 'Sessão expirada'});
  
  const {nome, numero, slot} = req.body;
  const p = db.getParticipante(sessao.numero);
  
  let slotUsar = slot;
  if (!slotUsar || slotUsar === 'auto') {
    if (!p.amigos.amigo_1) slotUsar = 'amigo_1';
    else if (!p.amigos.amigo_2) slotUsar = 'amigo_2';
    else return res.json({erro: 'Você já cadastrou 2 amigos'});
  }
  
  const resultado = db.cadastrarAmigo(sessao.numero, slotUsar, {
    nome,
    numero: numero.replace(/\D/g,''),
    email: '',
    cpf: '',
    rg: '',
    pix: ''
  });
  
  if(resultado.sucesso) {
    // Envia mensagem para o novo amigo
    (async () => {
      try {
        const mensagem = `🎉 *BEM-VINDO A FORJA!* 🎉\n\n` +
          `Você foi cadastrado por ${p.nome}.\n\n` +
          `👤 *Nome:* ${resultado.dados.nome}\n` +
          `📱 *Login:* ${resultado.dados.numero.replace('@c.us', '')}\n` +
          `🔑 *Senha:* ${resultado.senha}\n\n` +
          `💰 *Sua contribuição inicial:* R$ ${obterValorFase(1)},00\n\n` +
          `🌐 *Acesse:* ${DOMINIO}/painel\n\n` +
          `⚠️ Faça sua doação de R$${obterValorFase(1)},00 para liberar seu acesso!\n\n` +
          `*Guarde sua senha:* ${resultado.senha}\n\n` +
          `Entraremos em contato assim que confirmarmos seu pagamento.`;
          
        await enviarWhatsApp(resultado.dados.numero, mensagem);
      } catch(err) {
        console.error('Erro ao enviar WhatsApp para novo amigo:', err);
      }
    })();
  }
  
  res.json(resultado.sucesso ? 
    {sucesso: true, senha: resultado.senha} : 
    {erro: resultado.erro}
  );
});

appExpress.get('/qr', async (req, res) => {
  // Se já estiver conectado, mostra status ao invés de erro
  if(estaPronto && clientWhatsApp) {
    return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forjando Milionários - Status WhatsApp</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, #0a0a0a, #1a1a2e);
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      color: #fff;
    }
    .status-box {
      text-align: center;
      padding: 40px;
      background: rgba(76,175,80,0.1);
      border: 2px solid #4caf50;
      border-radius: 20px;
    }
    .icon { font-size: 4rem; margin-bottom: 20px; }
    h2 { color: #4caf50; margin-bottom: 10px; }
    p { color: rgba(255,255,255,0.7); }
  </style>
</head>
<body>
  <div class="status-box">
    <div class="icon">✅</div>
    <h2>WhatsApp Conectado!</h2>
    <p>O sistema está online e pronto para enviar mensagens.</p>
    <p style="margin-top: 20px; font-size: 0.9em; color: #667eea;">
      Número: ${infoWhatsApp ? infoWhatsApp.wid.user : 'Carregando...'}
    </p>
  </div>
</body>
</html>`);
  }
  
  // Se não estiver conectado, mostra QR Code
  if(!qrCodeAtual) {
    return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Forjando Milionários - Aguardando</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: #1a1a2e;
      color: #fff;
      font-family: sans-serif;
      text-align: center;
    }
  </style>
</head>
<body>
  <div>
    <h2>⏳ Gerando QR Code...</h2>
    <p>Aguarde alguns segundos e recarregue a página.</p>
  </div>
</body>
</html>`);
  }
  
  try {
    const url = await QRCodeLib.toDataURL(qrCodeAtual);
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forjando Milionários - QR Code</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #0a0a0a, #1a1a2e);
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      color: #fff;
      text-align: center;
    }
    .container { padding: 20px; }
    h2 { color: #667eea; margin-bottom: 30px; }
    img {
      width: 300px;
      height: 300px;
      border-radius: 20px;
      box-shadow: 0 0 40px rgba(102,126,234,0.3);
    }
    p { margin-top: 30px; color: rgba(255,255,255,0.7); line-height: 1.6; }
    .steps {
      background: rgba(255,255,255,0.05);
      padding: 20px;
      border-radius: 15px;
      margin-top: 30px;
      text-align: left;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }
    .steps ol { padding-left: 20px; }
    .steps li { margin: 10px 0; color: rgba(255,255,255,0.8); }
  </style>
</head>
<body>
  <div class="container">
    <h2>📱 Escaneie com o WhatsApp</h2>
    <img src="${url}" alt="QR Code WhatsApp">
    <div class="steps">
      <ol>
        <li>Abra o WhatsApp no seu celular</li>
        <li>Toque em <strong>Mais opções</strong> (⋮) ou <strong>Configurações</strong></li>
        <li>Selecione <strong>Aparelhos Conectados</strong></li>
        <li>Toque em <strong>Conectar um aparelho</strong></li>
        <li>Aponte a câmera para este QR Code</li>
      </ol>
    </div>
    <p style="font-size: 0.9em; color: #ff9800;">
      ⚠️ Não feche esta página até a conexão ser estabelecida
    </p>
  </div>
</body>
</html>`);
  } catch(e) {
    res.status(500).send('Erro ao gerar QR Code: ' + e.message);
  }
});

// Iniciar servidor
const HOST = '0.0.0.0';
appExpress.listen(PORT, HOST, () => {
  console.log('=========================================');
  console.log('⚙️  Forjando Milionários - Sistema Iniciado');
  console.log('🌐  Público: ' + DOMINIO);
  console.log('👑  Admin: ' + DOMINIO + '/admin');
  console.log('🔑  Senha Admin: ' + ADMIN_SENHA);
  console.log('📱  QR Code: ' + DOMINIO + '/qr');
  console.log('=========================================');
  console.log('');
  console.log('⏳  Aguardando conexão WhatsApp...');
  console.log('');
});

// Iniciar WhatsApp
iniciarWhatsApp();