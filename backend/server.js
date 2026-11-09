require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { testarConexao } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;
const nvidiaConfigured = Boolean(process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || process.env.NGC_API_KEY);

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });
global.upload = upload;

app.get('/api/health', async (req, res) => {
  let database = 'not_configured';
  try { database = await testarConexao() ? 'connected' : 'not_configured'; }
  catch (error) { database = 'error'; }
  res.json({ ok: true, service: 'boleto-facil', database, nvidiaConfigured });
});

app.use('/api/boleto', require('./routes/boletos'));
app.use('/api/pagamento', require('./routes/pagamento'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, async () => {
  console.log('Boleto Fácil ativo na porta ' + PORT);
  console.log('NVIDIA Vision API configurada:', nvidiaConfigured);
  try {
    const connected = await testarConexao();
    console.log('Conexão Neon PostgreSQL:', connected ? 'OK' : 'DATABASE_URL ausente');
  } catch (error) {
    console.error('Falha na conexão Neon PostgreSQL:', error.message);
  }
});
