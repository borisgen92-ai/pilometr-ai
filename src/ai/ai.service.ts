import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  async ask(message: string) {
    try {
      const response =
        await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
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
      console.error('OPENAI ERROR:', error);
      return 'Ошибка OpenAI';
    }
  }
}