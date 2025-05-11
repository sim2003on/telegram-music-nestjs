import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram/telegram.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), TelegramModule, YoutubeModule],
})
export class AppModule { }
