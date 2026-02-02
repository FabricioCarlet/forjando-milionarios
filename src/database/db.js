const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/sistema.json');
const LOG_PATH = path.join(__dirname, '../../data/logs.txt');

class Database {
  constructor() {
    this.data = this.carregar();
  }

  carregar() {
    try {
      if (!fs.existsSync(DB_PATH)) {
        const inicial = {
          admin: {
            numero: process.env.ADMIN_NUMERO || '5511999999999',
            nome: 'Administrador',
            total_arrecadado: 0,
            participantes: []
          },
          participantes: {},
          transacoes: [],
          config: {
            valor_fase: 10,
            max_fases: 5,
            ativo: true
          }
        };
        this.salvar(inicial);
        return inicial;
      }
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (erro) {
      console.error('Erro ao carregar banco:', erro);
      process.exit(1);
    }
  }

  salvar(dados = this.data) {
    try {
      if (!fs.existsSync(path.dirname(DB_PATH))) {
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2));
      this.log('SISTEMA', 'Dados persistidos com sucesso');
    } catch (erro) {
      console.error('Erro ao salvar:', erro);
    }
  }

  log(categoria, mensagem) {
    const linha = `[${new Date().toISOString()}] [${categoria}] ${mensagem}\n`;
    fs.appendFileSync(LOG_PATH, linha);
  }

  getParticipante(numero) {
    return this.data.participantes[numero];
  }

  addParticipante(numero, dados) {
    this.data.participantes[numero] = {
      ...dados,
      admin_cadastrador: this.data.admin.numero,
      fase_atual: 1,
      status: 'aguardando_amigos',
      data_entrada: new Date().toISOString(),
      amigos: { amigo_1: null, amigo_2: null },
      confirmacoes: {
        fase_1: { amigo_1: false, amigo_2: false, doacao_admin: false },
        fase_2: { amigo_1: false, amigo_2: false, doacao_admin: false },
        fase_3: { amigo_1: false, amigo_2: false, doacao_admin: false },
        fase_4: { amigo_1: false, amigo_2: false, doacao_admin: false },
        fase_5: { amigo_1: false, amigo_2: false, doacao_admin: false }
      },
      bloqueado: false,
      historico: []
    };
    this.data.admin.participantes.push(numero);
    this.salvar();
    return this.data.participantes[numero];
  }

  atualizarParticipante(numero, dados) {
    this.data.participantes[numero] = { ...this.data.participantes[numero], ...dados };
    this.salvar();
  }
}

module.exports = new Database();