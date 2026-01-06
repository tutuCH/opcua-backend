import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { Machine } from '../machines/entities/machine.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MockDataService implements OnModuleInit {
  private readonly logger = new Logger(MockDataService.name);
  private mqttClient: mqtt.MqttClient;
  private isGenerating = false;
  private intervals: NodeJS.Timeout[] = [];
  private machineStates = new Map<string, any>();

  constructor(
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    const enableMockData = process.env.ENABLE_MOCK_DATA === 'true';

    if (enableMockData) {
      try {
        await this.connectToMQTT();
        await this.initializeMockData();
      } catch (error) {
        this.logger.warn('MQTT connection failed, using Redis bypass mode');
        await this.initializeMockDataWithRedis();
      }
    } else {
      this.logger.log('Mock data generation disabled');
    }
  }

  private async connectToMQTT() {
    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

      this.mqttClient = mqtt.connect(brokerUrl, {
        clientId: `mock-data-generator-${Date.now()}`,
        clean: true,
        reconnectPeriod: 1000,
      });

      this.mqttClient.on('connect', () => {
        this.logger.log(
          `Mock data generator connected to MQTT broker: ${brokerUrl}`,
        );
      });

      this.mqttClient.on('error', (error) => {
        this.logger.error('MQTT connection error:', error);
      });
    } catch (error) {
      this.logger.error('Failed to connect to MQTT broker:', error);
      throw error;
    }
  }

  private async initializeMockData() {
    try {
      // Get all machines from database
      const machines = await this.machineRepository.find();

      if (machines.length === 0) {
        this.logger.warn(
          'No machines found in database. Mock data generation will not start.',
        );
        return;
      }

      this.logger.log(
        `Found ${machines.length} machines. Starting mock data generation...`,
      );

      // Initialize state for each machine
      machines.forEach((machine) => {
        this.initializeMachineState(machine.machineName);
      });

      // Start generating mock data
      await this.startMockDataGeneration(machines);
    } catch (error) {
      this.logger.error('Failed to initialize mock data:', error);
    }
  }

  private async initializeMockDataWithRedis() {
    try {
      // Get all machines from database
      const machines = await this.machineRepository.find();

      if (machines.length === 0) {
        this.logger.warn(
          'No machines found in database. Mock data generation will not start.',
        );
        return;
      }

      this.logger.log(
        `🔄 Found ${machines.length} machines. Starting mock data generation with Redis bypass...`,
      );

      // Initialize state for each machine
      machines.forEach((machine) => {
        this.initializeMachineState(machine.machineName);
      });

      // Start generating mock data
      await this.startMockDataGeneration(machines);
      this.logger.log(
        '✅ Mock data generation with Redis bypass initialized successfully',
      );
    } catch (error) {
      this.logger.error('Failed to initialize mock data with Redis:', error);
    }
  }

  private initializeMachineState(deviceId: string) {
    this.machineStates.set(deviceId, {
      // Realtime state
      oilTemp: this.randomFloat(45, 55),
      operateMode: this.randomInt(1, 3), // 1=Semi-auto, 2=Eye auto, 3=Time auto
      status: 2, // Production
      temperatures: Array.from({ length: 7 }, () => this.randomFloat(219, 223)),
      cycleNumber: this.randomInt(1000, 9999),

      // SPC state
      cycleTime: this.randomFloat(30, 60),
      injectionVelocity: this.randomFloat(140, 160),
      injectionPressure: this.randomFloat(70, 90),

      // Tech configuration (changes rarely)
      tempSetpoints: Array.from({ length: 10 }, () => this.randomInt(218, 225)),
      pressureSteps: Array.from({ length: 10 }, () => this.randomInt(45, 55)),
      velocitySteps: Array.from({ length: 10 }, () => this.randomInt(8, 15)),
      strokeSteps: Array.from({ length: 10 }, () => this.randomFloat(5.0, 5.5)),
      timeSteps: Array.from({ length: 10 }, () => this.randomFloat(2.0, 2.5)),

      // Tracking
      lastCycleTime: Date.now(),
      lastTechUpdate: Date.now(),
    });
  }

  private async startMockDataGeneration(machines: Machine[]) {
    this.isGenerating = true;

    machines.forEach((machine) => {
      const deviceId = machine.machineName;

      // Generate realtime data every 5 seconds
      const realtimeInterval = setInterval(() => {
        if (this.isGenerating) {
          this.generateRealtimeData(deviceId);
        }
      }, 5000);

      // Generate SPC data every 30-60 seconds (simulating cycle completion)
      const spcInterval = setInterval(
        () => {
          if (this.isGenerating) {
            this.generateSPCData(deviceId);
          }
        },
        this.randomInt(30000, 60000),
      );

      // Generate tech data every 10-30 minutes (simulating job changes)
      const techInterval = setInterval(
        () => {
          if (this.isGenerating) {
            this.generateTechData(deviceId);
          }
        },
        this.randomInt(600000, 1800000),
      ); // 10-30 minutes

      this.intervals.push(realtimeInterval, spcInterval, techInterval);
    });

    this.logger.log('Mock data generation started for all machines');
  }

  private generateRealtimeData(deviceId: string) {
    const state = this.machineStates.get(deviceId);
    if (!state) return;

    // Simulate gradual changes in oil temperature
    state.oilTemp += this.randomFloat(-0.5, 0.5);
    state.oilTemp = Math.max(40, Math.min(60, state.oilTemp)); // Keep within reasonable range

    // Simulate small temperature fluctuations
    state.temperatures = state.temperatures.map((temp) => {
      const newTemp = temp + this.randomFloat(-0.3, 0.3);
      return Math.max(215, Math.min(225, newTemp)); // Keep within range
    });

    // Occasionally change operate mode or status
    if (Math.random() < 0.01) {
      // 1% chance
      state.operateMode = this.randomInt(1, 3);
    }

    const now = new Date();
    const timestamp = now.getTime();

    const realtimeData = {
      devId: { S: deviceId },
      topic: { S: 'realtime' },
      sendTime: { S: now.toISOString().replace('T', ' ').substring(0, 19) },
      sendStamp: { N: (timestamp + 1000).toString() },
      time: {
        S: new Date(timestamp - 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19),
      },
      timestamp: { N: (timestamp - 1000).toString() },
      Data: {
        M: {
          OT: { N: parseFloat(state.oilTemp.toFixed(1)).toString() },
          ASTS: { N: '0' },
          OPM: { N: state.operateMode.toString() },
          STS: { N: state.status.toString() },
          T1: { N: parseFloat(state.temperatures[0].toFixed(1)).toString() },
          T2: { N: parseFloat(state.temperatures[1].toFixed(1)).toString() },
          T3: { N: parseFloat(state.temperatures[2].toFixed(1)).toString() },
          T4: { N: parseFloat(state.temperatures[3].toFixed(1)).toString() },
          T5: { N: parseFloat(state.temperatures[4].toFixed(1)).toString() },
          T6: { N: parseFloat(state.temperatures[5].toFixed(1)).toString() },
          T7: { N: parseFloat(state.temperatures[6].toFixed(1)).toString() },
        },
      },
    };

    this.publishMqttMessage(`${deviceId}/realtime`, realtimeData);
    this.logger.debug(`Generated realtime data for ${deviceId}`);
  }

  private generateSPCData(deviceId: string) {
    const state = this.machineStates.get(deviceId);
    if (!state) return;

    // Increment cycle number
    state.cycleNumber += 1;

    // Simulate cycle variations
    state.cycleTime += this.randomFloat(-2, 2);
    state.cycleTime = Math.max(25, Math.min(70, state.cycleTime));

    state.injectionVelocity += this.randomFloat(-5, 5);
    state.injectionVelocity = Math.max(
      130,
      Math.min(170, state.injectionVelocity),
    );

    state.injectionPressure += this.randomFloat(-3, 3);
    state.injectionPressure = Math.max(
      60,
      Math.min(100, state.injectionPressure),
    );

    const now = new Date();
    const timestamp = now.getTime();

    // Simulate cycle start time (cycle time ago)
    const cycleStartTime = new Date(timestamp - state.cycleTime * 1000);

    const spcData = {
      devId: { S: deviceId },
      topic: { S: 'spc' },
      sendTime: { S: now.toISOString().replace('T', ' ').substring(0, 19) },
      sendStamp: { N: (timestamp + 1000).toString() },
      time: {
        S: new Date(timestamp - 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19),
      },
      timestamp: { N: (timestamp - 1000).toString() },
      Data: {
        M: {
          CYCN: { N: state.cycleNumber.toString() },
          ECYCT: { N: state.cycleTime.toFixed(2) },
          EIPM: { N: state.injectionPressure.toFixed(1) },
          EIVM: { N: state.injectionVelocity.toFixed(0) },
          ESIPT: { N: this.randomFloat(2.0, 4.0).toFixed(1) },
          ESIPP: { N: this.randomFloat(0, 0).toFixed(0) },
          ESIPS: { N: this.randomFloat(15, 25).toFixed(1) },
          EIPT: { N: this.randomFloat(8, 12).toFixed(1) },
          EIPSE: { N: this.randomFloat(12, 16).toFixed(0) },
          EPLST: { N: this.randomFloat(6, 10).toFixed(2) },
          EPLSPM: { N: this.randomFloat(0, 0).toFixed(0) },
          EFCHT: { N: this.randomFloat(4, 7).toFixed(2) },
          EIPSMIN: { N: this.randomFloat(10, 18).toFixed(1) },
          EOT: { N: state.oilTemp.toFixed(0) },
          EMOS: { N: this.randomFloat(250, 400).toFixed(1) },
          ET1: { N: state.temperatures[0].toFixed(0) },
          ET2: { N: state.temperatures[1].toFixed(0) },
          ET3: { N: state.temperatures[2].toFixed(0) },
          ET4: { N: state.temperatures[3].toFixed(0) },
          ET5: { N: state.temperatures[4].toFixed(0) },
          ET6: { N: state.temperatures[5].toFixed(0) },
          ET7: { N: state.temperatures[6].toFixed(0) },
          EISS: { N: state.injectionVelocity.toFixed(1) },
        },
      },
    };

    this.publishMqttMessage(`${deviceId}/spc`, spcData);
    this.logger.debug(
      `Generated SPC data for ${deviceId}, cycle ${state.cycleNumber}`,
    );
  }

  private generateTechData(deviceId: string) {
    const state = this.machineStates.get(deviceId);
    if (!state) return;

    // Occasionally update setpoints (simulating job change)
    if (Math.random() < 0.3) {
      // 30% chance to change setpoints
      state.tempSetpoints = state.tempSetpoints.map(
        (temp) => temp + this.randomInt(-2, 2),
      );
    }

    const now = new Date();
    const timestamp = now.getTime();

    const techData = {
      devId: { S: deviceId },
      topic: { S: 'tech' },
      sendTime: { S: now.toISOString().replace('T', ' ').substring(0, 19) },
      sendStamp: { N: (timestamp + 1000).toString() },
      time: {
        S: new Date(timestamp - 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19),
      },
      timestamp: { N: (timestamp - 1000).toString() },
      Data: {
        M: {
          // Temperature setpoints
          TS1: { N: state.tempSetpoints[0].toString() },
          TS2: { N: state.tempSetpoints[1].toString() },
          TS3: { N: state.tempSetpoints[2].toString() },
          TS4: { N: state.tempSetpoints[3].toString() },
          TS5: { N: state.tempSetpoints[4].toString() },
          TS6: { N: state.tempSetpoints[5].toString() },
          TS7: { N: state.tempSetpoints[6].toString() },
          TS8: { N: state.tempSetpoints[7].toString() },
          TS9: { N: state.tempSetpoints[8].toString() },
          TS10: { N: state.tempSetpoints[9].toString() },

          // Injection pressure steps
          IP1: { N: state.pressureSteps[0].toString() },
          IP2: { N: state.pressureSteps[1].toString() },
          IP3: { N: state.pressureSteps[2].toString() },
          IP4: { N: state.pressureSteps[3].toString() },
          IP5: { N: state.pressureSteps[4].toString() },
          IP6: { N: state.pressureSteps[5].toString() },
          IP7: { N: state.pressureSteps[6].toString() },
          IP8: { N: state.pressureSteps[7].toString() },
          IP9: { N: state.pressureSteps[8].toString() },
          IP10: { N: state.pressureSteps[9].toString() },

          // Injection velocity steps
          IV1: { N: state.velocitySteps[0].toString() },
          IV2: { N: state.velocitySteps[1].toString() },
          IV3: { N: state.velocitySteps[2].toString() },
          IV4: { N: state.velocitySteps[3].toString() },
          IV5: { N: state.velocitySteps[4].toString() },
          IV6: { N: state.velocitySteps[5].toString() },
          IV7: { N: state.velocitySteps[6].toString() },
          IV8: { N: state.velocitySteps[7].toString() },
          IV9: { N: state.velocitySteps[8].toString() },
          IV10: { N: state.velocitySteps[9].toString() },

          // Injection stroke steps
          IS1: { N: state.strokeSteps[0].toString() },
          IS2: { N: state.strokeSteps[1].toString() },
          IS3: { N: state.strokeSteps[2].toString() },
          IS4: { N: state.strokeSteps[3].toString() },
          IS5: { N: state.strokeSteps[4].toString() },
          IS6: { N: state.strokeSteps[5].toString() },
          IS7: { N: state.strokeSteps[6].toString() },
          IS8: { N: state.strokeSteps[7].toString() },
          IS9: { N: state.strokeSteps[8].toString() },
          IS10: { N: state.strokeSteps[9].toString() },

          // Injection time steps
          IT1: { N: state.timeSteps[0].toString() },
          IT2: { N: state.timeSteps[1].toString() },
          IT3: { N: state.timeSteps[2].toString() },
          IT4: { N: state.timeSteps[3].toString() },
          IT5: { N: state.timeSteps[4].toString() },
          IT6: { N: state.timeSteps[5].toString() },
          IT7: { N: state.timeSteps[6].toString() },
          IT8: { N: state.timeSteps[7].toString() },
          IT9: { N: state.timeSteps[8].toString() },
          IT10: { N: state.timeSteps[9].toString() },
        },
      },
    };

    this.publishMqttMessage(`${deviceId}/tech`, techData);
    this.logger.log(`Generated tech configuration for ${deviceId}`);
  }

  private publishMqttMessage(topic: string, data: any) {
    // Unmarshall DynamoDB format to plain JSON before publishing
    const plainData = this.unmarshallMessage(data);

    if (this.mqttClient && this.mqttClient.connected) {
      this.mqttClient.publish(topic, JSON.stringify(plainData), (error) => {
        if (error) {
          this.logger.error(`Failed to publish to topic ${topic}:`, error);
        }
      });
    } else {
      // MQTT not connected, inject directly into Redis
      this.injectDataToRedis(plainData);
    }
  }

  private async injectDataToRedis(data: any) {
    try {
      const queueName =
        data.topic === 'realtime'
          ? 'mqtt:realtime'
          : data.topic === 'spc'
            ? 'mqtt:spc'
            : 'mqtt:tech';

      const message = {
        topic: `factory/1/machine/${data.devId}/${data.topic}`,
        payload: data,
        qos: 0,
        retain: false,
      };

      await this.redisService.enqueueMQTTMessage(queueName, message);

      this.logger.debug(
        `🔄 Injected ${data.topic} data for ${data.devId} directly to Redis queue ${queueName}`,
      );
    } catch (error) {
      this.logger.error('Failed to inject data to Redis:', error);
    }
  }

  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Convert DynamoDB-format data to plain JSON format
   * This matches what AWS sends and transforms it to what the backend expects
   */
  private unmarshallDynamoDBData(data: any): any {
    if (data.S !== undefined) return data.S;
    if (data.N !== undefined) return parseFloat(data.N);
    if (data.M !== undefined) {
      const result = {};
      for (const key in data.M) {
        result[key] = this.unmarshallDynamoDBData(data.M[key]);
      }
      return result;
    }
    if (data.L !== undefined) {
      return data.L.map((item) => this.unmarshallDynamoDBData(item));
    }
    return data;
  }

  /**
   * Unmarshall complete message from DynamoDB format to plain JSON
   */
  private unmarshallMessage(dynamoDBMessage: any): any {
    const plainMessage: any = {};
    for (const key in dynamoDBMessage) {
      plainMessage[key] = this.unmarshallDynamoDBData(dynamoDBMessage[key]);
    }
    return plainMessage;
  }

  // Control methods
  async startGeneration() {
    if (!this.isGenerating) {
      await this.initializeMockData();
    }
  }

  stopGeneration() {
    this.isGenerating = false;
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals = [];
    this.logger.log('Mock data generation stopped');
  }

  isRunning(): boolean {
    return this.isGenerating;
  }

  // Get generation statistics
  getGenerationStats() {
    return {
      isGenerating: this.isGenerating,
      machineCount: this.machineStates.size,
      machines: Array.from(this.machineStates.keys()),
    };
  }

  async onModuleDestroy() {
    this.stopGeneration();

    if (this.mqttClient) {
      this.mqttClient.end();
    }

    this.logger.log('Mock data service shutdown complete');
  }
}
