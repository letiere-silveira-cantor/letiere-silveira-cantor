# Letieri Silveira · Músico e Cantor

Site de agendamentos com painel admin. Feito em Node.js puro, sem dependências para instalar.

- **Site:** `/`: repertório, tipos de evento, calendário de datas disponíveis, vídeos e formulário que envia o agendamento pronto para o WhatsApp `wa.me/5548996967255`.
- **Admin:** `/admin`: o artista altera o slogan, marca as datas reservadas na agenda, liga e desliga a faixa de promoção no topo e envia vídeos (arquivo ou link do YouTube).

## Rodar

```bash
cp .env.example .env      # e defina ADMIN_PASSWORD no .env
npm start                 # http://localhost:3000  ·  admin em http://localhost:3000/admin
```

Requer Node.js 18 ou mais novo.

## Hospedagem

O admin salva dados no servidor, por isso o site **não funciona no GitHub Pages** (que só serve arquivos estáticos).
Use qualquer hospedagem que rode Node.js (Render, Railway, Fly.io, uma VPS…):

1. Comando de início: `npm start`.
2. Variáveis de ambiente: `ADMIN_PASSWORD` (obrigatória), `TRUST_PROXY=1` (em hospedagens com proxy) e, se quiser, `MAX_VIDEO_MB`.
3. **Disco persistente:** a configuração e os vídeos ficam em `DATA_DIR` (padrão `./data`). Aponte `DATA_DIR` para um disco
   persistente da hospedagem, senão as alterações e os vídeos somem a cada novo deploy.
4. Use HTTPS (as hospedagens acima já oferecem). O login usa cookie seguro quando o acesso é por HTTPS.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | Site público |
| `admin.html` | Painel admin |
| `assets/calendar.js`, `assets/calendar.css` | Calendário usado no site e no admin |
| `server.js` | Servidor: páginas, API do admin, login e envio de vídeos |
| `config.default.json` | Conteúdo inicial (slogan padrão etc.) |
| `data/` | Criada automaticamente: `config.json` e `uploads/` (fora do git) |

Para trocar o número do WhatsApp, edite a constante `WHATSAPP` no final de `index.html`.
