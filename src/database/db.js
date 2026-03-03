const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = new MongoClient(process.env.MONGO_URL);
        this.dbName = 'forja_extrema';
        this.collection = null;
    }

    async conectar() {
        try {
            await this.client.connect();
            const db = this.client.db(this.dbName);
            this.collection = db.collection('participantes'); 
            await this.collection.createIndex({ numero: 1 }, { unique: true });
            await this.collection.createIndex({ cpf: 1 }, { unique: true });
            console.log("🔌 MongoDB Conectado!");
        } catch (err) { console.error("❌ Erro banco:", err); }
    }

    async criarParticipante(dados) {
        return await this.collection.insertOne({ ...dados, dataCadastro: new Date() });
    }

    async buscarParticipante(numero) {
        return await this.collection.findOne({ numero });
    }

    async buscarRede(numeroPai) {
        return await this.collection.find({ indicadoPor: numeroPai }).toArray();
    }

    async buscarPorNumeroOuCPF(numero, cpf) {
        return await this.collection.findOne({ $or: [{ numero }, { cpf }] });
    }

    async atualizarStatus(idFinal, novoStatus) {
        const updateData = { status: novoStatus };
        if (novoStatus === 'ativo') updateData.dataAtivacao = new Date();
        return await this.collection.updateOne({ numero: idFinal }, { $set: updateData });
    }

    async removerPorExpiracao(numero) {
        return await this.collection.deleteOne({ numero });
    }

    async adotarOrfaos(numeroPaiDeletado, numeroAdmin) {
        const idAdmin = numeroAdmin.includes('@') ? numeroAdmin : `${numeroAdmin}@c.us`;
        return await this.collection.updateMany({ indicadoPor: numeroPaiDeletado }, { $set: { indicadoPor: idAdmin } });
    }

    async listarTudo() {
        return await this.collection.find().toArray();
    }

    async resetarBancoTotal() {
        return await this.collection.deleteMany({ indicadoPor: { $ne: 'direto' } });
    }
}

module.exports = new Database();