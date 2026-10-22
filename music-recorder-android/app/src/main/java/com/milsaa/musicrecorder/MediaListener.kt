package com.milsaa.musicrecorder

import android.content.ComponentName
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService

/**
 * Слушатель уведомлений. Система выдаёт доступ к активным медиасессиям
 * (MediaSessionManager.getActiveSessions) только приложениям с включённым NotificationListener.
 * Пока он подключён, следим за плеерами и обновляем плашку «Сейчас играет» в шторке.
 */
class MediaListener : NotificationListenerService() {

    private val handler = Handler(Looper.getMainLooper())
    private var controllers: List<MediaController> = emptyList()

    private val controllerCallback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = refresh()
        override fun onPlaybackStateChanged(state: PlaybackState?) = refresh()
        override fun onSessionDestroyed() = refresh()
    }

    private val sessionsListener = MediaSessionManager.OnActiveSessionsChangedListener { list ->
        watch(list.orEmpty())
        refresh()
    }

    override fun onListenerConnected() {
        val manager = getSystemService(MediaSessionManager::class.java)
        val me = ComponentName(this, MediaListener::class.java)
        manager.addOnActiveSessionsChangedListener(sessionsListener, me, handler)
        watch(manager.getActiveSessions(me))
        refresh()
    }

    override fun onListenerDisconnected() {
        getSystemService(MediaSessionManager::class.java).removeOnActiveSessionsChangedListener(sessionsListener)
        watch(emptyList())
        TrayNotification.cancel(this)
    }

    private fun watch(list: List<MediaController>) {
        controllers.forEach { it.unregisterCallback(controllerCallback) }
        controllers = list
        controllers.forEach { it.registerCallback(controllerCallback, handler) }
    }

    // Метаданные часто приходят пачкой — обновляем плашку один раз.
    private fun refresh() {
        handler.removeCallbacks(update)
        handler.postDelayed(update, 300)
    }

    private val update = Runnable { TrayNotification.update(this) }
}
