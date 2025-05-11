import { Controller, Get } from "@nestjs/common"

@Controller("telegram")
export class TelegramController {
  @Get("status")
  getStatus() {
    return { status: "Bot is running" }
  }
}
