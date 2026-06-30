import { Controller, Get, Param, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}


  @Get()
  getLatest(@Query('limit') limit?: string) {
    return this.messagesService.getLatestMessages(
      limit ? Number(limit) : 30,
    );
  }

  @Get(':sessionId')
  getMessages(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getRecentMessages(
      sessionId,
      limit ? Number(limit) : 50,
    );
  }
}
