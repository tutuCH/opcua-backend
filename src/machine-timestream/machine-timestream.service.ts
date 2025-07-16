import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import {
  TimestreamWrite,
  MeasureValueType,
  TimeUnit,
} from '@aws-sdk/client-timestream-write';
import * as path from 'path';

// iot-demo.csv exists in current directory
// load demo data into aws timestream database
@Injectable()
export class MachineTimestreamService {
  private readonly logger = new Logger(MachineTimestreamService.name);
  private timestreamClient: TimestreamWrite;

  constructor() {
    this.timestreamClient = new TimestreamWrite({
      region: 'us-east-1',
    });
  }

  // database name: injection_dev
  // database region: us-east-1
  // database arn: arn:aws:timestream:us-east-1:481440170230:database/injection_dev
  // table name: IoTMulti
  // table arn: arn:aws:timestream:us-east-1:481440170230:database/injection_dev/table/IoTMulti

  // load demo data into aws timestream database
  async loadDemoDataToAwsTimestream() {
    try {
      // Read the CSV file
      const demoData = await fs.readFile(
        path.join(__dirname, 'iot-demo.csv'),
        'utf8',
      );
      const lines = demoData.split('\n').filter((line) => line.trim());
      const headers = lines[0].split(',');
      const data = lines.slice(1).map((line) => line.split(','));

      this.logger.log(`Loaded ${data.length} records from CSV file`);

      // Process records in batches (Timestream limits: 100 records per request)
      const batchSize = 100;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await this.writeRecordsToTimestream(batch, headers);
        this.logger.log(
          `Processed batch ${i / batchSize + 1} of ${Math.ceil(data.length / batchSize)}`,
        );
      }

      this.logger.log('Successfully loaded all demo data to Timestream');
      return { success: true, recordsLoaded: data.length };
    } catch (error) {
      this.logger.error(
        `Failed to load demo data: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to load demo data to Timestream',
      );
    }
  }

  private async writeRecordsToTimestream(data: string[][], headers: string[]) {
    const records = data.map((row) => {
      // Convert timestamp to current time (to avoid future date issues)
      const now = new Date().getTime();
      const device = row[2];

      // Build dimensions
      const dimensions = [{ Name: 'device', Value: device }];

      // Create a record with properly converted measures
      const measures = headers.slice(3).map((measureName, index) => {
        return {
          Name: measureName.trim(),
          Value: parseFloat(row[index + 3].trim()).toString(),
          Type: 'DOUBLE' as MeasureValueType,
        };
      });

      return {
        Dimensions: dimensions,
        MeasureName: 'machine_metrics',
        MeasureValues: measures,
        MeasureValueType: 'MULTI' as MeasureValueType,
        Time: now.toString(), // Use current time instead of future dates
        TimeUnit: 'MILLISECONDS' as TimeUnit,
      };
    });

    const params = {
      DatabaseName: 'injection_dev',
      TableName: 'IoTMulti',
      Records: records,
    };

    await this.timestreamClient.writeRecords(params);
  }
}
