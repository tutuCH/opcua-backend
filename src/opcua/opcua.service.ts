
import { Injectable, Logger } from '@nestjs/common';
// import { ConnectOpcuaDto } from './dto/connect-opcua.dto';
// import { DisconnectOpcuaDto } from './dto/disconnect-opcua.dto';
import {
  OPCUAClient,
  AttributeIds,
  ClientSubscription,
  ClientSession,
  ReadValueIdOptions,
  MonitoringParametersOptions,
  TimestampsToReturn,
} from 'node-opcua';
import { RabbitmqService } from '../helper/rabbitmq.service';

@Injectable()
export class OpcuaService {
  private readonly logger = new Logger(OpcuaService.name);

  constructor(private readonly rabbitmqService: RabbitmqService) {
    this.rabbitmqService.connect();
  }

  private clients: { [key: string]: OPCUAClient } = {};
  private sessions: { [key: string]: ClientSession } = {};
  private subscriptions: { [key: string]: ClientSubscription } = {};
  private reconnectAttempts: { [key: string]: number } = {};
  private maxReconnectAttempts: number = 3;
  private machineItemIDs: string[] = ['VAT1T300', 'VAT1T301', 'VAP1P300', 'J3P1P001', 'VAS1S303', 'J1S1S005', 'J1P2P005', 'J1T1T040'];

  async setConnection(endpointUrl: string): Promise<string> {
    if (this.clients[endpointUrl]) {
      this.logger.log(`Already connected to OPC UA server at ${endpointUrl}`);
      return `Already connected to OPC UA server at ${endpointUrl}`;
    }

    const client = OPCUAClient.create({ endpointMustExist: false });

    try {
      const connectionPromise = client.connect(endpointUrl);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('Connection timeout'), 5000));

      await Promise.race([connectionPromise, timeoutPromise]);

      this.logger.log(`Connected to OPC UA server at ${endpointUrl}`);

      const session = await client.createSession();
      this.logger.log(`Session created for ${endpointUrl}`);

      this.clients[endpointUrl] = client;
      this.sessions[endpointUrl] = session;

      await this.readData(endpointUrl, session);

      return `Connection established and data monitoring started for ${endpointUrl}`;
    } catch (error) {
      this.logger.error(`Error connecting to OPC UA server at ${endpointUrl}`, error);
      await this.cleanupConnection(endpointUrl);
      return `Failed to connect to OPC UA server at ${endpointUrl}`;
    }
  }

  async readData(endpointUrl: string, session: ClientSession) {
    const subscription = ClientSubscription.create(session, {
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 10,
      publishingEnabled: true,
      priority: 10,
    });

    subscription
      .on('started', () => {
        this.logger.log(`Subscription started for ${endpointUrl} - subscriptionId=`, subscription.subscriptionId);
      })
      .on('keepalive', () => {
        this.logger.log(`Subscription keepalive for ${endpointUrl}`);
      })
      .on('terminated', async () => {
        this.logger.log(`Subscription terminated for ${endpointUrl}`);
      });

    const itemsToMonitor: ReadValueIdOptions[] = this.machineItemIDs.map((itemID) => ({
      nodeId: `ns=1;s=${itemID}`,
      attributeId: AttributeIds.Value,
    }));

    const parameters: MonitoringParametersOptions = {
      samplingInterval: 1000,
      discardOldest: true,
      queueSize: 10,
    };

    itemsToMonitor.forEach(async (item) => {
      try {
        const monitoredItem = await subscription.monitor(item, parameters, TimestampsToReturn.Both);
        monitoredItem.on('changed', (dataValue) => {
          const message = `Value of ${item.nodeId} from ${endpointUrl} = ${dataValue.value.value.toString()}`;
          // this.logger.log(message);
          this.rabbitmqService.publishOpcUaData(message);
        });
      } catch (error) {
        this.logger.error(`Error monitoring item ${item.nodeId} from ${endpointUrl}`, error);
      }
    });

    this.subscriptions[endpointUrl] = subscription;
  }

  async reconnect(endpointUrl: string) {
    this.logger.log(`Reconnecting to OPC UA server at ${endpointUrl}... Attempt ${this.reconnectAttempts[endpointUrl] + 1}`);
    await this.cleanupConnection(endpointUrl);
    this.reconnectAttempts[endpointUrl]++;
    const result = await this.setConnection(endpointUrl);
    if (result.includes("Failed")) {
      this.logger.log(`Reconnect attempt ${this.reconnectAttempts[endpointUrl]} failed for ${endpointUrl}`);
    } else {
      this.reconnectAttempts[endpointUrl] = 0;
    }
  }

  async cleanupConnection(endpointUrl: string) {
    if (this.subscriptions[endpointUrl]) {
      try {
        await this.subscriptions[endpointUrl].terminate();
        this.logger.log(`Subscription terminated for ${endpointUrl}`);
      } catch (error) {
        this.logger.error(`Error terminating subscription for ${endpointUrl}`, error);
      }
      delete this.subscriptions[endpointUrl];
    }

    if (this.sessions[endpointUrl]) {
      try {
        await this.sessions[endpointUrl].close();
        this.logger.log(`Session closed for ${endpointUrl}`);
      } catch (error) {
        this.logger.error(`Error closing session for ${endpointUrl}`, error);
      }
      delete this.sessions[endpointUrl];
    }

    if (this.clients[endpointUrl]) {
      try {
        await this.clients[endpointUrl].disconnect();
        this.logger.log(`Client disconnected from ${endpointUrl}`);
      } catch (error) {
        this.logger.error(`Error disconnecting client from ${endpointUrl}`, error);
      }
      delete this.clients[endpointUrl];
    }
  }

  async disconnect(endpointUrl: string) {
    const subscription = this.subscriptions[endpointUrl];
    const session = this.sessions[endpointUrl];
    const client = this.clients[endpointUrl];

    if (subscription) {
      await subscription.terminate();
      this.logger.log(`Subscription terminated for ${endpointUrl}`);
    }
    if (session) {
      await session.close();
      this.logger.log(`Session closed for ${endpointUrl}`);
    }
    if (client) {
      await client.disconnect();
      this.logger.log(`Client disconnected from ${endpointUrl}`);
    }

    delete this.subscriptions[endpointUrl];
    delete this.sessions[endpointUrl];
    delete this.clients[endpointUrl];
    delete this.reconnectAttempts[endpointUrl];
  }

  onModuleDestroy() {
    Object.keys(this.clients).forEach((endpointUrl) => {
      this.disconnect(endpointUrl).catch(this.logger.error);
    });
  }
}
