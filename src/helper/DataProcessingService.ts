import { Injectable } from "@nestjs/common";
import { RabbitMQService } from "src/service/rabbitmq.service";

@Injectable()
export class DataProcessingService {
  constructor(private readonly rabbitMQService: RabbitMQService) {}

  onModuleInit() {
    this.rabbitMQService.receiveMessages(this.processMessage.bind(this));
  }

  processMessage(message: any) {
    console.log('Processing message:', message);
    // Implement your business logic for handling the data
  }
}
