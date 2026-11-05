# Decisão de arquitetura — núcleo determinístico, sem API de IA

## Decisão

O núcleo do Boleto Fácil não depende de modelos generativos nem de APIs externas de inteligência artificial. A leitura e interpretação de boletos devem usar bibliotecas determinísticas, padrões bancários documentados, validação matemática e consultas autenticadas a fontes oficiais.

Essa decisão favorece previsibilidade, auditabilidade, privacidade, operação em ambientes bancários restritos e homologação por equipes de segurança.

## Componentes do núcleo

1. Captura de imagem/câmera ou entrada da linha digitável.
2. Decodificação de código de barras por biblioteca local.
3. Normalização de linha digitável de 47 posições para código de barras de 44 posições.
4. Validação dos dígitos verificadores e extração apenas dos campos efetivamente codificados.
5. Consulta do registro da cobrança por integração autorizada.
6. Cotação oficial de encargos pelo credor/participante.
7. Instrução de pagamento emitida pelo banco/PSP habilitado.
8. Confirmação server-to-server e baixa da obrigação pelo credor.

Nenhuma regra de IA poderá escolher beneficiário, alterar valor, calcular juros contratuais, autorizar pagamento ou declarar liquidação.

## OCR opcional

OCR pode ser usado apenas como recurso auxiliar para tentar recuperar a linha digitável quando a foto estiver ruim. A saída do OCR deve sempre passar pela validação matemática do backend. OCR não comprova autenticidade, beneficiário, saldo devedor ou pagamento.

Para implantação bancária, o OCR deve ser opcional, executado localmente ou em infraestrutura privada aprovada pelo banco. Não enviar imagens de boletos a serviços públicos de IA/OCR sem autorização contratual, avaliação de segurança, base legal e controles de proteção de dados.

## Política de dependências e dados

- Preferir bibliotecas open-source versionadas, auditadas e hospedadas no próprio ambiente do banco.
- Evitar scripts e modelos carregados de CDNs públicas em implantação produtiva bancária; usar artefatos internos, CSP restritiva, controle de integridade e processo de atualização.
- Não transmitir imagem, linha digitável ou dados pessoais para provedores de IA.
- Aplicar minimização de dados, criptografia em trânsito e repouso, segregação de ambientes, controle de acesso, retenção definida e trilha de auditoria.
- Manter autenticação do cliente e autorização de pagamento dentro do canal do banco integrador.
- Não armazenar credenciais bancárias nem dados de cartão no Boleto Fácil.

## White-label e integração

O banco integrador controla a autenticação, o consentimento, a consulta às fontes financeiras e a execução do pagamento. O Boleto Fácil fornece componentes de captura, interpretação, validação e orquestração técnica conforme contrato e escopos concedidos.

Cada integração financeira exige contrato, credenciais, homologação e confirmação técnica do participante responsável. A existência deste documento não significa que o Boleto Fácil já tenha acesso à Núclea, a bancos ou a sistemas de liquidação.

## Estado e próximos marcos

Esta decisão define a arquitetura-alvo; não significa que as integrações financeiras estejam implementadas. Antes de produção, executar revisão de código e dependências, testes automatizados, testes de segurança, validação dos padrões de boleto e homologação individual com os parceiros.
