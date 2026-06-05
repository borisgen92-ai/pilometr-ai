import { Module } from '@nestjs/common';
import { VkController } from './vk.controller';
import { VkService } from './vk.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [VkController],
  providers: [VkService],
})
export class VkModule {}