# Boleto Fácil — Leitor universal

Leitor de boletos bancários para integração e licenciamento a bancos, fintechs e instituições autorizadas.

## O que esta versão faz
- Captura pela câmera do dispositivo ou seleção de fotografia.
- Decodifica código de barras com ZXing.
- Usa OCR em português como alternativa para localizar a linha digitável impressa.
- Valida boleto bancário com 44 dígitos e linha digitável com 47 dígitos.
- Extrai banco emissor pelo código COMPE, valor original codificado e vencimento quando disponível.
- Disponibiliza API de interpretação e documentação OpenAPI.

## O que não faz
- Não identifica o beneficiário com certeza apenas pelo código de barras.
- Não consulta dívida, parcelas, juros, multa ou descontos.
- Não gera Pix para substituir boleto.
- Não movimenta saldo, inicia pagamento, confirma liquidação ou dá baixa na dívida.

Essas etapas dependem de integrações autorizadas com bancos, credores, sistemas de cobrança e participantes de liquidação, além de contratos, credenciais, segurança e homologação. O sistema não deve declarar pagamento concluído sem confirmação financeira autenticada e confirmação de baixa pelo credor.

## Executar
```bash
npm ci
npm test
npm start
```
Acesse `http://localhost:3000`.

## API
- `POST /api/boleto/interpretar` — JSON `{ "codigoBarras": "..." }`
- `GET /health` — verificação básica.
- `openapi.yaml` — contrato da API.
- `docs/INTEGRACAO-BANCOS.md` — arquitetura e contratos necessários para integração.

## Segurança
A interface não solicita CPF, CNPJ ou e-mail para ler o documento. A autenticação do cliente deve permanecer no aplicativo do banco integrador. Não envie dados pessoais ao leitor sem necessidade.
