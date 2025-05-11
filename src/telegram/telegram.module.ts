import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { YoutubeModule } from "src/youtube/youtube.module";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [YoutubeModule, ConfigModule],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule { }
