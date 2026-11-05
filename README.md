# PSYZON GO

Controle de produção, clientes, despesas mensais e contas a pagar e receber para a PSYZON Company. O projeto
usa React/Vinext, Cloud Firestore e Firebase Authentication com login Google.

## Operação diária

- Os botões de voltar/avançar do navegador e do mouse navegam entre as telas.
- Em Clientes, o lápis edita total comprado e saldo pendente. Os ajustes continuam
  recebendo os valores de novos pedidos. A lixeira remove o cadastro da lista e
  preserva pedidos e recebíveis históricos.
- O Financeiro concentra contas mensais, únicas e parceladas, a pagar ou receber,
  e despesas pagas por mês. As telas de saldo empresarial/pessoal, movimentações
  avulsas, conexão bancária e assistente geral foram retiradas da interface.
- Na criação ou edição de pedido, anexe uma foto JPG, PNG ou WebP de até 10 MB.
  A foto é reduzida para até 1.200 pixels e salva com o pedido no Firestore.
- Em Bloco de notas → Checklist de produção → Colar pedido, cole a lista recebida.
  “Organizar lista” funciona localmente; “Organizar com IA” usa os provedores do
  servidor pelo endpoint autenticado `/api/production-checklist`. Revise a tabela,
  marque peças conferidas e use “PDF / Imprimir A4”. O progresso é salvo na nota.
  O exemplo JERFESSON contém 16 peças, incluindo uma sem nome. Listas maiores
  ganham páginas de continuação; nomes repetidos e totais divergentes geram avisos.

Ao publicar esta versão, publique também `firestore.rules`: os campos de ajuste,
foto e checklist dependem das regras atualizadas. Não é necessário Cloud Storage.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Firebase

Configure as variáveis públicas do aplicativo Web criado no Firebase. Para esta
etapa são obrigatórias `NEXT_PUBLIC_FIREBASE_API_KEY`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` e
`NEXT_PUBLIC_FIREBASE_APP_ID`. Ative o provedor Google no Firebase
Authentication, ative o Cloud Firestore e publique as regras presentes em
`firestore.rules`.

O aplicativo não usa Realtime Database nem Cloud Storage nesta etapa. As regras
do Firestore garantem que cada conta Google acesse somente os próprios dados.

## Provedores de IA e integrações legadas

O assistente geral foi removido da interface. O organizador de produção reutiliza
os provedores existentes, sem ferramentas para consultar ou alterar o financeiro.
As rotas e os registros antigos de integração permanecem preservados no servidor.

Configure os valores sensíveis apenas no ambiente do servidor:

- `DEEPSEEK_API_KEY`: chave do provedor principal DeepSeek.
- `DEEPSEEK_MODEL`: modelo principal; o padrão é `deepseek-v4-pro`.
- `GROQ_API_KEY`: fallback opcional quando a DeepSeek estiver indisponível.
- `GEMINI_API_KEY`: chave da Gemini API.
- `GEMINI_MODEL`: modelo usado pelo provedor; o padrão está em `.env.example`.
- `MERCADO_PAGO_ACCESS_TOKEN`: token privado para consultar pagamentos.
- `MERCADO_PAGO_WEBHOOK_SECRET`: assinatura secreta configurada no webhook.
- `MERCADO_PAGO_OWNER_FIREBASE_UID`: UID Firebase do proprietário autorizado.

O organizador tenta DeepSeek, Groq e Gemini conforme as chaves disponíveis no servidor.

Não use o prefixo `NEXT_PUBLIC_` nessas variáveis. O endpoint de notificações do
Mercado Pago é `/api/webhooks/mercadopago`. A integração valida a assinatura,
confirma o pagamento na API oficial e sincroniza/concilia pelo acesso autenticado
da PSYZON AI; ela não transfere dinheiro.

## Open Finance com Pluggy

A integração bancária usa o Connect Widget no cliente e o SDK oficial
`pluggy-sdk` somente nas rotas server-side. `PLUGGY_CLIENT_ID`,
`PLUGGY_CLIENT_SECRET`, API keys e tokens de leitura nunca são enviados ao
navegador. O frontend recebe apenas um Connect Token temporário e restrito.

Configure no ambiente do servidor:

- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`: credenciais da aplicação Pluggy.
- `PLUGGY_WEBHOOK_URL`: URL HTTPS pública terminando em `/api/webhooks/pluggy`.
- `PLUGGY_WEBHOOK_SECRET`: segredo longo usado no header `Authorization` do webhook.
- `PLUGGY_OAUTH_REDIRECT_URI`: retorno OAuth opcional cadastrado na Pluggy.
- `PLUGGY_TRANSACTION_LOOKBACK_DAYS`: histórico local, de 30 a 365 dias.
- `PLUGGY_INCLUDE_SANDBOX`: conectores sandbox apenas fora de produção.
- `PLUGGY_PAYMENTS_ENABLED`: mantenha `false` até aprovar a iniciação de pagamentos.

Ao emitir o primeiro Connect Token, o backend registra ou atualiza um webhook
global `all` com header secreto. O endpoint responde `202` imediatamente e
processa o evento depois da resposta. Contas, saldos e o subconjunto necessário
das transações ficam em subcoleções privadas do usuário no Firestore. As regras
negam acesso direto a essas coleções; toda leitura e conciliação passa pelas APIs
autenticadas com Firebase.

As movimentações da Pluggy não alteram o saldo contábil automaticamente. No
dashboard financeiro elas podem ser conciliadas com um registro existente,
importadas para `transactions` ou ignoradas. Isso evita contagem duplicada. A
estrutura do cliente de pagamentos e as capacidades Pix dos conectores já estão
preparadas, mas nenhuma transferência é iniciada nesta etapa.

Depois de alterar `db/schema.ts`, gere e publique as migrações com
`npm run db:generate`. Os testes críticos da IA podem ser executados isoladamente
com `npm run test:ai`.

### Armazenamento da IA

Histórico, configurações, confirmações, auditoria, uso da PSYZON AI e dados de
conciliação do Mercado Pago ficam no mesmo Cloud Firestore já utilizado por
pedidos e finanças. A Vercel não exige Turso nem outro banco adicional.

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
