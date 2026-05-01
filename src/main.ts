import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle("TaskPilot API")
    .setDescription(
      "Company-level workflow management system with RBAC, task lifecycle, and real-time notifications",
    )
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "JWT",
    )
    .addTag("Auth", "Registration and login")
    .addTag("Users", "User management (CEO only)")
    .addTag("Teams", "Team management (CEO only)")
    .addTag("Tasks", "Task lifecycle management")
    .addTag("Notifications", "Real-time notifications")
    .addTag("Company", "Company profile and CEO dashboard")
    .addTag("Activity Logs", "System-wide activity tracking")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
