import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { VkService } from './vk.service';
import { LeadsService } from '../leads/leads.service';

@Controller('vk')
export class VkController {
  private readonly conversationMemory = new Map<number, string[]>();
  private readonly processedEventIds = new Set<string>();
  private readonly lastProductByPeerId = new Map<number, any>();

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

    if (body.type === 'message_new') {
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

      const lastProduct = this.lastProductByPeerId.get(peerId);

      const warehouseAnswer = this.tryAnswerWarehouseQuestion(text, lastProduct);

      if (warehouseAnswer) {
        await this.vkService.sendMessage(peerId, warehouseAnswer);
        return 'ok';
      }

      const previousMessages = this.conversationMemory.get(peerId) || [];

      const shouldResetMemory = this.shouldResetConversation(
        text,
        previousMessages,
      );

      const actualPreviousMessages = shouldResetMemory ? [] : previousMessages;

      const messageWithContext =
        actualPreviousMessages.length > 0
          ? `Контекст прошлых сообщений клиента:
${actualPreviousMessages.join('\n')}

Новое сообщение клиента:
${text}`
          : text;

      const phoneMatch = text.match(/(\+?\d[\d\s\-()]{8,}\d)/);

      if (phoneMatch) {
        await this.leadsService.create({
          phone: phoneMatch[1].replace(/\s/g, ''),
          source: 'vk',
          productInterest: lastProduct?.name || text,
          aiSummary: `VK заявка. Сообщение клиента: ${text}. Товар: ${
            lastProduct?.name || 'не указан'
          }`,
        });

        await this.vkService.sendMessage(
          peerId,
          'Спасибо! Заявка создана, менеджер свяжется с вами.',
        );

        return 'ok';
      }

      const aiAnswer = await this.chatService.processMessage(messageWithContext);

      const productFromAnswer =
        aiAnswer.product ||
        (Array.isArray(aiAnswer.products) && aiAnswer.products.length > 0
          ? aiAnswer.products[0]
          : null);

      if (productFromAnswer) {
        this.lastProductByPeerId.set(peerId, productFromAnswer);
      }

      const updatedMessages = [...actualPreviousMessages, text].slice(-5);
      this.conversationMemory.set(peerId, updatedMessages);

      await this.vkService.sendMessage(
        peerId,
        aiAnswer.response || 'Спасибо за сообщение! Сейчас уточню информацию.',
      );

      return 'ok';
    }

    return 'ok';
  }

  private tryAnswerWarehouseQuestion(
    text: string,
    product: any | undefined,
  ): string | null {
    if (!product) {
      return null;
    }

    const lowerText = text.toLowerCase();

    const warehouses = [
      {
        keywords: ['рощино', 'рощин'],
        name: 'Рощино',
        stock: product.roshinoStock,
      },
      {
        keywords: ['марьино', 'марьин'],
        name: 'Марьино',
        stock: product.lomonosovStock,
      },
      {
        keywords: ['север', 'севере', 'северный'],
        name: 'Север',
        stock: product.volhovStock,
      },
      {
        keywords: ['ладога', 'ладоге', 'ладогу'],
        name: 'Ладога',
        stock: product.ladogaStock,
      },
    ];

    const warehouse = warehouses.find((item) =>
      item.keywords.some((keyword) => lowerText.includes(keyword)),
    );

    if (!warehouse) {
      return null;
    }

    const stock = Number(warehouse.stock || 0);
    const unit = product.unit || 'шт';

    if (stock > 0) {
      return (
        `Да, есть в наличии.\n\n` +
        `${product.name}\n` +
        `📍 ${warehouse.name} — ${stock} ${unit}`
      );
    }

    return (
      `На точке ${warehouse.name} сейчас нет остатка по этому товару.\n\n` +
      `${product.name}\n` +
      `Могу подсказать остатки по другим точкам.`
    );
  }

  private shouldResetConversation(
    text: string,
    previousMessages: string[],
  ): boolean {
    if (previousMessages.length === 0) {
      return false;
    }

    const currentText = text.toLowerCase();

    const newTopicWords = [
      'доск',
      'брус',
      'слэб',
      'щит',
      'ступ',
      'тетив',
      'баляс',
      'поруч',
      'вагонк',
      'наличник',
      'плинтус',
      'молдинг',
    ];

    const hasNewTopic = newTopicWords.some((word) =>
      currentText.includes(word),
    );

    if (!hasNewTopic) {
      return false;
    }

    const previousText = previousMessages.join(' ').toLowerCase();

    const sameTopic = newTopicWords.some(
      (word) => currentText.includes(word) && previousText.includes(word),
    );

    return !sameTopic;
  }
}