import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai = new OpenAI({
    apiKey: process.env.VSEGPT_API_KEY,
    baseURL: process.env.VSEGPT_BASE_URL,
  });

  async ask(message: string) {
    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.VSEGPT_MODEL || 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
Ты ИИ-продавец компании Пилометр.

Твои задачи:
1. Помогать клиенту подобрать пиломатериалы.
2. Отвечать кратко и по делу.
3. Задавать уточняющие вопросы, если данных недостаточно.
4. Предлагать оставить телефон для связи с менеджером.
5. Не выдумывать наличие товара и цены.
6. Не придумывать характеристики товаров, которых нет в каталоге.
7. Общаться как опытный менеджер по продаже пиломатериалов.

Если клиент не указал размеры или количество — сначала уточни их.

Отвечай на русском языке.
`,
          },
          {
            role: 'user',
            content: message,
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