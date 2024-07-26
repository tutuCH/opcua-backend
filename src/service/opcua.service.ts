// src/opcua/opcua.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  OPCUAClient,
  AttributeIds,
  makeBrowsePath,
  StatusCodes,
  TimestampsToReturn,
  DataValue,
  MonitoringParametersOptions,
  ClientSubscription,
  ClientSession,
  ReadValueIdOptions,
} from 'node-opcua';

@Injectable()
export class OpcuaService {
  private clients: { [key: string]: OPCUAClient } = {};
  private sessions: { [key: string]: ClientSession } = {};
  private subscriptions: { [key: string]: ClientSubscription } = {};
  private machineItemIDs = [
    'VAT1T300',
    'VAT1T301',
    'VAP1P300',
    'J3P1P001',
    'VAS1S303',
    'J1S1S005',
    'J1P2P005',
    'J1T1T040',
  ];

  async setConnection(endpointUrl: string): Promise<string> {
    if (this.clients[endpointUrl]) {
      console.log(`Already connected to OPC UA server at ${endpointUrl}`);
      return `Already connected to OPC UA server at ${endpointUrl}`;
    }    
    const client = OPCUAClient.create({ endpointMustExist: false });
    await client.connect(endpointUrl);
    console.log(`Connected to OPC UA server at ${endpointUrl}`);
    const session = await client.createSession();
    console.log(`Session created for ${endpointUrl}`);
    this.clients[endpointUrl] = client;
    this.sessions[endpointUrl] = session;

    await this.readData(endpointUrl, session);
    return `Connection established and data monitoring started for ${endpointUrl}`;
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
        console.log(
          `Subscription started for ${endpointUrl} - subscriptionId=`,
          subscription.subscriptionId,
        );
      })
      .on('keepalive', () => {
        console.log(`Subscription keepalive for ${endpointUrl}`);
      })
      .on('terminated', () => {
        console.log(`Subscription terminated for ${endpointUrl}`);
      });

    const itemsToMonitor: ReadValueIdOptions[] = this.machineItemIDs.map(
      (itemID) => ({
        nodeId: `ns=1;s=${itemID}`,
        attributeId: AttributeIds.Value,
      }),
    );

    const parameters: MonitoringParametersOptions = {
      samplingInterval: 1000,
      discardOldest: true,
      queueSize: 10,
    };

    itemsToMonitor.forEach(async (item) => {
      const monitoredItem = subscription.monitor(
        item,
        parameters,
        TimestampsToReturn.Both,
      );

      (await monitoredItem).on('changed', (dataValue) => {
        console.log(
          `Value of ${item.nodeId} from ${endpointUrl} = `,
          dataValue.value.value.toString(),
        );
      });
    });

    this.subscriptions[endpointUrl] = subscription;
  }

  async disconnect(endpointUrl: string) {
    const subscription = this.subscriptions[endpointUrl];
    const session = this.sessions[endpointUrl];
    const client = this.clients[endpointUrl];

    if (subscription) {
      await subscription.terminate();
      console.log(`Subscription terminated for ${endpointUrl}`);
    }
    if (session) {
      await session.close();
      console.log(`Session closed for ${endpointUrl}`);
    }
    if (client) {
      await client.disconnect();
      console.log(`Client disconnected from ${endpointUrl}`);
    }

    delete this.subscriptions[endpointUrl];
    delete this.sessions[endpointUrl];
    delete this.clients[endpointUrl];
  }

  onModuleDestroy() {
    Object.keys(this.clients).forEach((endpointUrl) => {
      this.disconnect(endpointUrl).catch(console.error);
    });
  }  
}
