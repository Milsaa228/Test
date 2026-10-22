package com.milsaa.musicrecorder

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

data class Track(
    val title: String,
    val artist: String,
    val album: String,
    val app: String,
    val savedAt: Long,
) {
    val label: String get() = if (artist.isNotEmpty()) "$artist — $title" else title

    fun toJson(): JSONObject = JSONObject()
        .put("title", title)
        .put("artist", artist)
        .put("album", album)
        .put("app", app)
        .put("savedAt", savedAt)

    companion object {
        fun fromJson(o: JSONObject) = Track(
            title = o.optString("title"),
            artist = o.optString("artist"),
            album = o.optString("album"),
            app = o.optString("app"),
            savedAt = o.optLong("savedAt"),
        )
    }
}

/** Что сейчас играет — по данным медиасессий любых плееров на телефоне. */
object NowPlaying {
    fun hasAccess(context: Context): Boolean {
        val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            ?: return false
        val me = ComponentName(context, MediaListener::class.java).flattenToString()
        return enabled.split(':').any { it == me }
    }

    fun current(context: Context): Track? {
        if (!hasAccess(context)) return null
        val manager = context.getSystemService(MediaSessionManager::class.java) ?: return null
        val controllers = try {
            manager.getActiveSessions(ComponentName(context, MediaListener::class.java))
        } catch (e: SecurityException) {
            return null
        }
        val controller = controllers.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
            ?: controllers.firstOrNull()
            ?: return null
        val meta = controller.metadata ?: return null
        val title = meta.getString(MediaMetadata.METADATA_KEY_TITLE)
            ?: meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
            ?: return null
        val artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: ""
        return Track(
            title = title,
            artist = artist,
            album = meta.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: "",
            app = controller.packageName,
            savedAt = System.currentTimeMillis(),
        )
    }
}

/** Список зафиксированных треков в SharedPreferences. */
class TrackStore(context: Context) {
    private val prefs = context.getSharedPreferences("tracks", Context.MODE_PRIVATE)

    fun all(): List<Track> {
        val array = JSONArray(prefs.getString(KEY, "[]"))
        return (0 until array.length()).map { Track.fromJson(array.getJSONObject(it)) }
    }

    fun add(track: Track) {
        val array = JSONArray(prefs.getString(KEY, "[]")).put(track.toJson())
        prefs.edit().putString(KEY, array.toString()).apply()
    }

    /** Тот же трек уже сохранён последним — чтобы повторные нажатия в шторке не плодили дубли. */
    fun isLast(track: Track): Boolean {
        val last = all().lastOrNull() ?: return false
        return last.title == track.title && last.artist == track.artist && last.app == track.app
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    fun toCsv(): String {
        fun esc(v: String) = "\"" + v.replace("\"", "\"\"") + "\""
        val header = "artist,title,album,app,savedAt"
        val rows = all().map { t ->
            listOf(t.artist, t.title, t.album, t.app, java.time.Instant.ofEpochMilli(t.savedAt).toString())
                .joinToString(",") { esc(it) }
        }
        return (listOf(header) + rows).joinToString("\n")
    }

    private companion object {
        const val KEY = "items"
    }
}
