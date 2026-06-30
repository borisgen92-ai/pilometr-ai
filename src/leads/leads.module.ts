import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Lead } from './lead.entity';
import { LeadNote } from './lead-note.entity';
import { LeadItem } from './entities/lead-item.entity';

import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { VkService } from '../vk/vk.service';
import { AiModule } from '../ai/ai.module';
import { AiSalesService } from './ai-sales.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadNote, LeadItem]), AiModule],
  controllers: [LeadsController],
  providers: [LeadsService, VkService, AiSalesService],
  exports: [LeadsService],
})
export class LeadsModule {}