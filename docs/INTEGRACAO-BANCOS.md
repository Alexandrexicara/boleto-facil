# Boleto Fácil — contrato de integração universal

## Objetivo
O Boleto Fácil é um motor de captura e interpretação de boletos para licenciamento/white-label por bancos, fintechs e instituições autorizadas. Não recebe dinheiro, não mantém saldo, não atua como banco, instituição de pagamento ou correspondente por conta própria.

## Fluxo de referência
1. Captura: câmera, fotografia ou linha digitável recebida de uma interface bancária.
2. Interpretação: normalização da linha digitável (47) para código de barras (44), validação dos dígitos e extração de banco, moeda, valor original e fator/data de vencimento quando codificados.
3. Identificação: instituição integradora consulta fontes autorizadas para obter beneficiário, pagador, contrato/fatura e situação da obrigação. O nome do banco emissor não prova quem é o beneficiário.
4. Atualização: credor/participante autorizado devolve valor vigente, juros, multa, desconto, data limite e regras aplicadas. Nunca calcular encargos contratuais por regra genérica.
5. Pagamento: o banco do usuário executa o pagamento em trilho aceito pelo credor. Pix só pode ser oferecido como quitação se o credor/integrador emitir cobrança Pix válida e garantir conciliação/baixa da obrigação original.
6. Confirmação: receber evento autenticado (webhook assinado e/ou consulta server-to-server) do participante responsável. Conferir identificador da cobrança, valor, moeda, beneficiário, status final, horário, end-to-end ID/NSU e idempotência. Só então marcar liquidado.
7. Baixa: confirmar com o credor/servicer a baixa da dívida. Guardar trilha de auditoria e disponibilizar comprovante emitido pelo participante real, sem fabricar comprovante.

## Contrato sugerido para integração bancária
O banco mantém autenticação do cliente e consentimento. Não enviar CPF/CNPJ em claro ao leitor sem necessidade. A integração deve usar OAuth 2.0/mTLS ou mecanismo corporativo equivalente, escopos mínimos, criptografia, rotação de segredos, rate limit, idempotency keys e logs sem dados sensíveis.

### POST /api/boleto/interpretar
Entrada: { "codigoBarras": "47 ou 44 dígitos" }
Saída atual: leitura validada, banco emissor por código COMPE, valor impresso e vencimento codificado. Beneficiário, encargos, pagamento e baixa permanecem explicitamente não confirmados.

### Contratos que o banco/credor precisa implementar
- resolveBeneficiary: valida boleto/convênio e retorna beneficiário legal, documento mascarado, contrato e estado da cobrança.
- quoteDebt: retorna valor atualizado, memória de cálculo, vencimento da cotação, descontos e fonte da regra.
- createSettlementInstruction: retorna boleto atualizado ou cobrança Pix oficialmente vinculada à obrigação, com identificador único e beneficiário verificado.
- settle: executado pelo banco/PSP do usuário; exige autorização explícita do cliente.
- getSettlementStatus: consulta transação por identificador idempotente.
- confirmDebtDischarge: confirmação final de baixa do credor/servicer.

## Regras de segurança obrigatórias
- Não inferir beneficiário pelo código do banco.
- Não considerar OCR, print, QR gerado localmente ou resposta do navegador como prova de pagamento.
- Não criar Pix estático para substituir boleto sem vínculo de quitação.
- Não declarar pago por status "created", "pending" ou "processing".
- Só considerar pagamento liquidado após status final confirmado pela fonte financeira; baixa da dívida exige confirmação do credor.
- Rejeitar divergência de valor, beneficiário, moeda ou identificador.
- Tratar boleto de arrecadação/convênio (48 dígitos) com parser próprio, nunca como boleto bancário comum.
- Implementar LGPD: finalidade, minimização, retenção, direitos do titular, controle de acesso e registro de operações.
- Homologar cada integração e trilho de pagamento antes de produção.

## Estado desta versão
Implementados: captura por câmera/foto, leitura por ZXing, fallback OCR de linha digitável, validação de boleto bancário 44/47, extração de dados codificados e API de interpretação.
Não implementados: consulta universal de beneficiário, cálculo oficial de encargos, conexão com CIP/participantes/credores, iniciação de pagamento bancário, Pix de liquidação, webhooks financeiros, conciliação e baixa automática. Essas funções exigem contratos, credenciais e homologação com participantes reais.
