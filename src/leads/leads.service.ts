import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

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
  const datePart = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

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

  async create(data: Partial<Lead>) {
    if (data.phone) {
      const existingActiveLead = await this.leadsRepository.findOne({
        where: {
          phone: data.phone,
          status: In([
            LeadStatus.NEW,
            LeadStatus.IN_PROGRESS,
            LeadStatus.NEGOTIATION,
          ]),
        },
        order: {
          createdAt: 'DESC',
        },
      });

      if (existingActiveLead) {
        if (
  data.clientName &&
  (!existingActiveLead.clientName ||
    existingActiveLead.clientName.toLowerCase().includes('телефон') ||
    existingActiveLead.clientName.length > 30)
) {
  existingActiveLead.clientName = data.clientName;
}

        existingActiveLead.productInterest =
          data.productInterest || existingActiveLead.productInterest;

          const oldItems = existingActiveLead.items || [];
const newItems = data.items || [];

existingActiveLead.items = [...oldItems, ...newItems];

        existingActiveLead.aiSummary =
          data.aiSummary || existingActiveLead.aiSummary;

        existingActiveLead.source = data.source || existingActiveLead.source;

        existingActiveLead.vkPeerId =
  data.vkPeerId || existingActiveLead.vkPeerId;

if (!existingActiveLead.orderNumber) {
  existingActiveLead.orderNumber = await this.generateOrderNumber(
    data.source || existingActiveLead.source,
  );
}

        await this.leadsRepository.save(existingActiveLead);

                return {
          ...existingActiveLead,
          isDuplicate: true,
        };
      }
    }

    if (!data.orderNumber) {
      data.orderNumber = await this.generateOrderNumber(data.source);
    }

    const lead = this.leadsRepository.create(data);
    const savedLead = await this.leadsRepository.save(lead);

    return {
      ...savedLead,
      isDuplicate: false,
    };
  }

  findAll() {
    return this.leadsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string) {
    const lead = await this.leadsRepository.findOne({
      where: { id },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  findByStatus(status: LeadStatus) {
    return this.leadsRepository.find({
      where: { status },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async updateStatus(id: string, status: LeadStatus) {
  const lead = await this.findOne(id);

  lead.status = status;

  const savedLead = await this.leadsRepository.save(lead);

  if (status === LeadStatus.NEGOTIATION && savedLead.vkPeerId) {
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