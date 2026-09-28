# Fluxo de entrada e painel

## Resultado
- A página inicial (`/`) encaminhará direto para a tela de login.
- Após entrar ou criar a conta, o usuário será levado para `/dashboard`.
- O dashboard exibirá todas as histórias/personagens disponíveis e manterá o acesso à criação de novos personagens.
- Links de retorno do chat e dos formulários passarão a levar ao dashboard.
- O endereço antigo `/characters` continuará funcionando e redirecionará para o dashboard.

## Detalhes técnicos
- Reaproveitar o catálogo atual como conteúdo do dashboard, sem alterar conversas ou personagens.
- Atualizar os redirecionamentos de autenticação e navegação interna.
- Validar o fluxo de entrada e o carregamento do dashboard na prévia.
