import * as ytdl from "@distube/ytdl-core"
import { Injectable, Logger } from "@nestjs/common"
import * as ffmpeg from "fluent-ffmpeg"
import { createWriteStream, mkdirSync, unlink } from "fs"
import * as path from "path"
import { pipeline } from "stream"
import { promisify } from "util"

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name)
  private readonly streamPipeline = promisify(pipeline)
  private readonly unlinkAsync = promisify(unlink)
  private readonly uploadDir = path.join(process.cwd(), "uploads")

  constructor() {
    // Ensure uploads directory exists
    try {
      mkdirSync(this.uploadDir, { recursive: true })
    } catch (error) {
      this.logger.error(`Failed to create uploads directory: ${error}`)
    }
  }

  /**
   * Get the title of a YouTube video
   */
  async getVideoTitle(url: string): Promise<string> {
    try {
      this.logger.log("Fetching video title...")
      const videoInfo = await ytdl.getInfo(url)
      return videoInfo.videoDetails.title.replace(/[^\w\s]/gi, "")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to get video title: ${errorMessage}`)
      throw new Error("Failed to get video information")
    }
  }

  /**
   * Download a YouTube video and convert it to MP3 with progress tracking
   */
  async downloadAndConvertToMp3(
    url: string,
    onProgress: (stage: string, percentage: number) => void
  ): Promise<string> {
    try {
      // Get video info
      onProgress("fetching_info", 0)
      const videoInfo = await ytdl.getInfo(url)
      const videoTitle = videoInfo.videoDetails.title.replace(/[^\w\s]/gi, "")

      // Create unique filenames
      const timestamp = Date.now()
      const videoPath = path.join(this.uploadDir, `${videoTitle}-${timestamp}.mp4`)
      const audioPath = path.join(this.uploadDir, `${videoTitle}-${timestamp}.mp3`)

      // Download video with progress
      onProgress("downloading", 0)
      const videoStream = ytdl(url, { quality: "highestaudio" })
      let downloaded = 0
      let totalSize = parseInt(videoInfo.formats[0].contentLength || "0")

      videoStream.on("progress", (chunkLength, downloadedBytes, totalBytes) => {
        downloaded = downloadedBytes
        totalSize = totalBytes
        const percentage = Math.round((downloaded / totalSize) * 100)
        onProgress("downloading", percentage)
      })

      const fileStream = createWriteStream(videoPath)
      await this.streamPipeline(videoStream, fileStream)

      // Convert to MP3 with progress
      onProgress("converting", 0)
      await this.convertToMp3(videoPath, audioPath, (percentage) =>
        onProgress("converting", percentage)
      )

      // Delete the video file
      onProgress("cleanup", 0)
      await this.deleteFile(videoPath)
      onProgress("cleanup", 100)

      return audioPath
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to download and convert: ${errorMessage}`)
      throw new Error("Failed to download and convert the YouTube video")
    }
  }

  /**
   * Convert a video file to MP3 with progress tracking
   */
  private async convertToMp3(
    videoPath: string,
    audioPath: string,
    onProgress: (percentage: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec("libmp3lame")
        .audioBitrate(192)
        .on("progress", (progress) => {
          const percentage = Math.round(progress.percent || 0)
          onProgress(percentage)
        })
        .on("end", () => {
          resolve()
        })
        .on("error", (err) => {
          this.logger.error(`FFmpeg error: ${err.message}`)
          reject(err)
        })
        .run()
    })
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await this.unlinkAsync(filePath)
      this.logger.log(`Deleted file: ${filePath}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to delete file ${filePath}: ${errorMessage}`)
    }
  }
}
