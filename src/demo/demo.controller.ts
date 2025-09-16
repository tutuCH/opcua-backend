import { Controller, Get, Post, Delete, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Get('status')
  @Public()
  async getDemoStatus() {
    return this.demoService.getDemoStatus();
  }

  @Get('machines')
  @Public()
  async getMachines() {
    return this.demoService.getMachines();
  }

  @Get('machines/:deviceId/status')
  @Public()
  async getMachineStatus(@Param('deviceId') deviceId: string) {
    return this.demoService.getMachineStatus(deviceId);
  }

  @Get('machines/:deviceId/realtime')
  @Public()
  async getRealtimeData(
    @Param('deviceId') deviceId: string,
    @Query('timeRange') timeRange?: string,
  ) {
    return this.demoService.getRealtimeData(deviceId, timeRange);
  }

  @Get('machines/:deviceId/spc')
  @Public()
  async getSPCData(
    @Param('deviceId') deviceId: string,
    @Query('timeRange') timeRange?: string,
  ) {
    return this.demoService.getSPCData(deviceId, timeRange);
  }

  @Get('queue/status')
  @Public()
  async getQueueStatus() {
    return this.demoService.getQueueStatus();
  }

  @Get('websocket/status')
  @Public()
  async getWebSocketStatus() {
    return this.demoService.getWebSocketStatus();
  }

  @Post('mock-data/start')
  @Public()
  async startMockData() {
    return this.demoService.startMockData();
  }

  @Post('mock-data/stop')
  @Public()
  async stopMockData() {
    return this.demoService.stopMockData();
  }

  @Get('mock-data/status')
  @Public()
  async getMockDataStatus() {
    return this.demoService.getMockDataStatus();
  }

  @Post('influxdb/flush')
  @Public()
  async flushInfluxDB() {
    return this.demoService.flushInfluxDB();
  }

  @Delete('cache/clear')
  @Public()
  async clearCache() {
    return this.demoService.clearCache();
  }

  @Delete('cache/clear/:deviceId')
  @Public()
  async clearMachineCache(@Param('deviceId') deviceId: string) {
    return this.demoService.clearMachineCache(deviceId);
  }

  @Get('metrics')
  @Public()
  async getMetrics() {
    return this.demoService.getMetrics();
  }

  @Get('logs/recent')
  @Public()
  async getRecentLogs(@Query('lines') lines?: string) {
    return this.demoService.getRecentLogs(parseInt(lines) || 100);
  }
}
