import { Test, TestingModule } from '@nestjs/testing';
import { OpcuaService } from './opcua.service';

describe('OpcuaService', () => {
  let service: OpcuaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpcuaService],
    }).compile();

    service = module.get<OpcuaService>(OpcuaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
