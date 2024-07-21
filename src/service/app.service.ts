import { Injectable } from '@nestjs/common';
import {
  NodeId,
  NodeIdType,
  coerceNodeId,
  resolveNodeId,
  LocalizedText,
  VariantArrayType,
  Variant,
  DataType,
  StatusCodes,
  DataValue,
} from 'node-opcua';

@Injectable()
export class AppService {
  getHello(): string {
    const nodeId1 = coerceNodeId('ns=3;i=100');
    console.log(nodeId1.toString());
    // ns=4;s=TemperatureSensor
    const nodeId2 = coerceNodeId('ns=3;s=TemperatureSensor');
    console.log(nodeId2.toString());
    // ns=4;s=TemperatureSensor
    const nodeId3 = coerceNodeId('g=1E14849E-3744-470d-8C7B-5F9110C2FA32');
    console.log(`nodeId3.identifierType: ${nodeId3.identifierType}`);
    console.log(`NodeIdType.GUID: ${NodeIdType.GUID}`);
    // nodeId3.toString().should.eql("ns=0g=1E14849E-3744-470d-8C7B-5F9110C2FA32");
    console.log(nodeId3.toString());

    const nodeId4 = resolveNodeId('RootFolder');
    console.log(nodeId4.toString());
    // ns=0g=1E14849E-3744-470d-8C7B-5F9110C2FA32"

    const variant1 = new Variant({
      dataType: DataType.Double,
      arrayType: VariantArrayType.Scalar,
      value: 3.14,
    });
    console.log('variant1 = ', variant1.toString());
    const dataValue4 = new DataValue({
      sourceTimestamp: new Date(),
      sourcePicoseconds: 0,
      serverTimestamp: new Date(),
      serverPicoseconds: 0,
      statusCode: StatusCodes.Good,
      value: { dataType: 'Double', value: 3.14 },
    });
    console.log('dataValue4 = ', dataValue4.toString());
    return 'Hello World!';
  }
}
