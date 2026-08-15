# Checklist de implantação de segurança

Execute primeiro em um deploy de preview. Não promova para produção até concluir os testes autenticados de login, Firestore, App Check e Mercado Pago.

## Firebase Authentication e autorização

- [ ] Criar e configurar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no Vercel. Manter a chave privada somente como variável server-side; quebras de linha escapadas como `\n` são aceitas pelo código.
- [ ] Autorizar os operadores da integração usando Custom Claim `admin: true`, `AUTHORIZED_FIREBASE_UIDS` ou `AUTHORIZED_GOOGLE_EMAILS`. O legado `MERCADO_PAGO_OWNER_FIREBASE_UID` continua aceito durante a migração.
- [ ] Confirmar que somente contas Google com e-mail verificado recebem autorização financeira.
- [ ] Revisar periodicamente a allowlist/Custom Claims e remover acessos que não sejam mais necessários.

## Firebase App Check

- [ ] Criar uma chave reCAPTCHA Enterprise para os domínios de preview controlados e `www.psyzon.com.br`.
- [ ] Configurar `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` no Vercel e validar que tokens App Check aparecem nas métricas do Firebase.
- [ ] Usar token de debug somente em ambiente local e nunca salvar o token em `.env.example`, Git, logs ou tickets.
- [ ] Monitorar as métricas antes de ativar enforcement para Authentication, Firestore e demais produtos compatíveis.
- [ ] Ativar enforcement gradualmente no Firebase Console somente depois de confirmar login Google, sincronização em tempo real, PWA e dispositivos móveis no preview.

## Firestore e Storage

- [x] Publicar `firestore.rules` no projeto Firebase `psyzon-go`.
- [ ] Publicar `storage.rules` depois de ativar o plano Blaze e provisionar o bucket padrão em uma localização aprovada.
- [x] Reexecutar a suíte do Emulator antes da publicação das regras (9/9 testes aprovados).
- [x] Confirmar pela API oficial de avaliação do ruleset publicado que um UID não acessa `/users/{outroUid}/...` e que a raiz `/users` não pode ser listada.
- [ ] Repetir visualmente os dois cenários no Rules Playground quando uma sessão de navegador controlável estiver disponível.
- [x] Manter Firebase Storage negado por padrão até existir um caso de upload com caminho, tamanho e MIME explicitamente validados.

## Google Cloud e chaves públicas

- [ ] Restringir a chave `NEXT_PUBLIC_FIREBASE_API_KEY` aos domínios autorizados e somente às APIs exigidas pelo Firebase usado pelo site.
- [ ] Confirmar que essa chave não tem acesso à Generative Language API/Gemini e nunca reutilizá-la como chave de IA.
- [ ] Manter chaves Gemini/Groq, service accounts e tokens Mercado Pago sem prefixo `NEXT_PUBLIC_`.
- [ ] Rotacionar imediatamente qualquer segredo que seja identificado no histórico do Git, logs, builds anteriores ou sistemas de terceiros.

## Vercel e Mercado Pago

- [ ] Adicionar `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, allowlists e credenciais Firebase Admin somente como variáveis privadas do Vercel.
- [ ] Configurar `ALLOWED_ORIGINS=https://www.psyzon.com.br` em produção; incluir apenas previews/desenvolvimento explicitamente controlados quando necessário.
- [ ] Validar no Firestore que a coleção server-only `securityRateLimits` recebe contadores distribuídos sem expor IP em claro.
- [ ] Configurar também Vercel Firewall/rate limiting na borda para proteção anterior à função, sem substituir o limitador transacional por usuário/IP implementado no código.
- [ ] Conferir a assinatura e a URL do webhook do Mercado Pago no painel do provedor.

## Preview e promoção

- [ ] Fazer primeiro um deploy de preview com todas as variáveis específicas do preview.
- [ ] Testar o popup Google e confirmar que CSP/COOP não o bloqueiam.
- [ ] Testar leitura, escrita e sincronização em tempo real de pedidos, clientes, transações, contas e notas com uma conta de teste autorizada.
- [ ] Testar a importação Mercado Pago com uma transação de teste e conferir respostas `401`, `403`, `400`, `405` e `429`.
- [ ] Confirmar no DevTools que `/api/`, Firebase, Google, respostas `no-store` e requisições com `Authorization` não aparecem no Cache Storage do service worker.
- [ ] Confirmar que nenhum segredo privado aparece nos bundles, source maps, HTML, logs ou respostas da API.
- [ ] Revisar violações CSP e erros de App Check no console; não relaxar a política com curingas genéricos.
- [ ] Somente depois promover o preview validado para produção.
- [ ] Confirmar que todos os subdomínios usados são exclusivamente HTTPS antes de acrescentar `includeSubDomains` e `preload` ao HSTS.
