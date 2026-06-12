import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { ChatService } from '../chat/chat.service';
import { LeadStatus } from '../leads/lead.entity';
import { LeadsService } from '../leads/leads.service';
import { VkService } from './vk.service';

@Controller('vk')
export class VkController {
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly vkService: VkService,
    private readonly leadsService: LeadsService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    console.log('VK webhook:', JSON.stringify(body, null, 2));

    if (body.type === 'confirmation') {
      console.log('VK_CONFIRMATION_CODE:', process.env.VK_CONFIRMATION_CODE);
      return process.env.VK_CONFIRMATION_CODE;
    }

    if (body.type === 'message_event') {
      return this.handleMessageEvent(body);
    }

    if (body.type !== 'message_new') {
      return 'ok';
    }

    const eventId = body.event_id;
    const message = body.object?.message;
    const text = message?.text;
    const peerId = message?.peer_id;
    const fromId = message?.from_id;

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
  fromId,
  text,
});

    if (!text || !peerId) {
      return 'ok';
    }

    try {
      const sessionId = `vk-${peerId}`;

      const aiAnswer = await this.chatService.processMessage(text, sessionId);

      const vkUserName = fromId
  ? await this.vkService.getUserName(fromId)
  : null;

      await this.vkService.sendMessage(
        peerId,
        aiAnswer.response || 'Спасибо за сообщение! Сейчас уточню информацию.',
      );

            if (aiAnswer.lead && !(aiAnswer.lead as any).isDuplicate) {
        const lead = aiAnswer.lead as any;
        const product = (aiAnswer as any).product || (aiAnswer as any).products?.[0];

        const productText = product
          ? `

📦 Товар:
${product.name}

💰 Цена: ${product.price} ₽ / ${product.unit}

📍 Остатки:
Волхов: ${product.volhovStock ?? 0}
Север: ${product.skotnoeStock ?? 0}
Марьино: ${product.lomonosovStock ?? 0}
Рощино: ${product.roshinoStock ?? 0}
Ладога: ${product.ladogaStock ?? 0}`
          : '';

        await this.vkService.sendManagerNotification(
          `🔥 Новая заявка из VK

Имя: ${vkUserName || lead.clientName || 'Не указано'}
Телефон: ${lead.phone}
${productText || `Интерес: ${lead.productInterest || 'Не указан'}`}

Сообщение клиента:
${text}

Источник: VK
ID диалога: ${sessionId}`,
          lead.id,
        );
                await this.vkService.sendMessage(
          peerId,
          `📌 Заявка создана для менеджера

Телефон: ${lead.phone}
${productText || `Интерес: ${lead.productInterest || 'Не указан'}`}

Сообщение клиента:
${text}`,
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

  private async handleMessageEvent(body: any) {
    const object = body.object;

    const eventId = object?.event_id;
    const userId = object?.user_id;
    const peerId = object?.peer_id;
    const payload = object?.payload;

    console.log('VK message_event:', {
      eventId,
      userId,
      peerId,
      payload,
    });

    if (!eventId || !userId || !peerId || !payload) {
      return 'ok';
    }

    try {
      if (payload.action !== 'lead_status') {
        await this.vkService.answerMessageEvent(
          eventId,
          userId,
          peerId,
          'Неизвестное действие',
        );

        return 'ok';
      }

      const leadId = payload.leadId;
      const status = payload.status as LeadStatus;

      const allowedStatuses = [
        LeadStatus.NEW,
        LeadStatus.IN_PROGRESS,
        LeadStatus.NEGOTIATION,
        LeadStatus.WON,
        LeadStatus.LOST,
      ];

      if (!leadId || !allowedStatuses.includes(status)) {
        await this.vkService.answerMessageEvent(
          eventId,
          userId,
          peerId,
          'Некорректный статус заявки',
        );

        return 'ok';
      }

      await this.leadsService.updateStatus(leadId, status);

      const statusText = this.getStatusText(status);

      await this.vkService.answerMessageEvent(
        eventId,
        userId,
        peerId,
        `Статус заявки изменён: ${statusText}`,
      );

      await this.vkService.sendMessage(
        peerId,
        `✅ Статус заявки изменён: ${statusText}`,
      );

      return 'ok';
    } catch (error) {
      console.error('VK message_event error:', error);

      await this.vkService.answerMessageEvent(
        eventId,
        userId,
        peerId,
        'Не получилось изменить статус заявки',
      );

      return 'ok';
    }
  }

  private getStatusText(status: LeadStatus) {
    if (status === LeadStatus.NEW) return 'Новая';
    if (status === LeadStatus.IN_PROGRESS) return 'В работе';
    if (status === LeadStatus.NEGOTIATION) return 'Переговоры';
    if (status === LeadStatus.WON) return 'Продано';
    if (status === LeadStatus.LOST) return 'Отказ';

    return status;
  }
}