package com.milsaa.musicrecorder

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.projection.MediaProjection
import java.io.File

/**
 * Захватывает звук, который играют другие приложения (AudioPlaybackCapture, Android 10+),
 * и кодирует его в AAC внутри M4A. Приложения, запретившие захват своего звука, сюда не попадут.
 */
class AudioCapture(projection: MediaProjection, private val output: File) {

    @Volatile private var running = false
    private var thread: Thread? = null
    private var bytesCaptured = 0L

    private val audioRecord: AudioRecord
    private val codec: MediaCodec
    private val muxer: MediaMuxer
    private var trackIndex = -1
    private var muxerStarted = false

    init {
        val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
            .build()
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT,
        )
        audioRecord = buildRecord(captureConfig, format, minBuffer * 4)

        val codecFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, CHANNELS).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, READ_CHUNK)
        }
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        codec.configure(codecFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        muxer = MediaMuxer(output.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    }

    // Разрешение RECORD_AUDIO запрашивается в MainActivity до старта записи.
    @SuppressLint("MissingPermission")
    private fun buildRecord(config: AudioPlaybackCaptureConfiguration, format: AudioFormat, bufferSize: Int) =
        AudioRecord.Builder()
            .setAudioFormat(format)
            .setBufferSizeInBytes(bufferSize)
            .setAudioPlaybackCaptureConfig(config)
            .build()

    /** [onFinished] вызывается из рабочего потока: true, если в файле есть звук. */
    fun start(onFinished: (Boolean, Throwable?) -> Unit) {
        running = true
        thread = Thread({
            var error: Throwable? = null
            try {
                loop()
            } catch (t: Throwable) {
                error = t
            } finally {
                release()
            }
            onFinished(error == null && muxerStarted && bytesCaptured > 0, error)
        }, "AudioCapture").also { it.start() }
    }

    fun stop() {
        running = false
    }

    private fun loop() {
        val info = MediaCodec.BufferInfo()
        audioRecord.startRecording()
        codec.start()
        while (running) {
            val index = codec.dequeueInputBuffer(TIMEOUT_US)
            if (index >= 0) {
                val buffer = codec.getInputBuffer(index)!!
                buffer.clear()
                val read = audioRecord.read(buffer, minOf(buffer.remaining(), READ_CHUNK))
                val size = read.coerceAtLeast(0)
                codec.queueInputBuffer(index, 0, size, presentationTimeUs(), 0)
                bytesCaptured += size
            }
            drain(info, endOfStream = false)
        }
        // Завершаем поток кодировщика, чтобы MP4 корректно закрылся.
        var index: Int
        do {
            index = codec.dequeueInputBuffer(TIMEOUT_US)
        } while (index < 0)
        codec.queueInputBuffer(index, 0, 0, presentationTimeUs(), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        drain(info, endOfStream = true)
    }

    private fun presentationTimeUs() = bytesCaptured * 1_000_000L / (SAMPLE_RATE * BYTES_PER_FRAME)

    private fun drain(info: MediaCodec.BufferInfo, endOfStream: Boolean) {
        var idleTries = 0
        while (true) {
            val index = codec.dequeueOutputBuffer(info, if (endOfStream) TIMEOUT_US else 0)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream || ++idleTries > MAX_EOS_TRIES) return
                }
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    trackIndex = muxer.addTrack(codec.outputFormat)
                    muxer.start()
                    muxerStarted = true
                }
                index >= 0 -> {
                    val buffer = codec.getOutputBuffer(index)!!
                    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
                    if (info.size > 0 && muxerStarted) {
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        muxer.writeSampleData(trackIndex, buffer, info)
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    private fun release() {
        runCatching { audioRecord.stop() }
        audioRecord.release()
        runCatching { codec.stop() }
        codec.release()
        if (muxerStarted) runCatching { muxer.stop() }
        muxer.release()
    }

    private companion object {
        const val SAMPLE_RATE = 44_100
        const val CHANNELS = 2
        const val BYTES_PER_FRAME = 4 // 16 бит × 2 канала
        const val BIT_RATE = 192_000
        const val READ_CHUNK = 8192
        const val TIMEOUT_US = 10_000L
        const val MAX_EOS_TRIES = 100
    }
}
