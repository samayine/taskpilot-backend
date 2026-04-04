import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async health(): Promise<{ status: string; database: string }> {
    await this.appService.checkDatabase();
    return { status: 'ok', database: 'connected' };
  }
}
