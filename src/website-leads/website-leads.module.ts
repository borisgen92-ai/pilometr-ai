import { Module } from '@nestjs/common';

import { LeadsModule } from '../leads/leads.module';
import { VkModule } from '../vk/vk.module';
import { WebsiteLeadsController } from './website-leads.controller';

@Module({
  imports: [LeadsModule, VkModule],
  controllers: [WebsiteLeadsController],
})
export class WebsiteLeadsModule {}