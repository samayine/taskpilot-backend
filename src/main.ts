import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — configurable via env, defaults to * for dev
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle("TaskPilot API")
    .setDescription(
      "Company-level workflow management system with RBAC (CEO, ASSISTANT, TEAM_LEAD, EMPLOYEE), " +
      "strict task lifecycle, department-based team organization, and real-time WebSocket notifications.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "JWT",
    )
    .addTag("Auth", "Company registration and user login")
    .addTag("Users", "User provisioning and profile management (CEO + ASSISTANT)")
    .addTag("Teams", "Team creation, member management, and department filtering")
    .addTag("Tasks", "Task lifecycle — create, assign, review, approve/reject")
    .addTag("Notifications", "Real-time WebSocket notifications and history")
    .addTag("Company", "Company profile and CEO dashboard statistics")
    .addTag("Activity Logs", "System-wide activity audit trail (CEO only)")
    .addTag("Comments", "Task collaboration comments")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
