package com.milsaa.musicrecorder

import android.service.notification.NotificationListenerService

/**
 * Пустой слушатель уведомлений. Система выдаёт доступ к активным медиасессиям
 * (MediaSessionManager.getActiveSessions) только приложениям с включённым NotificationListener.
 */
class MediaListener : NotificationListenerService()
