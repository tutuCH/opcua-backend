import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { v4 as uuidv4 } from 'uuid';
import * as AWS from 'aws-sdk';

@Injectable()
export class MqttConnectionService {
  private readonly logger = new Logger(MqttConnectionService.name);
  private mqttClients: Map<string, mqtt.MqttClient> = new Map();

  private iot: AWS.Iot;

  constructor() {
    AWS.config.update({ region: 'us-east-1' });
    this.iot = new AWS.Iot();
  }
  async createConnection(
    dto: CreateConnectionDto,
  ): Promise<{ message: string; clientId: string }> {
    const clientId = uuidv4();

    try {
      // AWS IoT Setup
      const { endpointAddress } = await this.iot
        .describeEndpoint({ endpointType: 'iot:Data-ATS' })
        .promise();
      const brokerUrl = `ssl://${endpointAddress}:8883`;

      const [thing, cert] = await Promise.all([
        this.iot.createThing({ thingName: clientId }).promise(),
        this.iot.createKeysAndCertificate({ setAsActive: true }).promise(),
      ]);

      await this.iot
        .attachThingPrincipal({
          thingName: clientId,
          principal: cert.certificateArn,
        })
        .promise();

      // MQTT Connection
      const client = await this.connectClient(brokerUrl, {
        clientId,
        key: cert.keyPair.PrivateKey,
        cert: cert.certificatePem,
        rejectUnauthorized: true,
      });

      this.mqttClients.set(clientId, client);
      return { message: 'Connected successfully', clientId };
    } catch (error) {
      this.logger.error(`Connection failed for ${clientId}: ${error.message}`);
      throw new HttpException(
        `AWS IoT setup failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private connectClient(
    brokerUrl: string,
    options: mqtt.IClientOptions,
  ): Promise<mqtt.MqttClient> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, options);
      const timeout = setTimeout(() => {
        client.end();
        reject(
          new HttpException('Connection timeout', HttpStatus.GATEWAY_TIMEOUT),
        );
      }, 10000);

      client
        .on('connect', () => {
          clearTimeout(timeout);
          resolve(client);
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          client.end();
          reject(err);
        });
    });
  }

  async removeConnection(clientId: string): Promise<{ message: string }> {
    const client = this.mqttClients.get(clientId);
    if (!client) {
      throw new HttpException('Client not found', HttpStatus.NOT_FOUND);
    }

    return new Promise((resolve, reject) => {
      client.end(false, (err) => {
        if (err) {
          this.logger.error(
            `Error disconnecting client ${clientId}: ${err.message}`,
          );
          return reject(
            new HttpException(
              `Failed to disconnect client: ${err.message}`,
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
          );
        }
        this.mqttClients.delete(clientId);
        this.logger.log(`Client ${clientId} disconnected`);

        // Delete the AWS IoT thing (assumes thing name equals clientId)
        const params = { thingName: clientId };
        this.iot.deleteThing(params, (iotErr, data) => {
          if (iotErr) {
            this.logger.error(
              `Error deleting AWS IoT thing for client ${clientId}: ${iotErr.message}`,
            );
            return reject(
              new HttpException(
                `Failed to delete machine from AWS IoT: ${iotErr.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            );
          }
          this.logger.log(`AWS IoT thing ${clientId} deleted successfully`);
          resolve({
            message: 'Connection removed and machine deleted successfully',
          });
        });
      });
    });
  }
}
