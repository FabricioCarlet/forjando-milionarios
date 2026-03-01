const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        // Usamos a URL do Atlas (Render) ou Local
        this.client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017');
        this.dbName = 'forja_extrema';
        this.collection = null;
    }

    async conectar() {
        try {
            await this.client.connect();
            const db = this.client.db(this.dbName);
            // IMPORTANTE: Garantir que a collection seja a mesma usada no app.js
            this.collection = db.collection('participantes'); 
            
            // Índices para evitar que alguém use o mesmo CPF ou Telefone duas vezes
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

    // --- GESTÃO DE ÓRFÃOS ---
    async adotarOrfaos(numeroPaiDeletado, numeroAdmin) {
        // Garante que o ID do Admin esteja no formato correto (com @c.us se não tiver)
        const idAdmin = numeroAdmin.includes('@') ? numeroAdmin : `${numeroAdmin}@c.us`;
        
        return await this.collection.updateMany(
            { indicadoPor: numeroPaiDeletado },
            { $set: { indicadoPor: idAdmin } }
        );
    }

    async removerPorExpiracao(numero) {
        return await this.collection.deleteOne({ numero });
    }

    async listarTudo() {
        return await this.collection.find().toArray();
    }

    // --- RESET SEGURO ---
    async resetarBancoTotal() {
        // Apaga todos os participantes, EXCETO quem foi indicado como 'direto' (Geralmente o Admin)
        // Isso evita que você seja deslogado do sistema após o reset
        return await this.collection.deleteMany({ indicadoPor: { $ne: 'direto' } });
    }
}

module.exports = new Database();