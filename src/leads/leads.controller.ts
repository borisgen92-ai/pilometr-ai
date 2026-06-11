import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { LeadsService } from './leads.service';
import { Lead, LeadStatus } from './lead.entity';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(@Body() data: Partial<Lead>) {
    return this.leadsService.create(data);
  }

  @Get()
  findAll() {
    return this.leadsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Get('status/:status')
  findByStatus(@Param('status') status: LeadStatus) {
    return this.leadsService.findByStatus(status);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: LeadStatus,
  ) {
    return this.leadsService.updateStatus(id, status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body('text') text: string,
    @Body('authorName') authorName?: string,
  ) {
    return this.leadsService.addNote(id, text, authorName);
  }

  @Get(':id/notes')
  getNotes(@Param('id') id: string) {
    return this.leadsService.getNotes(id);
  }
}