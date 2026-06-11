import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';

import { LeadsService } from '../leads/leads.service';
import { VkService } from '../vk/vk.service';

@Controller('website-leads')
export class WebsiteLeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly vkService: VkService,
  ) {}

  @Post()
  @HttpCode(201)
  async createWebsiteLead(
    @Body()
    body: {
      clientName?: string;
      phone?: string;
      productInterest?: string;
      message?: string;
      pageUrl?: string;
    },
  ) {
    const phone = this.normalizePhone(body.phone);

    if (!phone) {
      throw new BadRequestException('Телефон обязателен');
    }
    if (phone.length < 10) {
  throw new BadRequestException('Некорректный телефон');
}

    const productInterest =
      body.productInterest?.trim() ||
      body.message?.trim() ||
      'Заявка с сайта';

    const clientName = body.clientName?.trim() || undefined;

    const lead = await this.leadsService.create({
      clientName,
      phone,
      productInterest,
      source: 'website',
      aiSummary: `Заявка с сайта. Клиент: ${
        clientName || 'Не указано'
      }. Телефон: ${phone}. Интерес: ${productInterest}. Страница: ${
        body.pageUrl || 'Не указана'
      }`,
    });

    const isDuplicate = (lead as any).isDuplicate;

    await this.vkService.sendManagerNotification(
      `${isDuplicate ? '🔁 Повторная заявка с сайта' : '🟡 Новая заявка с сайта'}

Имя: ${lead.clientName || 'Не указано'}
Телефон: ${lead.phone || 'Не указан'}
Интерес: ${lead.productInterest || 'Не указан'}
Страница: ${body.pageUrl || 'Не указана'}

Источник: сайт pilometr.ru`,
      lead.id,
    );

    return {
      success: true,
      duplicate: isDuplicate,
      lead,
    };
  }

  private normalizePhone(phone?: string) {
    if (!phone) {
      return '';
    }

    const digits = phone.replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('8')) {
      return `7${digits.slice(1)}`;
    }

    if (digits.length === 11 && digits.startsWith('7')) {
      return digits;
    }

    if (digits.length === 10) {
      return `7${digits}`;
    }

    return digits;
  }
}