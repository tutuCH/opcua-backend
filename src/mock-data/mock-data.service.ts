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
      devId: deviceId,
      topic: 'realtime',
      sendTime: now.toISOString().replace('T', ' ').substring(0, 19),
      sendStamp: timestamp + 1000,
      time: new Date(timestamp - 1000)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19),
      timestamp: timestamp - 1000,
      Data: {
        OT: parseFloat(state.oilTemp.toFixed(1)),
        ATST: 0,
        OPM: state.operateMode,
        STS: state.status,
        T1: parseFloat(state.temperatures[0].toFixed(1)),
        T2: parseFloat(state.temperatures[1].toFixed(1)),
        T3: parseFloat(state.temperatures[2].toFixed(1)),
        T4: parseFloat(state.temperatures[3].toFixed(1)),
        T5: parseFloat(state.temperatures[4].toFixed(1)),
        T6: parseFloat(state.temperatures[5].toFixed(1)),
        T7: parseFloat(state.temperatures[6].toFixed(1)),
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
      devId: deviceId,
      topic: 'spc',
      sendTime: now.toISOString().replace('T', ' ').substring(0, 19),
      sendStamp: timestamp + 1000,
      time: new Date(timestamp - 1000)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19),
      timestamp: timestamp - 1000,
      Data: {
        CYCN: state.cycleNumber.toString(),
        ECYCT: state.cycleTime.toFixed(1),
        EISS: cycleStartTime.toISOString(),
        EIVM: state.injectionVelocity.toFixed(1),
        EIPM: state.injectionPressure.toFixed(1),
        ESIPT: this.randomFloat(2.0, 3.0).toFixed(1),
        ESIPP: this.randomFloat(85, 95).toFixed(1),
        ESIPS: this.randomFloat(30, 40).toFixed(1),
        EIPT: this.randomFloat(4.5, 6.5).toFixed(1),
        EIPSE: new Date(cycleStartTime.getTime() + 6000).toISOString(),
        EPLST: this.randomFloat(3.5, 4.5).toFixed(1),
        EPLSSE: new Date(cycleStartTime.getTime() + 10000).toISOString(),
        EPLSPM: this.randomFloat(115, 125).toFixed(1),
        ET1: state.temperatures[0].toFixed(1),
        ET2: state.temperatures[1].toFixed(1),
        ET3: state.temperatures[2].toFixed(1),
        ET4: state.temperatures[3].toFixed(1),
        ET5: state.temperatures[4].toFixed(1),
        ET6: state.temperatures[5].toFixed(1),
        ET7: state.temperatures[6].toFixed(1),
        ET8: (state.temperatures[0] + this.randomFloat(-1, 1)).toFixed(1),
        ET9: (state.temperatures[1] + this.randomFloat(-1, 1)).toFixed(1),
        ET10: (state.temperatures[2] + this.randomFloat(-1, 1)).toFixed(1),
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
      devId: deviceId,
      topic: 'tech',
      sendTime: now.toISOString().replace('T', ' ').substring(0, 19),
      sendStamp: timestamp + 1000,
      time: new Date(timestamp - 1000)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19),
      timestamp: timestamp - 1000,
      Data: {
        // Temperature setpoints
        TS1: state.tempSetpoints[0],
        TS2: state.tempSetpoints[1],
        TS3: state.tempSetpoints[2],
        TS4: state.tempSetpoints[3],
        TS5: state.tempSetpoints[4],
        TS6: state.tempSetpoints[5],
        TS7: state.tempSetpoints[6],
        TS8: state.tempSetpoints[7],
        TS9: state.tempSetpoints[8],
        TS10: state.tempSetpoints[9],

        // Injection pressure steps
        IP1: state.pressureSteps[0],
        IP2: state.pressureSteps[1],
        IP3: state.pressureSteps[2],
        IP4: state.pressureSteps[3],
        IP5: state.pressureSteps[4],
        IP6: state.pressureSteps[5],
        IP7: state.pressureSteps[6],
        IP8: state.pressureSteps[7],
        IP9: state.pressureSteps[8],
        IP10: state.pressureSteps[9],

        // Injection velocity steps
        IV1: state.velocitySteps[0],
        IV2: state.velocitySteps[1],
        IV3: state.velocitySteps[2],
        IV4: state.velocitySteps[3],
        IV5: state.velocitySteps[4],
        IV6: state.velocitySteps[5],
        IV7: state.velocitySteps[6],
        IV8: state.velocitySteps[7],
        IV9: state.velocitySteps[8],
        IV10: state.velocitySteps[9],

        // Injection stroke steps
        IS1: state.strokeSteps[0],
        IS2: state.strokeSteps[1],
        IS3: state.strokeSteps[2],
        IS4: state.strokeSteps[3],
        IS5: state.strokeSteps[4],
        IS6: state.strokeSteps[5],
        IS7: state.strokeSteps[6],
        IS8: state.strokeSteps[7],
        IS9: state.strokeSteps[8],
        IS10: state.strokeSteps[9],

        // Injection time steps
        IT1: state.timeSteps[0],
        IT2: state.timeSteps[1],
        IT3: state.timeSteps[2],
        IT4: state.timeSteps[3],
        IT5: state.timeSteps[4],
        IT6: state.timeSteps[5],
        IT7: state.timeSteps[6],
        IT8: state.timeSteps[7],
        IT9: state.timeSteps[8],
        IT10: state.timeSteps[9],
      },
    };

    this.publishMqttMessage(`${deviceId}/tech`, techData);
    this.logger.log(`Generated tech configuration for ${deviceId}`);
  }

  private publishMqttMessage(topic: string, data: any) {
    if (this.mqttClient && this.mqttClient.connected) {
      this.mqttClient.publish(topic, JSON.stringify(data), (error) => {
        if (error) {
          this.logger.error(`Failed to publish to topic ${topic}:`, error);
        }
      });
    } else {
      // MQTT not connected, inject directly into Redis
      this.injectDataToRedis(data);
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
