# Consulta bancária de situação do boleto

## O que o Boleto Fácil já faz localmente

- Lê linha digitável/código de barras e valida os dígitos verificadores.
- Extrai valor, vencimento, beneficiário e encargos que estejam legíveis.
- Calcula dias de atraso usando a data local de Brasília.
- Só estima multa e juros quando os valores e a periodicidade aparecem de forma identificável no documento.
- Não marca pagamento, baixa, registro ou possibilidade de pagamento como confirmados sem resposta de uma fonte autorizada.

## Integração externa necessária

A Núclea oferece uma plataforma de consulta pontual de status de boletos. A consulta utiliza linha digitável e data de vencimento e informa situações como pago integralmente, pago parcialmente, não pago ou baixado pelo emissor.

Página oficial: https://www.nuclea.com.br/plataforma-de-consulta-de-status-de-boleto/

A documentação pública da página comercial não fornece o contrato técnico completo da API, endpoint, autenticação ou credenciais. Portanto, não foi criada uma chamada fictícia nem uma integração presumida.

Para ativar a consulta real, será necessário obter com a Núclea:
1. Contrato/credenciamento e autorização de uso.
2. Documentação técnica atual (OpenAPI/Swagger), ambiente e endpoint de produção.
3. Método de autenticação e credenciais.
4. Limites, custos por consulta e política de retenção dos dados.

Com isso, deve ser implementado um adaptador de provedor no backend. A resposta deverá preservar o status original, a fonte, o horário da consulta e o identificador de rastreio. Falhas, indisponibilidade ou respostas incompletas devem resultar em `nao_consultado` ou `inconclusivo`, nunca em “não pago”.

## Segunda via e regularização

A segunda via atualizada depende do banco emissor ou do beneficiário. O Boleto Fácil não deve gerar um novo documento nem alterar vencimento/encargos por conta própria. Após obter API autorizada do emissor ou de um parceiro de cobrança, será possível solicitar segunda via e valor atualizado, mantendo o boleto original como referência.

## Testes

Os testes automatizados cobrem datas, dias em atraso, multa, juros com periodicidade explícita, desconto dentro do prazo e bloqueio de total quando as regras são insuficientes. O teste real de leitura deve usar uma imagem de boleto de teste e comparar os campos com o documento e com a tela de confirmação do banco.
