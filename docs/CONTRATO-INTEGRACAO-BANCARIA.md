# Contrato de integração bancária — Boleto Fácil

**Versão:** 1.0  
**Estado:** especificação de referência; não representa integração ativa nem homologação.

## 1. Objetivo e fronteiras

Este contrato define como uma instituição financeira, cooperativa, fintech ou credor autorizado pode integrar o Boleto Fácil em uma experiência white-label.

O Boleto Fácil pode fornecer captura, leitura, normalização, validação matemática e orquestração técnica. A instituição parceira permanece responsável por autenticar o cliente, obter consentimentos, consultar registros financeiros oficiais, apresentar as condições finais, autorizar a transação, movimentar recursos e confirmar a liquidação/baixa.

A integração só pode ser ativada depois de contrato, credenciais, definição de papéis, avaliação de segurança, testes e homologação com cada participante.

## 2. Princípios obrigatórios

- **Fonte oficial:** beneficiário, situação do título, valor atualizado, juros, multa, desconto e instrução de pagamento devem vir do participante autorizado ou da fonte oficial indicada por ele.
- **Sem inferência:** código de barras, OCR ou nome impresso não são prova suficiente de identidade do beneficiário ou de quitação.
- **Sem pagamento substituto:** gerar um Pix avulso para o beneficiário não equivale a liquidar o boleto. Pix só pode ser usado quando a instituição/credor emitir uma cobrança vinculada à obrigação e confirmar sua baixa.
- **Autorização no banco:** autenticação, consentimento e confirmação do pagamento ocorrem no canal controlado pela instituição financeira.
- **Sem custódia pelo Boleto Fácil:** a plataforma não recebe, guarda, transfere ou administra fundos do pagador.
- **Sem segredo no navegador:** credenciais bancárias, chaves privadas e tokens de parceiro nunca são enviados ao frontend.
- **Sem IA no núcleo:** leitura, validação, regras financeiras e estados de pagamento são determinísticos e auditáveis.

## 3. Fluxo de referência

1. O app captura a imagem ou recebe a linha digitável.
2. O backend interpreta o código e valida formato e dígitos verificadores.
3. A instituição parceira consulta o registro da cobrança por canal autorizado.
4. A instituição retorna os dados oficiais do beneficiário e as condições vigentes para pagamento.
5. O app mostra os dados confirmados e solicita autorização explícita do cliente.
6. O banco/PSP executa a operação no seu próprio ambiente.
7. O parceiro envia confirmação autenticada de liquidação.
8. O credor ou sistema responsável confirma a baixa da obrigação.
9. O Boleto Fácil exibe somente os estados comprovados pelas respostas assinadas/validadas.

Qualquer etapa indisponível deve interromper o fluxo sem simular sucesso.

## 4. Contrato lógico de API

Os caminhos abaixo são nomes lógicos de referência. O parceiro pode adaptá-los à sua API, desde que preserve semântica, segurança e rastreabilidade.

### 4.1 Consultar cobrança

`POST /v1/boletos/consultas`

Cabeçalhos mínimos:
- `Authorization: Bearer <token-de-serviço>`
- `Idempotency-Key: <identificador-único>`
- `X-Correlation-ID: <identificador-de-rastreio>`
- `Content-Type: application/json`

Requisição:

```json
{
  "codigoBarras": "44 dígitos validados",
  "canal": "white_label",
  "referenciaCliente": "identificador opaco emitido pelo banco"
}
```

Resposta de sucesso da consulta (exemplo ilustrativo):

```json
{
  "consultaId": "consult_01",
  "status": "cobranca_encontrada",
  "beneficiario": {
    "nome": "Nome confirmado pelo participante",
    "documentoMascarado": "**.***.***/****-**"
  },
  "pagador": {
    "nome": "Nome conforme regra de acesso do parceiro"
  },
  "boleto": {
    "codigoBarras": "44 dígitos",
    "vencimento": "2026-11-10",
    "valorOriginal": 125.50,
    "valorAtualizado": 128.10,
    "moeda": "BRL"
  },
  "encargos": {
    "juros": 1.10,
    "multa": 1.50,
    "desconto": 0.00,
    "fonte": "sistema_autorizado",
    "consultadoEm": "2026-11-05T12:00:00Z"
  },
  "pagamentoPermitido": true,
  "expiraEm": "2026-11-05T12:05:00Z"
}
```

O exemplo não define valores, beneficiários ou regras reais. O parceiro deve fornecer os campos efetivamente disponíveis, sua origem e validade.

### 4.2 Solicitar autorização/iniciação

`POST /v1/pagamentos`

A solicitação deve referenciar `consultaId`, valor exato confirmado e uma chave de idempotência. O parceiro deve apresentar a autorização no canal bancário apropriado. O Boleto Fácil não deve receber senha, PIN, CVV ou credenciais do cliente.

Resposta inicial possível:
- `aguardando_autorizacao`
- `recusado`
- `expirado`

A resposta inicial nunca pode ser interpretada como pagamento liquidado.

### 4.3 Consultar estado

`GET /v1/pagamentos/{pagamentoId}`

Estados mínimos:
- `aguardando_autorizacao`
- `autorizado`
- `processando`
- `liquidado`
- `recusado`
- `cancelado`
- `estornado`
- `falha`

A instituição deve documentar transições válidas e estados terminais. `autorizado` não significa `liquidado`.

### 4.4 Webhook de liquidação e baixa

O parceiro envia evento server-to-server contendo:
- identificador único do evento;
- `pagamentoId` e `consultaId`;
- estado e horário oficial;
- valor e moeda efetivamente liquidados;
- identificador de conciliação;
- informação separada sobre a baixa da obrigação, quando fornecida pelo credor.

Requisitos:
- assinatura HMAC ou assinatura assimétrica, conforme padrão acordado;
- timestamp e proteção contra replay;
- lista de IPs apenas como controle adicional, nunca como autenticação única;
- idempotência por identificador de evento;
- repetição com backoff e fila de falhas;
- endpoint de consulta para reconciliação em caso de webhook perdido.

A plataforma só marca `liquidado` após validar evento/consulta autenticada. Só marca `baixaConfirmada` quando o credor ou sistema responsável confirmar explicitamente a baixa.

## 5. Segurança, privacidade e auditoria

Antes da homologação, parceiro e fornecedor devem acordar:
- controlador/operador e demais papéis de tratamento de dados;
- finalidade, base legal, minimização e retenção;
- criptografia TLS em trânsito e criptografia em repouso;
- autenticação mútua ou OAuth 2.0 client credentials, conforme arquitetura do parceiro;
- rotação e revogação de credenciais;
- segregação entre sandbox, homologação e produção;
- limites de taxa, proteção contra abuso e monitoramento;
- logs sem dados bancários completos, tokens ou imagens desnecessárias;
- trilha de auditoria com correlação ponta a ponta;
- plano de incidentes, continuidade, recuperação e comunicação;
- pentest, análise de dependências, SBOM e gestão de vulnerabilidades;
- política de retenção e descarte seguro de imagens e dados pessoais.

Nenhum dado real de cliente deve ser usado em testes sem autorização formal e controles apropriados.

## 6. Idempotência, concorrência e consistência

- Requisições de consulta e pagamento devem aceitar chave de idempotência.
- Repetir uma solicitação com a mesma chave não pode criar um segundo pagamento.
- A cotação de valor deve possuir validade explícita; após expirar, consultar novamente.
- O valor autorizado deve corresponder exatamente à cotação apresentada.
- Webhooks duplicados não podem duplicar efeitos.
- Divergências entre pagamento liquidado e baixa do credor devem gerar estado de exceção e reconciliação, nunca confirmação presumida.

## 7. Homologação e critérios de aceite

A integração não pode ir para produção até que todos os itens aplicáveis sejam aprovados:

1. Contrato assinado e papéis regulatórios/operacionais definidos.
2. Credenciais e escopos emitidos pelo parceiro.
3. Documentação de API, ambientes e suporte recebida.
4. Validação de boleto e consulta de beneficiário testadas com casos positivos e negativos.
5. Valor atualizado, vencimento, encargos, desconto e expiração conferidos contra a fonte oficial.
6. Consentimento e autorização do cliente testados no canal do parceiro.
7. Pagamento recusado, pendente, expirado, duplicado, liquidado e estornado testados.
8. Webhook assinado, repetido, atrasado, inválido e fora de ordem testado.
9. Baixa do credor e conciliação comprovadas.
10. Segurança, privacidade, observabilidade, suporte e plano de incidentes aprovados.
11. Aprovação formal do parceiro e liberação de produção.

## 8. Adaptadores por instituição

Implementar um adaptador isolado por parceiro. O núcleo não deve conter URLs, tokens, códigos de banco ou regras proprietárias fixas. Cada adaptador converte o contrato do parceiro para o modelo interno comum e registra versão, ambiente e escopos autorizados.

Não presumir que uma integração com um banco dá acesso automático a todos os bancos, credores ou à infraestrutura centralizada de boletos.

## 9. Estado atual do repositório

Na versão atual, o Boleto Fácil faz leitura/interpretação local e validação matemática de códigos suportados. A consulta real de beneficiário, cotação oficial, iniciação de pagamento, liquidação, baixa e conciliação ainda dependem de parceiros e não estão implementadas. Nenhum endpoint ilustrativo deste documento deve ser tratado como funcional.

## 10. Informações que o parceiro precisa fornecer

- Nome da instituição e entidade contratante.
- Produtos e tipos de boleto suportados.
- Documentação e versão das APIs.
- Regras de autenticação, consentimento e escopos.
- Ambiente de testes e massa de dados fictícia.
- Modelo de consulta e resposta de cobrança.
- Regras de atualização/expiração de valores.
- Fluxo de autorização e iniciação de pagamento.
- Estados, webhooks, assinatura e reconciliação.
- Requisitos de segurança, privacidade, auditoria e certificação.
- Processo, agenda e critérios de homologação.
- SLA, suporte técnico e gestão de incidentes.
