import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RabbitmqService } from './helper/rabbitmq.service';
import { SubscriberService } from './helper/subscriber.service';
import { UserModule } from './user/user.module';
import { OpcuaModule } from './opcua/opcua.module';
import { User } from './user/entities/user.entity';
import { FactoriesModule } from './factories/factories.module';
import { MachinesModule } from './machines/machines.module';
import { Factory } from './factories/entities/factory.entity';
import { Machine } from './machines/entities/machine.entity';
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'opcuadashboard',
      entities: [User, Factory, Machine],
      synchronize: true,
    }),
    UserModule,
    OpcuaModule,
    FactoriesModule,
    MachinesModule,
  ],
  controllers: [],
  providers: [SubscriberService],
})
export class AppModule {}
