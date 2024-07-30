import { PartialType } from '@nestjs/mapped-types';
import { ConnectOpcuaDto } from './connect-opcua.dto';

export class UpdateOpcuaDto extends PartialType(ConnectOpcuaDto) {}
