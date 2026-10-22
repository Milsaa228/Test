package com.milsaa.musicrecorder

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

/** Плитка в быстрых настройках шторки: одно нажатие сохраняет играющий трек. */
class SaveTrackTile : TileService() {

    override fun onStartListening() = render()

    override fun onClick() {
        val result = TrayNotification.saveCurrent(this)
        Toast.makeText(this, TrayNotification.messageFor(result), Toast.LENGTH_SHORT).show()
        render()
    }

    private fun render() {
        val tile = qsTile ?: return
        val track = NowPlaying.current(this)
        tile.state = if (track != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = getString(R.string.tile_label)
        tile.subtitle = when {
            !NowPlaying.hasAccess(this) -> getString(R.string.no_access)
            track == null -> getString(R.string.nothing_playing)
            TrackStore(this).isLast(track) -> getString(R.string.already_saved)
            else -> track.label
        }
        tile.updateTile()
    }
}
