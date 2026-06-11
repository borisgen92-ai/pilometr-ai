import { Body, Controller, HttpCode, Post } from '@nestjs/common';

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
    },
  ) {
    const lead = await this.leadsService.create({
      clientName: body.clientName || undefined,
phone: body.phone || undefined,
      productInterest:
        body.productInterest || body.message || 'Заявка с сайта',
      source: 'website',
      aiSummary: `Заявка с сайта. Клиент: ${
        body.clientName || 'Не указано'
      }. Телефон: ${body.phone || 'Не указан'}. Интерес: ${
        body.productInterest || body.message || 'Не указан'
      }`,
    });

    await this.vkService.sendManagerNotification(
      `🟡 Новая заявка с сайта

Имя: ${lead.clientName || 'Не указано'}
Телефон: ${lead.phone || 'Не указан'}
Интерес: ${lead.productInterest || 'Не указан'}

Источник: сайт pilometr.ru`,
      lead.id,
    );

    return {
      success: true,
      lead,
    };
  }
}