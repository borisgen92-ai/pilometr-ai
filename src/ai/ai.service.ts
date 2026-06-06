import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { PILOMETR_KNOWLEDGE } from '../knowledge/knowledge';

@Injectable()
export class AiService {
  private openai = new OpenAI({
    apiKey: process.env.VSEGPT_API_KEY,
    baseURL: process.env.VSEGPT_BASE_URL,
  });

  async ask(message: string, catalogContext?: string) {
    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.VSEGPT_MODEL || 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
Ты ИИ-продавец компании Пилометр.

Твои задачи:
1. Помогать клиенту подобрать товары из дерева.
2. Отвечать кратко, понятно и по делу.
3. Использовать базу знаний Пилометра.
4. Использовать каталог товаров, если он передан.
5. Не выдумывать цены и остатки.
6. Если товар найден в каталоге — опирайся на него.
7. Не говори, что товара нет, если он есть в переданном каталоге.
8. Не предлагай молдинги и наличники, если клиент спрашивает про стол, щит, лестницу или брус.
9. Сначала помоги подобрать товар, и только потом мягко предложи оставить телефон.
10. Общайся как опытный продавец Пилометра.

БАЗА ЗНАНИЙ ПИЛОМЕТРА:
${PILOMETR_KNOWLEDGE}

Отвечай на русском языке.
`,
          },
          {
            role: 'user',
            content: catalogContext
              ? `Каталог товаров:\n${catalogContext}\n\nЗапрос клиента:\n${message}`
              : message,
          },
        ],
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('VSEGPT ERROR:', error);
      return 'Ошибка VseGPT';
    }
  }
}