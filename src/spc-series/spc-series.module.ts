import { Module } from '@nestjs/common';
import { SPCSeriesController } from './spc-series.controller';
import { SPCSeriesService } from './spc-series.service';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { MachinesModule } from '../machines/machines.module';

@Module({
  imports: [InfluxDBModule, MachinesModule],
  controllers: [SPCSeriesController],
  providers: [SPCSeriesService],
})
export class SPCSeriesModule {}
