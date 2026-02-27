const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017');
        this.dbName = 'forja_extrema';
        this.collection = null;
    }

    async conectar() {
        try {
            await this.client.connect();
            const db = this.client.db(this.dbName);
            this.collection = db.collection('participantes');
            
            // Índices para evitar duplicidade
            await this.collection.createIndex({ numero: 1 }, { unique: true });
            await this.collection.createIndex({ cpf: 1 }, { unique: true });
            
            console.log("🔌 MongoDB Conectado: Pronto para Adoção de Órfãos!");
        } catch (err) {
            console.error("❌ Erro ao conectar banco:", err);
        }
    }

    async criarParticipante(dados) {
        return await this.collection.insertOne({
            ...dados,
            dataCadastro: new Date()
        });
    }

    async buscarParticipante(numero) {
        return await this.collection.findOne({ numero });
    }

    async buscarPorNumeroOuCPF(numero, cpf) {
        return await this.collection.findOne({ $or: [{ numero }, { cpf }] });
    }

    async atualizarStatus(idFinal, novoStatus) {
        const updateData = { status: novoStatus };
        if (novoStatus === 'ativo') {
            updateData.dataAtivacao = new Date();
        }
        return await this.collection.updateOne(
            { numero: idFinal },
            { $set: updateData }
        );
    }

    async atualizarFase(idFinal, novaFase) {
        return await this.collection.updateOne(
            { numero: idFinal },
            { $set: { fase: parseInt(novaFase) } }
        );
    }

    // --- NOVAS FUNÇÕES DE GESTÃO E ADOÇÃO ---

    async adotarOrfaos(numeroPaiDeletado, numeroAdmin) {
        // Altera o indicadoPor de todos os filhos para o Admin
        return await this.collection.updateMany(
            { indicadoPor: numeroPaiDeletado },
            { $set: { indicadoPor: numeroAdmin + '@c.us' } }
        );
    }

    async removerPorExpiracao(numero) {
        return await this.collection.deleteOne({ numero });
    }

    async buscarRede(numeroPai) {
        return await this.collection.find({ indicadoPor: numeroPai }).toArray();
    }

    async listarTudo() {
        return await this.collection.find().toArray();
    }

    async resetarBancoTotal() {
        return await this.collection.deleteMany({});
    }
}

module.exports = new Database();