import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { JwtUserId } from '../auth/decorators/jwt-user-id.decorator';
import { MachinesService } from '../machines/machines.service';
import {
  SPCSeriesService,
  SPCWindowPreset,
  SPCDownsampleStrategy,
} from './spc-series.service';
import { ALLOWED_SPC_FIELDS } from '../machines/constants/spc-fields';

@Controller('api/spc')
export class SPCSeriesController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly spcSeriesService: SPCSeriesService,
  ) {}

  @Get('series')
  async getSeries(
    @Query('machineId') machineId: string,
    @Query('field') field: string,
    @Query('window') window: SPCWindowPreset = 'last_1h',
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
    @Query('order') order: 'asc' | 'desc' = 'asc',
    @Query('includeStats') includeStats?: string,
    @Query('includeLimits') includeLimits?: string,
    @Query('downsample') downsample: SPCDownsampleStrategy = 'none',
    @JwtUserId() userId?: number,
  ) {
    try {
      const parsedMachineId = parseInt(machineId, 10);
      if (Number.isNaN(parsedMachineId)) {
        throw new HttpException(
          'machineId must be a number',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!field || !ALLOWED_SPC_FIELDS.includes(field as any)) {
        throw new HttpException(
          `Invalid field. Allowed fields: ${ALLOWED_SPC_FIELDS.join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!window) {
        throw new HttpException('window is required', HttpStatus.BAD_REQUEST);
      }

      if (window === 'custom' && (!start || !end)) {
        throw new HttpException(
          'start and end are required for custom window',
          HttpStatus.BAD_REQUEST,
        );
      }

      const safeLimit = limit ? parseInt(limit, 10) : 100;
      const useStats = includeStats !== 'false';
      const useLimits = includeLimits !== 'false';

      const machine = await this.machinesService.findOneForUser(
        parsedMachineId,
        userId,
      );

      return await this.spcSeriesService.getSeries(
        machine.machineName,
        parsedMachineId,
        field as any,
        window,
        start,
        end,
        safeLimit,
        order,
        useStats,
        useLimits,
        downsample,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch SPC series',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
