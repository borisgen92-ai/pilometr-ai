import { Test, TestingModule } from '@nestjs/testing';
import { VkController } from './vk.controller';

describe('VkController', () => {
  let controller: VkController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VkController],
    }).compile();

    controller = module.get<VkController>(VkController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
