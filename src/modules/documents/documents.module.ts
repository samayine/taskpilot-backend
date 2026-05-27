import { Module } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";
import { TeamDocumentsController } from "./team-documents.controller";

@Module({
  providers: [DocumentsService],
  controllers: [DocumentsController, TeamDocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
