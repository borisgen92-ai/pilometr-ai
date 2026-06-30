import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Lead, LeadStatus } from './lead.entity';
import { LeadNote } from './lead-note.entity';
import { VkService } from '../vk/vk.service';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,

    @InjectRepository(LeadNote)
    private readonly leadNotesRepository: Repository<LeadNote>,

    private readonly vkService: VkService,
  ) {}

  private async generateOrderNumber(source?: string): Promise<string> {
    const prefix = source?.toUpperCase() || 'CRM';

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const datePart = `${day}-${month}-${year}`;

    for (let attempt = 1; attempt <= 9999; attempt++) {
      const sequence = String(attempt).padStart(4, '0');
      const orderNumber = `${prefix}-${datePart}-${sequence}`;

      const existingLead = await this.leadsRepository.findOne({
        where: {
          orderNumber,
        },
      });

      if (!existingLead) {
        return orderNumber;
      }
    }

    return `${prefix}-${datePart}-${Date.now()}`;
  }

  async create(data: any): Promise<any> {
    if (!data.orderNumber) {
      data.orderNumber = await this.generateOrderNumber(data.source);
    }

    const normalizedItems = Array.isArray(data.items)
      ? data.items.map((item: any) => {
          const price = item.productPrice || item.price || 0;
          const quantity = item.requestedQuantity || item.quantity || 0;

          return {
            productId: item.productId || null,
            productName: item.productName,
            price,
            quantity,
            total: item.total || price * quantity,
            productUnit: item.productUnit || 'шт',
            bestWarehouse: item.bestWarehouse || null,
            warehouseStock: item.warehouseStock || null,
          };
        })
      : undefined;

    const lead = this.leadsRepository.create({
      ...data,
      items: normalizedItems,
    } as any);

    const savedLead = await this.leadsRepository.save(lead);

    return {
      ...(savedLead as any),
      isDuplicate: false,
    };
  }

  findAll() {
    return this.leadsRepository.find({
      relations: {
        items: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string) {
    const lead = await this.leadsRepository.findOne({
      where: { id },
      relations: {
        items: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  findByStatus(status: LeadStatus) {
    return this.leadsRepository.find({
      where: { status },
      relations: {
        items: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async updateStatus(id: string, status: LeadStatus) {
    const lead = await this.findOne(id);
    const previousStatus = lead.status;

    lead.status = status;

    const savedLead = await this.leadsRepository.save(lead);

    if (previousStatus !== status && status === LeadStatus.IN_PROGRESS && savedLead.vkPeerId) {
  const message =
    `Здравствуйте!\n\n` +
    `Ваш заказ № ${savedLead.orderNumber || savedLead.id} принят в работу.\n\n` +
    `Менеджер проверяет наличие и подготовит заказ.\n\n` +
    `Мы сообщим вам, когда заказ будет готов к выдаче.`;

  await this.vkService.sendMessage(
    Number(savedLead.vkPeerId),
    message,
  );
}

    if (previousStatus !== status && status === LeadStatus.NEGOTIATION && savedLead.vkPeerId) {
      const message =
        `Ваш заказ № ${savedLead.orderNumber || savedLead.id} готов к выдаче.\n\n` +
        `Товар в наличии, можете забирать заказ.\n\n` +
        `Оплата производится при получении:\n` +
        `• наличными;\n` +
        `• банковской картой.\n\n` +
        `Срок хранения заказа — 5 рабочих дней.\n\n` +
        `Если возникнут вопросы, ответьте на это сообщение.`;

      await this.vkService.sendMessage(Number(savedLead.vkPeerId), message);
    }

    if (previousStatus !== status && status === LeadStatus.WON && savedLead.vkPeerId) {
      const message =
        `Ваш заказ № ${savedLead.orderNumber || savedLead.id} успешно выдан.\n\n` +
        `Спасибо за покупку в Пилометре!\n\n` +
        `Будем рады видеть вас снова.\n\n` +
        `Если понадобятся мебельные щиты, ступени, слэбы, брус или другие изделия из дерева — обращайтесь.`;

      await this.vkService.sendMessage(Number(savedLead.vkPeerId), message);
    }

    return savedLead;
  }

  async addNote(id: string, text: string, authorName = 'Менеджер') {
    const lead = await this.findOne(id);

    const note = this.leadNotesRepository.create({
      text,
      authorName,
      lead,
    });

    return this.leadNotesRepository.save(note);
  }

  async getNotes(id: string) {
    await this.findOne(id);

    return this.leadNotesRepository.find({
      where: {
        lead: {
          id,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async remove(id: string) {
    const lead = await this.findOne(id);

    await this.leadsRepository.remove(lead);

    return {
      deleted: true,
      id,
    };
  }
}