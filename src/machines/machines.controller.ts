import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { UpdateMachineIndexDto } from './dto/update-machine-index.dto';
import { JwtUserId } from '../auth/decorators/jwt-user-id.decorator';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { RedisService } from '../redis/redis.service';

@Controller('machines')
export class MachinesController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly influxDbService: InfluxDBService,
    private readonly redisService: RedisService,
  ) {}

  @Post()
  create(
    @Body() createMachineDto: CreateMachineDto,
    @JwtUserId() userId: number,
  ) {
    return this.machinesService.create(createMachineDto, userId);
  }

  @Get('factories-machines')
  findFactoriesAndMachinesByUserId(@JwtUserId() userId: number) {
    return this.machinesService.findFactoriesAndMachinesByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @JwtUserId() userId: number) {
    return this.machinesService.findOneForUser(+id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMachineDto: UpdateMachineDto,
    @JwtUserId() userId: number,
  ) {
    return this.machinesService.updateForUser(+id, updateMachineDto, userId);
  }

  @Post('update-index')
  updateIndex(
    @Body() updateMachineIndexDto: UpdateMachineIndexDto,
    @JwtUserId() userId: number,
  ) {
    return this.machinesService.updateMachineIndex(
      updateMachineIndexDto,
      userId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @JwtUserId() userId: number) {
    return this.machinesService.removeForUser(+id, userId);
  }

  // Historical Data Endpoints

  @Get(':id/realtime-history')
  async getRealtimeHistory(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('timeRange') timeRange?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('aggregate') aggregate?: string,
  ) {
    try {
      // Verify machine ownership
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      // Use existing InfluxDB service directly for simplicity
      const data = await this.influxDbService.queryRealtimeData(
        machine.machineName,
        timeRange || '-1h',
      );

      return {
        data,
        pagination: {
          total: data.length,
          limit: limit ? parseInt(limit) : 1000,
          offset: offset ? parseInt(offset) : 0,
        },
        metadata: {
          deviceId: machine.machineName,
          timeRange: timeRange || '-1h',
          aggregate: aggregate || 'none',
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch realtime history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/spc-history')
  async getSPCHistory(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('timeRange') timeRange?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('aggregate') aggregate?: string,
  ) {
    try {
      // Verify machine ownership
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      // Use existing InfluxDB service directly for simplicity
      const data = await this.influxDbService.querySPCData(
        machine.machineName,
        timeRange || '-1h',
      );

      return {
        data,
        pagination: {
          total: data.length,
          limit: limit ? parseInt(limit) : 1000,
          offset: offset ? parseInt(offset) : 0,
        },
        metadata: {
          deviceId: machine.machineName,
          timeRange: timeRange || '-1h',
          aggregate: aggregate || 'none',
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch SPC history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/status')
  async getMachineStatus(
    @Param('id') id: string,
    @JwtUserId() userId: number,
  ) {
    try {
      // Verify machine ownership
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      // Use Redis service directly for machine status
      const status = await this.redisService.getMachineStatus(machine.machineName);

      return {
        deviceId: machine.machineName,
        status: status || { message: 'No status available' },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch machine status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/history/stream')
  async streamHistory(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Res() res: Response,
    @Query('timeRange') timeRange?: string,
    @Query('dataType') dataType?: string,
  ) {
    try {
      // Verify machine ownership
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      // Set headers for streaming response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');

      // Simplified streaming - fetch and send data in chunks
      const realtimeData = await this.influxDbService.queryRealtimeData(
        machine.machineName,
        timeRange || '-1h',
      );

      const spcData = await this.influxDbService.querySPCData(
        machine.machineName,
        timeRange || '-1h',
      );

      const responseData = {
        deviceId: machine.machineName,
        timeRange: timeRange || '-1h',
        data: {
          realtime: dataType === 'spc' ? [] : realtimeData,
          spc: dataType === 'realtime' ? [] : spcData,
        },
        totalRecords: (dataType === 'spc' ? 0 : realtimeData.length) + (dataType === 'realtime' ? 0 : spcData.length),
      };

      res.json(responseData);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to stream history data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
