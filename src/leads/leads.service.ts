import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Lead, LeadStatus } from './lead.entity';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
  ) {}

  create(data: Partial<Lead>) {
    const lead = this.leadsRepository.create(data);

    return this.leadsRepository.save(lead);
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

  async remove(id: string) {
    const lead = await this.findOne(id);

    await this.leadsRepository.remove(lead);

    return {
      deleted: true,
      id,
    };
  }
}