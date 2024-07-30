import { Test, TestingModule } from '@nestjs/testing';
import { FactoriesController } from './factories.controller';
import { FactoriesService } from './factories.service';

describe('FactoriesController', () => {
  let controller: FactoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FactoriesController],
      providers: [FactoriesService],
    }).compile();

    controller = module.get<FactoriesController>(FactoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
