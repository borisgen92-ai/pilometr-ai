import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Lead } from './lead.entity';
import { LeadNote } from './lead-note.entity';
import { LeadItem } from './entities/lead-item.entity';

import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { VkService } from '../vk/vk.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadNote, LeadItem])],
  controllers: [LeadsController],
  providers: [LeadsService, VkService],
  exports: [LeadsService],
})
export class LeadsModule {}