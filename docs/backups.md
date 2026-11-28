# Backups da conta

- A Vercel chama `GET /api/backups/weekly` aos domingos às 06:00 UTC, equivalentes a 03:00 em America/Bahia. O endpoint exige o `CRON_SECRET` privado já usado pelo agendamento diário.
- O processo roda no servidor com o site fechado. Uma mesma semana usa um identificador único por conta; uma trava impede execuções simultâneas.
- Cada conta em `users` é percorrida recursivamente, incluindo subcoleções de documentos pais ausentes. As leituras dos documentos usam uma transação somente de leitura. A descoberta de subcoleções ocorre durante a coleta; não é um serviço nativo de recuperação pontual do Firestore.
- Os registros preservam IDs, referências, timestamps com nanossegundos, bytes, valores e imagens embutidas. O cofre permanece criptografado como no documento de origem.
- As cópias ficam em `accountBackups/{uid}/snapshots`, fora dos dados editados ou apagados pela interface. O arquivo JSON versionado é comprimido com gzip, dividido em blocos privados e conferido com SHA-256 após a gravação. Uma cópia só aparece na interface depois da verificação.
- São mantidas as oito cópias semanais, três manuais e três anteriores a recuperações mais recentes. Uma falha não remove a última cópia válida.
- Configurações permite conferir a última cópia, gerar uma nova, baixar `.json.gz` e revisar uma recuperação. Preferências e rascunhos presentes somente em um navegador não fazem parte da cópia automática dos dados sincronizados.

## Recuperação

O usuário revisa quantos registros voltarão, mudarão ou serão removidos e confirma expressamente. A prévia expira em dez minutos, pertence à conta autenticada e só pode ser usada uma vez. Se os dados da empresa mudarem, é necessário revisar novamente.

Antes de escrever, é criada e verificada uma cópia do estado atual. As regras bloqueiam novas escritas da conta durante a recuperação, e as APIs normais respondem com 423. Os clientes conectados exibem a janela de recuperação e recarregam ao terminar. O usuário deve fechar outros aparelhos antes de recuperar, especialmente aparelhos com alterações offline ainda não sincronizadas.

As escritas usam transações em blocos com verificação das versões esperadas. Ao concluir, uma nova leitura confere o resultado. Se houver falha, os blocos concluídos são revertidos; se outra alteração impedir a reversão, o sistema informa a interrupção e mantém a cópia anterior disponível.

O arquivo contém todos os documentos da conta, mas a recuperação pela interface preserva o estado atual de permissões da IA, contadores de uso, auditoria, recibos de idempotência e estado das integrações. Esses controles não podem voltar no tempo para liberar ações repetidas ou alterar acessos. Os dados de negócio, conversas, notas, imagens, históricos e cofre são recuperados.

## Limites e acesso

As cópias da nuvem ficam no próprio projeto Firebase. Não substituem uma cópia fora do projeto contra sua exclusão completa. O download fornece essa cópia externa; a interface recupera as cópias verificadas que continuam guardadas no servidor. Credenciais do backend e contas do Firebase Authentication não são exportadas.

Não há importação de arquivos arbitrários pela interface. O arquivo baixado contém o formato completo para recuperação administrativa. Os limites atuais são 20 mil documentos e 96 MiB descomprimidos por cópia; exceder esses limites produz falha explícita, sem publicar uma cópia incompleta.

Teste unitário: `npm run test:backups`.

Teste de recuperação, reversão e regras, exclusivamente no emulador local: `npm run test:rules` com Java 21+.
