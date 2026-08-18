/**
 * Envio de alertas pelo Telegram.
 *
 * Escolhido em vez de e-mail por três motivos práticos: chega em segundos no
 * celular, a API é uma única requisição HTTP sem SDK nem domínio verificado, e
 * é gratuita sem limite relevante. E-mail de alerta ainda tende a cair em spam
 * justamente quando importa.
 *
 * Precisa de duas variáveis de ambiente:
 *   TELEGRAM_BOT_TOKEN  — o token que o @BotFather devolve
 *   TELEGRAM_CHAT_ID    — o identificador da conversa que vai receber
 */

const API = "https://api.telegram.org";

export interface TelegramConfig {
  token: string;
  chatId: string;
}

/** Lê a configuração do ambiente, ou nulo quando não está configurado. */
export function telegramFromEnv(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

/**
 * Escapa o texto para o modo MarkdownV2.
 *
 * O Telegram rejeita a mensagem inteira se sobrar um caractere reservado solto,
 * e endereços de carteira são cheios deles. Um alerta que não chega por causa de
 * um hífen é pior do que um alerta sem formatação.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

export async function sendTelegram(
  config: TelegramConfig,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Telegram recusou (${res.status}): ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Telegram falhou: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Descobre o chat_id lendo as mensagens recentes enviadas ao bot.
 *
 * Existe porque o identificador não aparece em lugar nenhum da interface do
 * Telegram: a única forma de obtê-lo é mandar uma mensagem para o bot e ler o
 * que a API devolve.
 */
export async function discoverChatIds(
  token: string,
): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API}/bot${token}/getUpdates`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`getUpdates respondeu ${res.status}`);

  const body = (await res.json()) as {
    ok: boolean;
    result?: { message?: { chat?: { id: number; first_name?: string; title?: string; username?: string } } }[];
  };

  const found = new Map<string, string>();
  for (const update of body.result ?? []) {
    const chat = update.message?.chat;
    if (!chat) continue;
    found.set(
      String(chat.id),
      chat.title ?? chat.first_name ?? chat.username ?? "sem nome",
    );
  }

  return [...found.entries()].map(([id, name]) => ({ id, name }));
}
