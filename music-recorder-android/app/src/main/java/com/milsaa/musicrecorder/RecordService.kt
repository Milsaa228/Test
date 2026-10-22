package com.milsaa.musicrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.widget.Toast
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Foreground-сервис записи: держит MediaProjection и AudioCapture, сохраняет результат в Music/MusicRecorder. */
class RecordService : Service() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var projection: MediaProjection? = null
    private var capture: AudioCapture? = null
    private var label = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent)
            ACTION_STOP -> capture?.stop() ?: stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun start(intent: Intent) {
        if (capture != null) return
        // На Android 14+ foreground-сервис с типом mediaProjection должен стартовать до getMediaProjection.
        startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        @Suppress("DEPRECATION")
        val data = intent.getParcelableExtra<Intent>(EXTRA_DATA)
        val manager = getSystemService(MediaProjectionManager::class.java)
        val mp = data?.let { manager.getMediaProjection(resultCode, it) }
        if (mp == null) {
            finish()
            return
        }
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                capture?.stop()
            }
        }, mainHandler)
        projection = mp

        label = NowPlaying.current(this)?.label ?: getString(R.string.default_label)
        val tmp = File(cacheDir, "recording.m4a").apply { delete() }
        try {
            capture = AudioCapture(mp, tmp).also { c ->
                c.start { ok, error -> mainHandler.post { onCaptureFinished(tmp, ok, error) } }
            }
        } catch (e: Exception) {
            toast(getString(R.string.record_failed, e.message ?: e.javaClass.simpleName))
            finish()
            return
        }
        startedAt = System.currentTimeMillis()
        isRecording = true
        notifyStateChanged()
    }

    private fun onCaptureFinished(tmp: File, ok: Boolean, error: Throwable?) {
        when {
            error != null -> toast(getString(R.string.record_failed, error.message ?: error.javaClass.simpleName))
            !ok -> toast(getString(R.string.record_empty))
            else -> runCatching { saveToMusic(tmp) }
                .onSuccess { toast(getString(R.string.saved_to, it)) }
                .onFailure { toast(getString(R.string.record_failed, it.message ?: it.javaClass.simpleName)) }
        }
        tmp.delete()
        finish()
    }

    /** Копирует файл в общую папку Music/MusicRecorder через MediaStore (разрешение на память не нужно). */
    private fun saveToMusic(tmp: File): String {
        val stamp = SimpleDateFormat("yyyy-MM-dd HH-mm-ss", Locale.US).format(Date())
        val safeLabel = label.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]+"), "_").trim().take(100)
        val name = "$safeLabel $stamp.m4a"
        val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, name)
            put(MediaStore.Audio.Media.MIME_TYPE, "audio/mp4")
            put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/MusicRecorder")
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = contentResolver.insert(collection, values) ?: error("MediaStore insert failed")
        try {
            contentResolver.openOutputStream(uri)!!.use { out -> tmp.inputStream().use { it.copyTo(out) } }
            values.clear()
            values.put(MediaStore.Audio.Media.IS_PENDING, 0)
            contentResolver.update(uri, values, null, null)
        } catch (e: Exception) {
            contentResolver.delete(uri, null, null)
            throw e
        }
        return "Music/MusicRecorder/$name"
    }

    private fun finish() {
        capture = null
        projection?.stop()
        projection = null
        isRecording = false
        notifyStateChanged()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW),
        )
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, RecordService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val saveTrack = PendingIntent.getBroadcast(
            this, 2, Intent(this, SaveTrackReceiver::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.notif_recording))
            .setContentIntent(openApp)
            .setOngoing(true)
            .setUsesChronometer(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.stop), stop).build())
            .addAction(Notification.Action.Builder(null, getString(R.string.save_track), saveTrack).build())
            .build()
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()

    private fun notifyStateChanged() {
        // Кнопка «Записать» в плашке нужна только когда запись не идёт.
        TrayNotification.update(this)
        onStateChanged?.invoke()
    }

    companion object {
        const val ACTION_START = "com.milsaa.musicrecorder.START"
        const val ACTION_STOP = "com.milsaa.musicrecorder.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_DATA = "data"
        private const val CHANNEL_ID = "recording"
        private const val NOTIFICATION_ID = 1

        @Volatile var isRecording = false
            private set
        @Volatile var startedAt = 0L
            private set

        /** Вызывается на главном потоке при начале и окончании записи. */
        var onStateChanged: (() -> Unit)? = null

        fun stop(context: Context) {
            context.startService(Intent(context, RecordService::class.java).setAction(ACTION_STOP))
        }
    }
}
