# Letieri Silveira · Músico e Cantor

Site de agendamentos com painel admin.

- **Site** (`/`): repertório, tipos de evento, **agenda em forma de braço de violão** (bola verde = livre, bola preta = ocupado),
  vídeos e formulário que envia o agendamento pronto para o WhatsApp `wa.me/5548996967255`.
- **Admin** (`/admin`):
  - **Dashboard:** shows do mês, faturamento fechado, ticket médio e comparativo com o mês anterior.
  - **Slogan:** a frase do topo do site.
  - **Agenda:** marca e libera as datas ocupadas.
  - **Oferta especial:** cartão configurável que aparece logo abaixo da foto.
  - **Vídeos:** envio de arquivo ou link do YouTube.
  - **Pedidos:** repertório, valor do pedido, caixinha, QR code do palco e a fila do show.
- **Pedir música** (`/pedir`): página aberta pelo QR code. O cliente escolhe a música, escreve a dedicatória,
  paga pelo Mercado Pago (Pix ou cartão) e o pedido entra na fila do admin depois que o pagamento é aprovado.

## Publicar na Vercel

[![Deploy na Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fletiere-silveira-cantor%2Fletiere-silveira-cantor&env=ADMIN_PASSWORD&envDescription=Senha%20do%20painel%20admin)

1. Em [vercel.com/new](https://vercel.com/new), importe este repositório do GitHub. Deixe **Framework Preset = Other** e não mude os comandos de build: o `vercel.json` já configura tudo.
2. Em **Settings → Environment Variables**, crie `ADMIN_PASSWORD` com a senha do painel.
3. Em **Storage**:
   - **Upstash Redis** (Marketplace): conecte ao projeto. Guarda o slogan, a agenda, a oferta especial e os shows.
     As variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` são criadas automaticamente.
   - **Blob**: crie um store e conecte ao projeto. Guarda os vídeos enviados.
     A variável `BLOB_READ_WRITE_TOKEN` é criada automaticamente.
4. Para os pedidos de música: em **Environment Variables**, crie `MP_ACCESS_TOKEN` com o Access Token de produção
   do Mercado Pago (mercadopago.com.br/developers → Suas integrações → Credenciais de produção).
   O site informa o endereço do webhook ao Mercado Pago em cada pedido; não é preciso cadastrar nada lá.
5. Faça um novo deploy (**Deployments → Redeploy**) para as variáveis valerem.
6. Acesse `https://SEU-PROJETO.vercel.app/admin` e entre com a senha.

Sem o Redis o site abre normalmente com o conteúdo padrão, mas o admin não consegue salvar.
Sem o Blob, o admin aceita apenas vídeos do YouTube.

## Rodar no computador

```bash
cp .env.example .env      # e defina ADMIN_PASSWORD
npm start                 # http://localhost:3000  ·  admin em /admin
```

Sem as variáveis da Vercel, os dados ficam em `./data` e os vídeos em `./data/uploads`.
O mesmo comando serve para hospedar em servidor próprio (VPS, Render, Railway), desde que `DATA_DIR` aponte para um disco persistente.

## Estrutura

| Arquivo | O que é |
| --- | --- |
| `index.html` / `admin.html` | Site público / painel admin |
| `assets/calendar.js`, `assets/calendar.css` | Calendário em forma de braço de violão |
| `assets/vendor/vercel-blob-client.js` | Envio de vídeos para o Vercel Blob (gerado com `npm run build:blob-client`) |
| `lib/app.js` | API: login, slogan, agenda, promoção, shows e vídeos |
| `lib/storage.js` | Banco de dados: Upstash Redis (Vercel) ou arquivos locais |
| `api/handler.js` + `vercel.json` | Função da Vercel que atende `/api/*` |
| `server.js` | Servidor para rodar localmente ou em servidor próprio |
| `config.default.json` | Conteúdo inicial (slogan padrão etc.) |

Para trocar o número do WhatsApp, edite a constante `WHATSAPP` no final de `index.html`.
