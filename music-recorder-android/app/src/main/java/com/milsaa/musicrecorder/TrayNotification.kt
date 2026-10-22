package com.milsaa.musicrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/** Плашка «Сейчас играет» в шторке с кнопками «Зафиксировать» и «Записать». */
object TrayNotification {
    private const val CHANNEL_ID = "now_playing"
    private const val NOTIFICATION_ID = 2
    private const val PREFS = "settings"
    private const val KEY_ENABLED = "tray_enabled"

    fun isEnabled(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, true)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
        update(context)
    }

    fun update(context: Context) {
        val track = if (isEnabled(context)) NowPlaying.current(context) else null
        if (track == null) {
            cancel(context)
            return
        }
        val nm = context.getSystemService(NotificationManager::class.java)
        if (!nm.areNotificationsEnabled()) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, context.getString(R.string.tray_channel), NotificationManager.IMPORTANCE_LOW)
                .apply { setShowBadge(false) },
        )
        val saved = TrackStore(context).isLast(track)
        val save = PendingIntent.getBroadcast(
            context, 0, Intent(context, SaveTrackReceiver::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val actions = mutableListOf(
            Notification.Action.Builder(null, context.getString(R.string.save_track), save).build(),
        )
        if (!RecordService.isRecording) {
            val record = PendingIntent.getActivity(
                context, 1,
                Intent(context, MainActivity::class.java)
                    .setAction(MainActivity.ACTION_RECORD)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE,
            )
            actions += Notification.Action.Builder(null, context.getString(R.string.record), record).build()
        }
        val notification = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_star)
            .setContentTitle(track.label)
            .setContentText(context.getString(if (saved) R.string.tray_saved else R.string.tray_hint))
            .setSubText(track.album.ifEmpty { null })
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .apply { actions.forEach { addAction(it) } }
            .build()
        nm.notify(NOTIFICATION_ID, notification)
    }

    fun cancel(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    }

    enum class SaveResult { SAVED, ALREADY_SAVED, NOTHING_PLAYING, NO_ACCESS }

    /** Общая логика «Зафиксировать трек» для приложения, шторки и плитки быстрых настроек. */
    fun saveCurrent(context: Context): SaveResult {
        if (!NowPlaying.hasAccess(context)) return SaveResult.NO_ACCESS
        val track = NowPlaying.current(context) ?: return SaveResult.NOTHING_PLAYING
        val store = TrackStore(context)
        if (store.isLast(track)) return SaveResult.ALREADY_SAVED
        store.add(track)
        update(context)
        return SaveResult.SAVED
    }

    fun messageFor(result: SaveResult) = when (result) {
        SaveResult.SAVED -> R.string.track_saved
        SaveResult.ALREADY_SAVED -> R.string.already_saved
        SaveResult.NOTHING_PLAYING -> R.string.nothing_playing
        SaveResult.NO_ACCESS -> R.string.no_access
    }
}

/** Кнопка «Зафиксировать» в плашке. */
class SaveTrackReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val result = TrayNotification.saveCurrent(context)
        Toast.makeText(context, TrayNotification.messageFor(result), Toast.LENGTH_SHORT).show()
    }
}
