import { Injectable, Logger, type OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Telegraf } from "telegraf"
import { message } from "telegraf/filters"
import { YoutubeService } from "../youtube/youtube.service"

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name)
  private bot: Telegraf
  private readonly spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

  constructor(
    private configService: ConfigService,
    private youtubeService: YoutubeService
  ) {
    const token = this.configService.get<string>("TELEGRAM_BOT_TOKEN")
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not defined in environment variables")
    }
    this.bot = new Telegraf(token)
  }

  onModuleInit() {
    this.initializeBot()
    this.startBot()
  }

  private initializeBot() {
    // Start command
    this.bot.start(async (ctx) => {
      await ctx.reply("Welcome to YouTube MP3 Downloader Bot! Send me a YouTube link, and I'll convert it to MP3 for you.")
    })

    // Help command
    this.bot.help(async (ctx) => {
      await ctx.reply("Simply send me a YouTube video URL, and I'll download it and convert it to MP3 format for you.")
    })

    // Handle YouTube URLs
    this.bot.on(message("text"), async (ctx) => {
      const messageText = ctx.message.text

      // Simple URL validation
      if (!messageText.includes("youtube.com/watch?v=") && !messageText.includes("youtu.be/")) {
        return ctx.reply("Please send a valid YouTube URL.")
      }

      try {
        // Initialize progress message
        let spinnerIndex = 0
        let lastStage = ""
        let lastPercentage = 0
        const processingMessage = await ctx.reply(`${this.spinnerFrames[0]} Initializing...`)

        // Update progress message
        const updateProgress = async (stage: string, percentage: number) => {
          spinnerIndex = (spinnerIndex + 1) % this.spinnerFrames.length
          const stageText = {
            fetching_info: "Fetching video info",
            downloading: "Downloading video",
            converting: "Converting to MP3",
            cleanup: "Cleaning up"
          }[stage] || stage

          // Only update if stage or percentage changed significantly
          if (stage !== lastStage || Math.abs(percentage - lastPercentage) >= 5) {
            lastStage = stage
            lastPercentage = percentage
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              processingMessage.message_id,
              undefined,
              `${this.spinnerFrames[spinnerIndex]} ${stageText}: ${percentage}%`
            ).catch(() => { }) // Ignore edit errors
          }
        }

        // Start processing
        const audioPath = await this.youtubeService.downloadAndConvertToMp3(
          messageText,
          updateProgress
        )

        // Get video title
        const videoTitle = await this.youtubeService.getVideoTitle(messageText)

        // Send the audio file
        await ctx.reply(`Here's your MP3 for: ${videoTitle}`)
        await ctx.replyWithAudio({ source: audioPath })

        // Clean up
        await this.youtubeService.deleteFile(audioPath)

        // Delete processing message
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id)
      } catch (error) {
        this.logger.error("Error processing YouTube URL", error)
        await ctx.reply("Sorry, there was an error processing your request. Please try again with a different video.")
      }
    })

    // Error handling
    this.bot.catch(async (err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err)
      await ctx.reply("An error occurred while processing your request. Please try again later.")
    })
  }

  private startBot() {
    this.bot
      .launch()
      .then(() => this.logger.log("Telegram bot started successfully"))
      .catch((err) => this.logger.error("Failed to start Telegram bot", err))

    // Enable graceful stop
    process.once("SIGINT", () => this.bot.stop("SIGINT"))
    process.once("SIGTERM", () => this.bot.stop("SIGTERM"))
  }
}
