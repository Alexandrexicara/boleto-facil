# Plano de parceiros e homologação — Boleto Fácil

**Atualizado em:** 05/11/2026  
**Objetivo:** encontrar um participante financeiro e um provedor de infraestrutura que possam habilitar consulta oficial e pagamento de boletos dentro de uma oferta white-label.

> Este documento é uma análise inicial de canais públicos. Não indica parceria, aprovação, acesso contratado, disponibilidade de API para terceiros ou homologação concluída.

## 1. Estratégia recomendada

Buscar dois tipos de parceiro, que podem ou não ser a mesma instituição:

1. **Infraestrutura de registro/status de boleto:** acesso autorizado à consulta de dados e situação da cobrança registrada.
2. **Instituição de pagamento/banco:** consulta operacional, autorização do cliente, pagamento por código de barras, confirmação e conciliação.

A primeira conversa deve ser com a Núclea para entender os requisitos comerciais e técnicos de sua Plataforma de Consulta de Status de Boleto. Em paralelo, conversar com bancos e provedores BaaS que tenham APIs de pagamento de boletos para clientes empresariais ou parceiros.

Não apresentar o Boleto Fácil como banco, instituição iniciadora ou custodiante. A proposta inicial é licenciar software, SDK e experiência white-label, deixando autenticação, consentimento, execução e liquidação sob responsabilidade do parceiro autorizado.

## 2. Alvos prioritários identificados em fontes públicas

| Prioridade | Organização | Evidência pública | O que perguntar | Limite conhecido |
|---|---|---|---|---|
| 1 | Núclea | Plataforma de Consulta de Status de Boleto anuncia consulta por código de barras/linha digitável e vencimento. | Requisitos de contratação, elegibilidade, API, sandbox, escopos, dados retornados, preço, SLA e homologação. | A página descreve consulta de status; não comprova que a API faça pagamento ou disponibilize todos os dados/encargos da cobrança. |
| 2 | Banco Inter | Documentação pública descreve API Banking com inclusão de pagamento por código de barras e consulta de pagamentos. | Acesso para fornecedor white-label, modelo de parceria, titularidade da conta, pagamentos de boletos de terceiros, limites e homologação. | A API é apresentada para integração com o sistema de gestão do parceiro; acesso e escopo dependem de relacionamento e contrato. |
| 3 | Banco BS2 | Developer Hub apresenta APIs de cobrança, conta corrente, Pix, onboarding e boleto híbrido. | Se existe API de pagamento de boleto de terceiros, consulta de cobrança registrada, parceria BaaS e modelo de revenda/white-label. | A página pública consultada não comprova consulta universal de beneficiário nem pagamento universal de boletos. |
| 4 | Banco do Brasil | API BB Pay apresenta checkout via API, redirecionamento seguro para o App BB, consulta/devolução e pagamento via Open Finance. | Se o BB Pay aceita o caso de uso Boleto Fácil, quais modalidades de pagamento e quais requisitos para fornecedor tecnológico. | Pré-requisitos públicos incluem PJ cliente BB, contrato BB, convênio válido e cadastro no portal; a página não confirma consulta universal de boletos. |
| 5 | Celcoin / provedores de infraestrutura | Documentação pública apresenta soluções de iniciação de pagamentos/Open Finance e serviços de infraestrutura. | Se oferecem parceria BaaS/white-label para consulta e pagamento de boletos ou apenas iniciação Pix; pedir escopos, requisitos e documentação específica. | Iniciação Pix/Open Finance não deve ser confundida com consulta universal de dívida ou liquidação de boleto. |

## 3. Fontes oficiais consultadas

- Núclea — Plataforma de Consulta de Status de Boleto: https://institucional.nuclea.com.br/plataforma-de-consulta-de-status-de-boleto
- Banco Inter — APIs: https://developers.inter.co/docs/introducao/nossas-apis
- Banco BS2 — Developer Hub: https://www.bancobs2.com.br/the-bs2-developer-hub/
- Banco do Brasil — API BB Pay: https://www.bb.com.br/site/developers/api-bb-pay/
- Celcoin — Iniciação de Pagamentos: https://developers.celcoin.com.br/docs/gest%C3%A3o-de-consentimento
- Banco Central — Registro do boleto e base centralizada operada pela Núclea: https://www.bcb.gov.br/meubc/faqs/p/registro-do-boleto
- Open Finance Brasil — Quem participa: https://openfinancebrasil.org.br/quem-participa/
- Open Finance Brasil — Onboarding de ITPs: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/1210318906/Onboarding+de+Iniciadores+de+Transa+es+de+Pagamentos+ITPs

## 4. Perguntas obrigatórias na primeira reunião

1. A instituição aceita integrar um fornecedor de software white-label que não recebe nem mantém fundos de clientes?
2. Existe ambiente de sandbox e processo formal de homologação para fornecedores?
3. É possível consultar a cobrança registrada usando apenas código de barras/linha digitável, sem o usuário informar manualmente CNPJ ou beneficiário?
4. Quais dados oficiais são retornados: beneficiário, pagador, vencimento, valor, situação, juros, multa, desconto, instruções e validade da cotação?
5. A consulta cobre boletos de outros bancos/beneficiários ou somente cobranças emitidas pela própria instituição?
6. Existe pagamento por código de barras para boletos de terceiros? Quais contas e perfis podem executar?
7. Como o cliente autoriza o pagamento? O fluxo ocorre integralmente no app/site do banco?
8. Como são enviados os estados de autorização, processamento, liquidação, estorno e baixa?
9. Há webhook assinado, consulta de reconciliação, idempotência e identificador de transação?
10. Quais são preços, mínimos mensais, tarifas por consulta/pagamento, SLA, limites e suporte?
11. Quais exigências de segurança, LGPD, auditoria, certificações, pentest e gestão de incidentes?
12. É permitido licenciar a experiência com marca do banco e distribuir SDK/API a outros clientes empresariais?

## 5. Material a apresentar

- Demonstração da leitura de código de barras e linha digitável.
- Arquitetura sem IA no núcleo financeiro.
- Contrato técnico de integração: `docs/CONTRATO-INTEGRACAO-BANCARIA.md`.
- Decisão arquitetural: `docs/ARQUITETURA-SEM-IA.md`.
- Fluxo em que o banco mantém autenticação, consentimento, pagamento e liquidação.
- Lista transparente do que já existe e do que depende de integração externa.

Não demonstrar telas fictícias como se fossem conexão real. Na demonstração, deixar explícito que a versão atual valida a leitura, mas não consulta beneficiário nem realiza pagamento.

## 6. Modelo de abordagem institucional

**Assunto:** Proposta de integração tecnológica white-label — Boleto Fácil

Prezada equipe,

Estamos desenvolvendo o Boleto Fácil, uma plataforma tecnológica white-label para simplificar a leitura e o pagamento de boletos bancários em aplicativos, portais e canais digitais de instituições financeiras.

A solução permite capturar o código de barras pela câmera ou por imagem, interpretar a linha digitável e validar matematicamente os dados. Nosso objetivo é integrar essa experiência à infraestrutura autorizada de uma instituição parceira, para que a consulta da cobrança, confirmação do beneficiário, atualização do valor, autorização do cliente, pagamento e confirmação da baixa ocorram diretamente nos sistemas oficiais do parceiro.

O Boleto Fácil não pretende atuar como banco, custodiar recursos ou substituir a infraestrutura de liquidação. A proposta é licenciar a tecnologia por API, SDK ou implantação white-label, mantendo autenticação, consentimento e execução financeira sob responsabilidade da instituição contratante.

Gostaríamos de conhecer os requisitos técnicos, comerciais e de segurança para uma possível parceria, incluindo documentação de APIs, ambiente de testes, modelo de acesso à consulta de boletos registrados, pagamento por código de barras, webhooks de liquidação e processo de homologação.

Podemos apresentar a arquitetura, a demonstração de leitura e o contrato técnico de integração para avaliação da equipe responsável.

Atenciosamente,

Equipe Boleto Fácil

## 7. Critérios para avançar ou descartar

Avançar quando o parceiro:
- aceitar formalmente o modelo de fornecedor tecnológico white-label;
- oferecer caminho contratual para consulta de cobrança e pagamento por código de barras;
- documentar ambiente de testes e homologação;
- confirmar os dados retornados e a origem oficial;
- oferecer confirmação autenticada de liquidação e processo de conciliação.

Não considerar suficiente uma API que apenas emite boletos, cria Pix avulso, consulta saldo/extrato ou inicia Pix genérico. Essas funções não comprovam que o boleto original foi liquidado nem que a obrigação foi baixada.

## 8. Próximas ações

1. Enviar abordagem institucional à Núclea e solicitar reunião técnica/comercial.
2. Solicitar ao Banco Inter e ao BS2 avaliação de parceria para pagamento de boletos de terceiros por API.
3. Consultar o Banco do Brasil sobre elegibilidade do Boleto Fácil no BB Pay.
4. Avaliar provedores BaaS somente após confirmar suporte explícito ao fluxo de boleto, não apenas Pix.
5. Registrar respostas, requisitos, custos e documentos recebidos no repositório.
6. Implementar adaptador somente depois de receber documentação oficial e acesso autorizado ao ambiente de homologação.
