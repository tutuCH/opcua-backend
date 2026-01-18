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
import { SPCLimitsService } from '../spc-limits/spc-limits.service';
import { LatestDataCacheService } from '../latest-data-cache/latest-data-cache.service';
import { ALLOWED_SPC_FIELDS } from './constants/spc-fields';

@Controller('machines')
export class MachinesController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly influxDbService: InfluxDBService,
    private readonly redisService: RedisService,
    private readonly spcLimitsService: SPCLimitsService,
    private readonly latestDataCacheService: LatestDataCacheService,
  ) {}

  /**
   * Validates SPC field names against allowed whitelist.
   * @throws HttpException if any field is invalid
   */
  private validateSPCFields(fields: string[]): void {
    const invalidFields = fields.filter(
      (f) => !ALLOWED_SPC_FIELDS.includes(f as any),
    );

    if (invalidFields.length > 0) {
      throw new HttpException(
        `Invalid SPC fields: ${invalidFields.join(', ')}. Valid fields: ${ALLOWED_SPC_FIELDS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

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

      // Handle aggregation requests
      if (aggregate && aggregate !== 'none') {
        const windowSize = this.parseAggregateWindow(aggregate);

        const data = await this.influxDbService.queryRealtimeDataAggregated(
          machine.machineName,
          timeRange || '-1h',
          windowSize,
        );

        return {
          data,
          aggregation: {
            enabled: true,
            window: windowSize,
          },
          metadata: {
            deviceId: machine.machineName,
            timeRange: timeRange || '-1h',
          },
        };
      }

      // Default: Paginated query
      const pageSize = parseInt(limit) || 50;
      const pageOffset = parseInt(offset) || 0;

      // Validate limit
      if (pageSize > 1000) {
        throw new HttpException(
          'Limit cannot exceed 1000 records',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Fetch paginated data and total count in parallel
      const [data, total] = await Promise.all([
        this.influxDbService.queryRealtimeDataPaginated(
          machine.machineName,
          timeRange || '-1h',
          pageSize,
          pageOffset,
        ),
        this.influxDbService.getRealtimeDataCount(
          machine.machineName,
          timeRange || '-1h',
        ),
      ]);

      return {
        data,
        pagination: {
          total,
          limit: pageSize,
          offset: pageOffset,
          hasMore: pageOffset + data.length < total,
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

  private parseAggregateWindow(aggregate: string): string {
    // Parse aggregation window from format like "1m", "5m", "15m", "1h"
    const validWindows = ['1m', '5m', '15m', '30m', '1h', '6h', '1d'];
    const window = validWindows.find((w) => aggregate.includes(w));

    if (!window) {
      throw new HttpException(
        `Invalid aggregate window. Valid options: ${validWindows.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return window;
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

      // Handle aggregation requests
      if (aggregate && aggregate !== 'none') {
        const windowSize = this.parseAggregateWindow(aggregate);

        const data = await this.influxDbService.querySPCDataAggregated(
          machine.machineName,
          timeRange || '-1h',
          windowSize,
        );

        return {
          data,
          aggregation: {
            enabled: true,
            window: windowSize,
          },
          metadata: {
            deviceId: machine.machineName,
            timeRange: timeRange || '-1h',
          },
        };
      }

      // Default: Paginated query
      const pageSize = parseInt(limit) || 50;
      const pageOffset = parseInt(offset) || 0;

      // Validate limit
      if (pageSize > 1000) {
        throw new HttpException(
          'Limit cannot exceed 1000 records',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Fetch paginated data and total count in parallel
      const [data, total] = await Promise.all([
        this.influxDbService.querySPCDataPaginated(
          machine.machineName,
          timeRange || '-1h',
          pageSize,
          pageOffset,
        ),
        this.influxDbService.getSPCDataCount(
          machine.machineName,
          timeRange || '-1h',
        ),
      ]);

      return {
        data,
        pagination: {
          total,
          limit: pageSize,
          offset: pageOffset,
          hasMore: pageOffset + data.length < total,
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
  async getMachineStatus(@Param('id') id: string, @JwtUserId() userId: number) {
    try {
      // Verify machine ownership
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      // Use Redis service directly for machine status
      const status = await this.redisService.getMachineStatus(
        machine.machineName,
      );

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
        totalRecords:
          (dataType === 'spc' ? 0 : realtimeData.length) +
          (dataType === 'realtime' ? 0 : spcData.length),
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

  // New Performance-Optimized Endpoints

  @Get(':id/spc/limits')
  async getSPCLimits(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('fields') fields?: string,
    @Query('lookback') lookback?: string,
    @Query('sigma') sigma?: string,
    @Query('forceRecalculate') forceRecalculate?: string,
  ) {
    try {
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      if (!fields) {
        throw new HttpException(
          'fields parameter is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const fieldsArray = fields.split(',').map((f) => f.trim());
      this.validateSPCFields(fieldsArray);
      const sigmaValue = sigma ? parseInt(sigma) : 3;
      const forceRecalc = forceRecalculate === 'true';

      const result = await this.spcLimitsService.getLimits(
        machine.machineName,
        fieldsArray,
        lookback || '24h',
        sigmaValue,
        forceRecalc,
      );

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get SPC limits',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/spc/latest')
  async getSPCLatest(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('fields') fields?: string,
    @Query('count') count?: string,
  ) {
    try {
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      const countValue = count ? parseInt(count) : 10;
      const data = await this.latestDataCacheService.getLatestSPCData(
        machine.machineName,
        countValue,
      );

      return {
        deviceId: machine.machineName,
        data,
        metadata: {
          count: data.length,
          cachedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get latest SPC data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/realtime/latest')
  async getRealtimeLatest(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('fields') fields?: string,
    @Query('count') count?: string,
  ) {
    try {
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      const countValue = count ? parseInt(count) : 10;
      const data = await this.latestDataCacheService.getLatestRealtimeData(
        machine.machineName,
        countValue,
      );

      return {
        deviceId: machine.machineName,
        data,
        metadata: {
          count: data.length,
          cachedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get latest realtime data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/spc/history-optimized')
  async getSPCHistoryOptimized(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('fields') fields?: string,
    @Query('step') step?: string,
  ) {
    const startTime = Date.now();
    try {
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      if (!from || !to) {
        throw new HttpException(
          'from and to parameters are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const stepValue = step ? parseInt(step) : 50;
      const fieldsArray = fields ? fields.split(',').map((f) => f.trim()) : [];

      if (fieldsArray.length > 0) {
        this.validateSPCFields(fieldsArray);
      }

      const data =
        await this.influxDbService.querySPCDataWithIntelligentDownsampling(
          machine.machineName,
          from,
          to,
          stepValue,
        );

      if (fieldsArray.length > 0) {
        const filteredData = data.map((record) => {
          const filtered: any = { _time: record._time };
          fieldsArray.forEach((field) => {
            if (record[field] !== undefined) {
              filtered[field] = record[field];
            }
          });
          return filtered;
        });

        return {
          deviceId: machine.machineName,
          data: filteredData,
          metadata: {
            timeRange: `${from}/${to}`,
            pointsReturned: filteredData.length,
            requestedFields: fieldsArray,
            queryTime: `${Date.now() - startTime}ms`,
          },
        };
      }

      return {
        deviceId: machine.machineName,
        data,
        metadata: {
          timeRange: `${from}/${to}`,
          pointsReturned: data.length,
          queryTime: `${Date.now() - startTime}ms`,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get optimized SPC history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/realtime/history-optimized')
  async getRealtimeHistoryOptimized(
    @Param('id') id: string,
    @JwtUserId() userId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('fields') fields?: string,
    @Query('step') step?: string,
  ) {
    const startTime = Date.now();
    try {
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      if (!from || !to) {
        throw new HttpException(
          'from and to parameters are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const stepValue = step ? parseInt(step) : 50;
      const fieldsArray = fields ? fields.split(',').map((f) => f.trim()) : [];

      const data =
        await this.influxDbService.queryRealtimeDataWithIntelligentDownsampling(
          machine.machineName,
          from,
          to,
          stepValue,
        );

      if (fieldsArray.length > 0) {
        const filteredData = data.map((record) => {
          const filtered: any = { _time: record._time };
          fieldsArray.forEach((field) => {
            if (record[field] !== undefined) {
              filtered[field] = record[field];
            }
          });
          return filtered;
        });

        return {
          deviceId: machine.machineName,
          data: filteredData,
          metadata: {
            timeRange: `${from}/${to}`,
            pointsReturned: filteredData.length,
            requestedFields: fieldsArray,
            queryTime: `${Date.now() - startTime}ms`,
          },
        };
      }

      return {
        deviceId: machine.machineName,
        data,
        metadata: {
          timeRange: `${from}/${to}`,
          pointsReturned: data.length,
          queryTime: `${Date.now() - startTime}ms`,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get optimized realtime history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/spc/metadata')
  async getSPCMetadata(@Param('id') id: string, @JwtUserId() userId: number) {
    try {
      await this.machinesService.findOneForUser(+id, userId);

      const machine = await this.machinesService.findOne(+id);
      if (!machine) {
        throw new HttpException('Machine not found', HttpStatus.NOT_FOUND);
      }

      return {
        deviceId: machine.machineName,
        fields: [
          {
            name: 'cycle_time',
            displayName: 'Cycle Time',
            unit: 'seconds',
            dataType: 'float',
            min: 10.0,
            max: 15.0,
            suggestedRange: [10, 15],
          },
          {
            name: 'injection_velocity_max',
            displayName: 'Injection Velocity (Max)',
            unit: 'mm/s',
            dataType: 'float',
            min: 70.0,
            max: 95.0,
            suggestedRange: [70, 95],
          },
          {
            name: 'injection_pressure_max',
            displayName: 'Injection Pressure (Max)',
            unit: 'bar',
            dataType: 'float',
            min: 100.0,
            max: 130.0,
            suggestedRange: [100, 130],
          },
          {
            name: 'switch_pack_time',
            displayName: 'Switch Pack Time',
            unit: 'seconds',
            dataType: 'float',
            min: 1.5,
            max: 2.5,
            suggestedRange: [1.5, 2.5],
          },
          {
            name: 'temp_1',
            displayName: 'Barrel Temperature 1',
            unit: '°C',
            dataType: 'float',
            min: 200.0,
            max: 230.0,
            suggestedRange: [200, 230],
          },
        ],
        capabilities: {
          supportedAggregations: [
            'mean',
            'median',
            'min',
            'max',
            'stdDev',
            'count',
          ],
          supportedResolutions: ['auto', '1m', '5m', '15m', '1h', '6h', '1d'],
          maxPointsPerQuery: 10000,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get SPC metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
