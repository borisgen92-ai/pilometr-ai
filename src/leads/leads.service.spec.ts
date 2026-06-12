import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Lead, LeadStatus } from './lead.entity';
import { LeadNote } from './lead-note.entity';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,

    @InjectRepository(LeadNote)
    private readonly leadNotesRepository: Repository<LeadNote>,
  ) {}

  private async generateOrderNumber(source?: string): Promise<string> {
    const prefix = source?.toUpperCase() || 'CRM';

    const now = new Date();
    const datePart = now
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const countToday = await this.leadsRepository
      .createQueryBuilder('lead')
      .where('lead.createdAt BETWEEN :start AND :end', {
        start: startOfDay,
        end: endOfDay,
      })
      .getCount();

    const sequence = String(countToday + 1).padStart(4, '0');

    return `${prefix}-${datePart}-${sequence}`;
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
        existingActiveLead.clientName =
          data.clientName || existingActiveLead.clientName;

        existingActiveLead.productInterest =
          data.productInterest || existingActiveLead.productInterest;

        existingActiveLead.aiSummary =
          data.aiSummary || existingActiveLead.aiSummary;

        existingActiveLead.source = data.source || existingActiveLead.source;

        await this.leadsRepository.save(existingActiveLead);

        return {
          ...existingActiveLead,
          isDuplicate: true,
        };
      }
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

    return this.leadsRepository.save(lead);
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