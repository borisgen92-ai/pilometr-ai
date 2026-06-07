import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
  ) {}

  async saveMessage(sessionId: string, role: string, content: string) {
    return this.messagesRepository.save({
      sessionId,
      role,
      content,
    });
  }

  async getRecentMessages(sessionId: string, limit = 10) {
    return this.messagesRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async buildContext(sessionId: string) {
    const messages = await this.getRecentMessages(sessionId, 10);

    return messages
      .reverse()
      .map((item) =>
        item.role === 'user'
          ? `Клиент: ${item.content}`
          : `Бот: ${item.content}`,
      )
      .join('\n');
  }
}