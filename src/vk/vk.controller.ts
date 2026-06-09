import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { VkService } from './vk.service';

@Controller('vk')
export class VkController {
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly vkService: VkService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    console.log('VK webhook:', JSON.stringify(body, null, 2));

    if (body.type === 'confirmation') {
      console.log('VK_CONFIRMATION_CODE:', process.env.VK_CONFIRMATION_CODE);
      return process.env.VK_CONFIRMATION_CODE;
    }

    if (body.type !== 'message_new') {
      return 'ok';
    }

    const eventId = body.event_id;
    const message = body.object?.message;
    const text = message?.text;
    const peerId = message?.peer_id;

    if (eventId && this.processedEventIds.has(eventId)) {
      console.log('Повторный VK event пропущен:', eventId);
      return 'ok';
    }

    if (eventId) {
      this.processedEventIds.add(eventId);

      if (this.processedEventIds.size > 1000) {
        this.processedEventIds.clear();
      }
    }

    console.log('Новое сообщение из VK:', {
      peerId,
      text,
    });

    if (!text || !peerId) {
      return 'ok';
    }

    try {
      const sessionId = `vk-${peerId}`;

      const aiAnswer = await this.chatService.processMessage(
        text,
        sessionId,
      );

      await this.vkService.sendMessage(
        peerId,
        aiAnswer.response ||
          'Спасибо за сообщение! Сейчас уточню информацию.',
      );

            if (aiAnswer.lead) {
        const lead = aiAnswer.lead as any;

        const cleanedText = text
          .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
          .replace(/телефон[:\s]*/gi, '')
          .trim();

        const nameMatch = cleanedText.match(/([А-ЯЁ][а-яё]+)\s*$/);

        if (
  !lead.clientName ||
  lead.clientName.trim() === '' ||
  lead.clientName.toLowerCase().includes('телефон')
) {
  lead.clientName = nameMatch?.[1] || '';
}

        await this.vkService.sendManagerNotification(
          `🔥 Новая заявка из VK

Имя: ${lead.clientName || 'Не указано'}
Телефон: ${lead.phone}
Интерес: ${lead.productInterest || 'Не указан'}

Сообщение клиента:
${text}

Источник: VK
ID диалога: ${sessionId}`,
        );
      }

      return 'ok';
    } catch (error) {
      console.error('VK обработка ошибки:', error);

      await this.vkService.sendMessage(
        peerId,
        'Сейчас не получилось обработать сообщение. Передам вопрос менеджеру.',
      );

      return 'ok';
    }
  }
}