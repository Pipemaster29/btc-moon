/**
 * Descobre o chat_id do Telegram.
 *
 * O identificador da conversa não aparece em lugar nenhum do aplicativo: a
 * única forma de obtê-lo é mandar uma mensagem ao bot e ler o que a API do
 * Telegram devolve. Este script faz essa leitura.
 *
 * Rode com: npm run telegram-setup -- SEU_TOKEN_DO_BOTFATHER
 */

import { discoverChatIds } from "../lib/telegram";

const token = process.argv[2] ?? process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error(`
Falta o token do bot.

  1. No Telegram, abra uma conversa com @BotFather
  2. Envie /newbot e siga as instruções (nome e usuário terminado em "bot")
  3. Ele devolve um token parecido com 8123456789:AAF...
  4. Abra a conversa com o SEU bot e envie qualquer mensagem para ele
  5. Rode: npm run telegram-setup -- 8123456789:AAF...
`);
  process.exit(1);
}

const chats = await discoverChatIds(token);

if (chats.length === 0) {
  console.log(`
O bot ainda não recebeu nenhuma mensagem.

Abra a conversa com o seu bot no Telegram, mande qualquer coisa (um "oi" serve)
e rode este comando de novo. O Telegram só revela o chat_id depois que existe
uma mensagem para ler.
`);
  process.exit(1);
}

console.log(`\nConversas encontradas:\n`);
for (const chat of chats) {
  console.log(`  ${chat.name.padEnd(24)} chat_id = ${chat.id}`);
}

console.log(`
Coloque no .env.local para rodar local:

  TELEGRAM_BOT_TOKEN=${token}
  TELEGRAM_CHAT_ID=${chats[0].id}

E nos Secrets do GitHub (Settings → Secrets and variables → Actions) com os
mesmos dois nomes, para o monitor rodar 24h sozinho.

Depois teste com: npm run monitor -- --test
`);
