import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { VkService } from './vk.service';

@Controller('vk')
export class VkController {
  private readonly conversationMemory = new Map<number, string[]>();

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

    if (body.type === 'message_new') {
      const message = body.object?.message;
      const text = message?.text;
      const peerId = message?.peer_id;

      console.log('Новое сообщение из VK:', {
        peerId,
        text,
      });

      if (!text || !peerId) {
        return 'ok';
      }

      const previousMessages = this.conversationMemory.get(peerId) || [];

      const messageWithContext =
        previousMessages.length > 0
          ? `Контекст прошлых сообщений клиента:
${previousMessages.join('\n')}

Новое сообщение клиента:
${text}`
          : text;

      const aiAnswer = await this.chatService.processMessage(messageWithContext);

      const updatedMessages = [...previousMessages, text].slice(-5);
      this.conversationMemory.set(peerId, updatedMessages);

      await this.vkService.sendMessage(
        peerId,
        aiAnswer.response || 'Спасибо за сообщение! Сейчас уточню информацию.',
      );

      return 'ok';
    }

    return 'ok';
  }
}