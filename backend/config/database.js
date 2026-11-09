const { Pool } = require('pg');
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('.neon.tech') ? { rejectUnauthorized: false } : undefined,
    max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000
  });
  pool.on('error', error => console.error('Erro inesperado no pool PostgreSQL:', error.message));
}
async function testarConexao() {
  if (!pool) return false;
  await pool.query('SELECT 1');
  return true;
}
async function registrarLeitura({ tipo, status, origem, codigoValidado, motor, erro }) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      'INSERT INTO boleto_leituras (tipo_documento, status_leitura, origem, codigo_validado, motor_leitura, erro_leitura) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [tipo || 'não identificado', status || 'parcial', origem || 'imagem', Boolean(codigoValidado), motor || null, erro || null]
    );
    return result.rows[0] ? result.rows[0].id : null;
  } catch (error) {
    console.error('Não foi possível registrar a leitura no Neon:', error.message);
    return null;
  }
}
module.exports = { pool, testarConexao, registrarLeitura };
