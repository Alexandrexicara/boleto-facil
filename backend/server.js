require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use('/api/boleto', require('./routes/boletos'));

// O antigo gerador Pix não quitava necessariamente o boleto original.
// Mantemos a rota explicitamente bloqueada até existir integração homologada.
app.use('/api/pagamento', (req, res) => res.status(410).json({
  erro: 'Pagamento desativado: esta versão é somente leitora. A liquidação depende de integração oficial com o credor e instituição financeira.'
}));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'boleto-facil-reader' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.listen(PORT, () => console.log('Boleto Fácil leitor iniciado na porta ' + PORT));
