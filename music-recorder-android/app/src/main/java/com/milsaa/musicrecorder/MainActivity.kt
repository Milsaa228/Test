package com.milsaa.musicrecorder

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.format.DateFormat
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.util.Date

class MainActivity : Activity() {

    private lateinit var store: TrackStore
    private lateinit var nowPlaying: TextView
    private lateinit var grantAccess: Button
    private lateinit var record: Button
    private lateinit var timer: TextView
    private lateinit var savedList: LinearLayout
    private lateinit var trayToggle: Switch

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            render()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = TrackStore(this)
        nowPlaying = findViewById(R.id.nowPlaying)
        grantAccess = findViewById(R.id.grantAccess)
        record = findViewById(R.id.record)
        timer = findViewById(R.id.timer)
        savedList = findViewById(R.id.savedList)
        trayToggle = findViewById(R.id.trayToggle)

        grantAccess.setOnClickListener { showAccessDialog() }
        record.setOnClickListener {
            if (RecordService.isRecording) RecordService.stop(this) else requestPermissionsAndRecord()
        }
        findViewById<Button>(R.id.saveTrack).setOnClickListener { saveTrack() }
        findViewById<Button>(R.id.export).setOnClickListener { exportCsv() }
        findViewById<Button>(R.id.clear).setOnClickListener {
            AlertDialog.Builder(this)
                .setMessage(R.string.clear_confirm)
                .setPositiveButton(R.string.clear) { _, _ ->
                    store.clear()
                    renderSaved()
                    TrayNotification.update(this)
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }
        trayToggle.isChecked = TrayNotification.isEnabled(this)
        trayToggle.setOnCheckedChangeListener { _, checked ->
            TrayNotification.setEnabled(this, checked)
            if (checked) requestNotificationPermission()
        }
        renderSaved()
        // Если открыли кнопкой «Записать» из шторки, разрешения спросит запись; иначе — только уведомления.
        if (intent?.action == ACTION_RECORD) handleIntent(intent) else requestNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Кнопка «Записать» в плашке открывает приложение: разрешение на захват звука можно спросить только из Activity. */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action != ACTION_RECORD) return
        setIntent(Intent(this, MainActivity::class.java))
        if (!RecordService.isRecording) requestPermissionsAndRecord()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFICATIONS)
        }
    }

    override fun onResume() {
        super.onResume()
        // Список мог пополниться из шторки, пока приложение было в фоне.
        renderSaved()
        TrayNotification.update(this)
        RecordService.onStateChanged = { render() }
        handler.post(ticker)
    }

    override fun onPause() {
        super.onPause()
        RecordService.onStateChanged = null
        handler.removeCallbacks(ticker)
    }

    private fun render() {
        val access = NowPlaying.hasAccess(this)
        grantAccess.visibility = if (access) View.GONE else View.VISIBLE
        nowPlaying.text = when {
            !access -> getString(R.string.no_access)
            else -> NowPlaying.current(this)?.label ?: getString(R.string.nothing_playing)
        }

        if (RecordService.isRecording) {
            record.setText(R.string.stop)
            val s = (System.currentTimeMillis() - RecordService.startedAt) / 1000
            timer.text = String.format("%02d:%02d", s / 60, s % 60)
            timer.visibility = View.VISIBLE
        } else {
            record.setText(R.string.record)
            timer.visibility = View.GONE
        }
    }

    private fun renderSaved() {
        savedList.removeAllViews()
        val tracks = store.all().asReversed()
        if (tracks.isEmpty()) {
            savedList.addView(TextView(this).apply {
                setText(R.string.empty_list)
                alpha = 0.6f
                setPadding(0, dp(8), 0, dp(8))
            })
            return
        }
        for (t in tracks) {
            val savedAt = DateFormat.getMediumDateFormat(this).format(Date(t.savedAt)) + " " +
                DateFormat.getTimeFormat(this).format(Date(t.savedAt))
            savedList.addView(TextView(this).apply {
                text = buildString {
                    append(t.label)
                    append('\n')
                    append(listOf(t.album, savedAt).filter { it.isNotEmpty() }.joinToString(" · "))
                }
                textSize = 15f
                setPadding(0, dp(8), 0, dp(8))
                // Долгое нажатие — поиск трека в интернете.
                setOnLongClickListener {
                    startActivity(Intent(Intent.ACTION_WEB_SEARCH).putExtra("query", t.label))
                    true
                }
            })
        }
    }

    private fun saveTrack() {
        val result = TrayNotification.saveCurrent(this)
        if (result == TrayNotification.SaveResult.NO_ACCESS) {
            showAccessDialog()
            return
        }
        renderSaved()
        Toast.makeText(this, TrayNotification.messageFor(result), Toast.LENGTH_SHORT).show()
    }

    private fun exportCsv() {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, "saved-tracks.csv")
            .putExtra(Intent.EXTRA_TEXT, store.toCsv())
        startActivity(Intent.createChooser(send, getString(R.string.export_csv)))
    }

    private fun showAccessDialog() {
        AlertDialog.Builder(this)
            .setTitle(R.string.access_title)
            .setMessage(R.string.access_message)
            .setPositiveButton(R.string.open_settings) { _, _ ->
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun requestPermissionsAndRecord() {
        val needed = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isEmpty()) launchProjection() else requestPermissions(needed.toTypedArray(), REQ_PERMISSIONS)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIFICATIONS) {
            TrayNotification.update(this)
            return
        }
        if (requestCode != REQ_PERMISSIONS) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            launchProjection()
        } else {
            Toast.makeText(this, R.string.mic_denied, Toast.LENGTH_LONG).show()
        }
    }

    private fun launchProjection() {
        val manager = getSystemService(MediaProjectionManager::class.java)
        // На Android 14+ просим захват всего устройства, а не одного приложения.
        val intent = if (Build.VERSION.SDK_INT >= 34) {
            manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        } else {
            manager.createScreenCaptureIntent()
        }
        startActivityForResult(intent, REQ_PROJECTION)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_PROJECTION || resultCode != RESULT_OK || data == null) return
        startForegroundService(
            Intent(this, RecordService::class.java)
                .setAction(RecordService.ACTION_START)
                .putExtra(RecordService.EXTRA_RESULT_CODE, resultCode)
                .putExtra(RecordService.EXTRA_DATA, data),
        )
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val ACTION_RECORD = "com.milsaa.musicrecorder.RECORD"
        private const val REQ_PERMISSIONS = 1
        private const val REQ_PROJECTION = 2
        private const val REQ_NOTIFICATIONS = 3
    }
}
