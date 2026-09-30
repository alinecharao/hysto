# Excluir e gerar mensagens novamente

## Alterações
- Adicionar ações discretas em cada balão para apagar uma mensagem salva.
- Ao apagar uma mensagem antiga, remover também as mensagens seguintes para manter a história coerente.
- Nas respostas da IA, adicionar “Gerar novamente”; a resposta atual será substituída usando a última mensagem do usuário, sem duplicá-la no histórico.
- Pedir confirmação antes de excluir trechos da conversa e bloquear ações enquanto uma resposta estiver sendo criada.

## Detalhes técnicos
- Ajustar o envio para distinguir uma nova mensagem de uma regeneração.
- Sincronizar imediatamente a conversa exibida e o histórico salvo após excluir ou regenerar.
- Validar no celular o menu das mensagens, a exclusão e a regeneração.
