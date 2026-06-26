const fs = require('fs');
const path = require('path');

// Caminhos para os novos arquivos de banco local
const cachePlacasPath = path.join(__dirname, 'banco', 'cache_placas.json');
const historicoPlacasPath = path.join(__dirname, 'banco', 'historico_placas.json');

// Função auxiliar para ler arquivos JSON com segurança
const lerJSON = (caminho) => {
    try {
        if (!fs.existsSync(caminho)) return [];
        const dados = fs.readFileSync(caminho, 'utf-8');
        return dados ? JSON.parse(dados) : [];
    } catch (erro) {
        console.error(`Erro ao ler arquivo ${caminho}:`, erro);
        return [];
    }
};

// Função auxiliar para salvar arquivos JSON
const salvarJSON = (caminho, dados) => {
    try {
        fs.writeFileSync(caminho, JSON.stringify(dados, null, 2), 'utf-8');
    } catch (erro) {
        console.error(`Erro ao salvar arquivo ${caminho}:`, erro);
    }
};

// ROTA V4.4 - Consulta por Placa
app.get('/api/placa', (req, res) => {
    try {
        const { placa } = req.query;

        if (!placa) {
            return res.status(400).json({ erro: 'A placa é obrigatória. Exemplo: ?placa=ABC1D23' });
        }

        // Normaliza a placa (letras maiúsculas e sem espaços/hifens)
        const placaFormatada = placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (placaFormatada.length !== 7) {
            return res.status(400).json({ erro: 'Placa inválida. Certifique-se de que possui 7 caracteres.' });
        }

        // 1. Verificar se já existe no cache local
        const cachePlacas = lerJSON(cachePlacasPath);
        const veiculoNoCache = cachePlacas.find(v => v.placa === placaFormatada);

        if (veiculoNoCache) {
            console.log(`[Placa] ${placaFormatada} encontrada no cache local.`);
            
            // Registra no histórico de buscas mesmo se vier do cache
            const historico = lerJSON(historicoPlacasPath);
            historico.push({ placa: placaFormatada, data: new Date().toISOString(), origem: 'cache' });
            salvarJSON(historicoPlacasPath, historico);

            return res.json(veiculoNoCache.dados);
        }

        // 2. Mock/Simulação (Enquanto não integramos a API real no próximo passo)
        // Isso garante que você consiga testar o fluxo no ERP imediatamente sem custos.
        const dadosSimuladosVeiculo = {
            marca: "VOLKSWAGEN",
            modelo: "GOL",
            versao: "1.6 MSI TOTAL FLEX 4P",
            ano: "2020",
            combustivel: "FLEX",
            motor: "1.6",
            cambio: "MANUAL"
        };

        // 3. Salvar no Cache Local
        cachePlacas.push({
            placa: placaFormatada,
            dados: dadosSimuladosVeiculo,
            atualizadoEm: new Date().toISOString()
        });
        salvarJSON(cachePlacasPath, cachePlacas);

        // 4. Salvar no Histórico Geral
        const historico = lerJSON(historicoPlacasPath);
        historico.push({
            placa: placaFormatada,
            data: new Date().toISOString(),
            origem: 'api_externa_mock'
        });
        salvarJSON(historicoPlacasPath, historico);

        console.log(`[Placa] ${placaFormatada} processada e salva com sucesso.`);
        return res.json(dadosSimuladosVeiculo);

    } catch (erro) {
        console.error('Erro na rota de placa:', erro);
        return res.status(500).json({ erro: 'Erro interno no servidor ao processar a placa.' });
    }
});
