import { Module } from '@nestjs/common';
import { VkController } from './vk.controller';
import { VkService } from './vk.service';
import { ChatModule } from '../chat/chat.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [ChatModule, LeadsModule],
  controllers: [VkController],
  providers: [VkService],
  exports: [VkService],
})
export class VkModule {}