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
      const response =
        await this.openai.chat.completions.create({
          model:
            process.env.VSEGPT_MODEL ||
            'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Ты консультант компании Пилометр. Помогаешь выбирать пиломатериалы, отвечаешь кратко и профессионально.',
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