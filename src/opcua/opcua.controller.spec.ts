import { Test, TestingModule } from '@nestjs/testing';
import { OpcuaController } from './opcua.controller';
import { OpcuaService } from './opcua.service';

describe('OpcuaController', () => {
  let controller: OpcuaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpcuaController],
      providers: [OpcuaService],
    }).compile();

    controller = module.get<OpcuaController>(OpcuaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
