import { Test, TestingModule } from '@nestjs/testing';
import { WebsiteLeadsController } from './website-leads.controller';

describe('WebsiteLeadsController', () => {
  let controller: WebsiteLeadsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebsiteLeadsController],
    }).compile();

    controller = module.get<WebsiteLeadsController>(WebsiteLeadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
