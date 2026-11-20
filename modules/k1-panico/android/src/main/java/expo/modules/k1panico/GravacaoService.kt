package expo.modules.k1panico

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Base64
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingDeque

/**
 * K1 Família — SOS com câmera e áudio.
 *
 * Começa SÓ quando a própria pessoa aperta o Power 4 vezes (nunca remotamente).
 * Grava trechos curtos (~6 s) com a câmera traseira + microfone e manda cada
 * trecho para o servidor (vig_sos_segmento). A central/família assiste os
 * trechos em sequência, quase ao vivo. Para quando:
 *  - a central ou alguém da família toca em "Encerrar" (servidor responde continuar=false);
 *  - o alerta é resolvido; ou passam [MAX_MS].
 * Sem permissão de câmera, grava só o áudio. Sem internet, guarda os trechos e
 * manda quando a conexão voltar (até [MAX_PENDENTES]).
 */
class GravacaoService : LifecycleService() {

  companion object {
    private const val TAG = "K1Sos"
    private const val CANAL = "k1_sos"
    private const val NOTIF_ID = 4420
    private const val TRECHO_MS = 6_000L
    private const val MAX_MS = 2 * 60 * 60_000L // grava até a central encerrar (limite de segurança: 2 h)
    private const val MAX_PENDENTES = 25
    @Volatile var gravando = false
      private set

    fun iniciar(ctx: Context): Boolean = try {
      ContextCompat.startForegroundService(ctx, Intent(ctx, GravacaoService::class.java))
      true
    } catch (e: Exception) {
      Log.w(TAG, "Não deu para iniciar direto: ${e.message}")
      false
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val envio = Executors.newSingleThreadExecutor()
  private val pendentes = LinkedBlockingDeque<Pair<File, Triple<Int, String, Double>>>()
  private var seq = 0
  private var inicio = 0L
  private var parando = false
  private var wake: PowerManager.WakeLock? = null

  private var cameraProvider: ProcessCameraProvider? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var gravacaoAtual: Recording? = null
  private var gravadorAudio: MediaRecorder? = null
  private var arquivoAudio: File? = null
  private var inicioTrecho = 0L

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    if (gravando) return START_NOT_STICKY
    val temCamera = permitido(Manifest.permission.CAMERA)
    val temMic = permitido(Manifest.permission.RECORD_AUDIO)
    if (!temCamera && !temMic) { stopSelf(); return START_NOT_STICKY }
    try {
      var tipo = 0
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        if (temCamera) tipo = tipo or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        if (temMic) tipo = tipo or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
      ServiceCompat.startForeground(this, NOTIF_ID, notificacao(), tipo)
    } catch (e: Exception) {
      // Android não deixou ligar câmera/microfone com o app em segundo plano
      Log.w(TAG, "startForeground recusado: ${e.message}")
      stopSelf()
      return START_NOT_STICKY
    }
    gravando = true
    inicio = System.currentTimeMillis()
    wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "k1:sos").apply { acquire(MAX_MS + 60_000L) }
    if (temCamera) iniciarCamera(temMic) else proximoTrechoAudio()
    handler.postDelayed({ parar("tempo máximo") }, MAX_MS)
    return START_NOT_STICKY
  }

  private fun permitido(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

  // ---------- Câmera (vídeo + áudio) ----------
  private fun iniciarCamera(comAudio: Boolean) {
    val futuro = ProcessCameraProvider.getInstance(this)
    futuro.addListener({
      try {
        val provider = futuro.get()
        cameraProvider = provider
        val recorder = Recorder.Builder()
          .setQualitySelector(QualitySelector.from(Quality.SD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
          .setTargetVideoEncodingBitRate(700_000)
          .build()
        val vc = VideoCapture.withOutput(recorder)
        provider.unbindAll()
        provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, vc)
        videoCapture = vc
        proximoTrechoVideo(comAudio)
      } catch (e: Exception) {
        Log.e(TAG, "Câmera falhou, seguindo só com áudio", e)
        if (permitido(Manifest.permission.RECORD_AUDIO)) proximoTrechoAudio() else parar("sem câmera")
      }
    }, ContextCompat.getMainExecutor(this))
  }

  @SuppressLint("MissingPermission")
  private fun proximoTrechoVideo(comAudio: Boolean) {
    if (parando) return
    val vc = videoCapture ?: return
    val arq = File(cacheDir, "sos_${seq}.mp4")
    val meuSeq = seq++
    inicioTrecho = System.currentTimeMillis()
    var pend = vc.output.prepareRecording(this, FileOutputOptions.Builder(arq).build())
    if (comAudio) pend = pend.withAudioEnabled()
    gravacaoAtual = pend.start(ContextCompat.getMainExecutor(this)) { ev ->
      if (ev is VideoRecordEvent.Finalize) {
        val dur = (System.currentTimeMillis() - inicioTrecho) / 1000.0
        if (!ev.hasError() || ev.error == VideoRecordEvent.Finalize.ERROR_NONE || arq.length() > 0) {
          enfileirar(arq, meuSeq, "video", dur)
        }
        if (!parando) proximoTrechoVideo(comAudio)
      }
    }
    handler.postDelayed({ gravacaoAtual?.stop() }, TRECHO_MS)
  }

  // ---------- Só áudio (sem permissão de câmera) ----------
  private fun proximoTrechoAudio() {
    if (parando) return
    val arq = File(cacheDir, "sos_${seq}.m4a")
    val meuSeq = seq++
    try {
      val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
      mr.setAudioSource(MediaRecorder.AudioSource.MIC)
      mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      mr.setAudioEncodingBitRate(48_000)
      mr.setAudioSamplingRate(22_050)
      mr.setOutputFile(arq.absolutePath)
      mr.prepare()
      mr.start()
      gravadorAudio = mr
      arquivoAudio = arq
      inicioTrecho = System.currentTimeMillis()
      handler.postDelayed({
        try { mr.stop() } catch (_: Exception) {}
        mr.release()
        gravadorAudio = null
        enfileirar(arq, meuSeq, "audio", (System.currentTimeMillis() - inicioTrecho) / 1000.0)
        proximoTrechoAudio()
      }, TRECHO_MS)
    } catch (e: Exception) {
      Log.e(TAG, "Microfone falhou", e)
      parar("sem microfone")
    }
  }

  // ---------- Envio ----------
  private fun enfileirar(arq: File, n: Int, tipo: String, dur: Double) {
    if (arq.length() <= 0) { arq.delete(); return }
    while (pendentes.size >= MAX_PENDENTES) pendentes.pollFirst()?.first?.delete()
    pendentes.addLast(arq to Triple(n, tipo, dur))
    envio.execute { enviarPendentes() }
  }

  private fun enviarPendentes() {
    while (true) {
      val item = pendentes.peekFirst() ?: return
      val (arq, info) = item
      val (n, tipo, dur) = info
      val resp = try {
        if (arq.length() > 1_400_000) null else rpc("vig_sos_segmento", JSONObject().apply {
          put("p_token", token() ?: return)
          put("p_seq", n)
          put("p_tipo", tipo)
          put("p_mime", if (tipo == "audio") "audio/mp4" else "video/mp4")
          put("p_duracao", dur)
          put("p_dados", Base64.encodeToString(arq.readBytes(), Base64.NO_WRAP))
        })
      } catch (e: Exception) { Log.w(TAG, "Envio falhou: ${e.message}"); return }
      if (arq.length() > 1_400_000) { pendentes.pollFirst(); arq.delete(); continue } // grande demais: descarta
      if (resp == null) return // sem internet: tenta no próximo trecho
      if (resp.optBoolean("aguardando")) return // o alerta ainda não chegou: guarda e tenta de novo
      pendentes.pollFirst()
      arq.delete()
      if (!resp.optBoolean("continuar", true)) {
        handler.post { parar(resp.optString("motivo", "encerrado")) }
        return
      }
    }
  }

  private fun token(): String? = getSharedPreferences(PanicoService.PREFS, Context.MODE_PRIVATE).getString("token", null)

  private fun rpc(funcao: String, corpo: JSONObject): JSONObject? {
    val p = getSharedPreferences(PanicoService.PREFS, Context.MODE_PRIVATE)
    val url = p.getString("url", null) ?: return null
    val chave = p.getString("anon", null) ?: return null
    val con = (URL("${url.trimEnd('/')}/rest/v1/rpc/$funcao").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 10_000
      readTimeout = 30_000
      doOutput = true
      setRequestProperty("apikey", chave)
      setRequestProperty("Authorization", "Bearer $chave")
      setRequestProperty("Content-Type", "application/json")
    }
    return try {
      con.outputStream.use { it.write(corpo.toString().toByteArray(Charsets.UTF_8)) }
      if (con.responseCode !in 200..299) {
        Log.w(TAG, "RPC $funcao: HTTP ${con.responseCode}")
        // erro do servidor (não de rede): não adianta tentar de novo esse trecho
        JSONObject().put("continuar", con.responseCode != 401 && con.responseCode != 403)
      } else JSONObject(con.inputStream.bufferedReader().readText().ifBlank { "{}" })
    } catch (e: Exception) {
      Log.w(TAG, "Sem conexão: ${e.message}"); null
    } finally { con.disconnect() }
  }

  // ---------- Parar ----------
  private fun parar(motivo: String) {
    if (parando) return
    parando = true
    Log.i(TAG, "SOS encerrado: $motivo")
    handler.removeCallbacksAndMessages(null)
    try { gravacaoAtual?.stop() } catch (_: Exception) {}
    try { gravadorAudio?.stop(); gravadorAudio?.release() } catch (_: Exception) {}
    try { cameraProvider?.unbindAll() } catch (_: Exception) {}
    // última tentativa de mandar o que ficou
    envio.execute {
      try { enviarPendentes() } catch (_: Exception) {}
      pendentes.forEach { it.first.delete() }
      pendentes.clear()
    }
    envio.shutdown()
    gravando = false
    wake?.let { if (it.isHeld) it.release() }
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    if (!parando) parar("serviço destruído")
    super.onDestroy()
  }

  private fun notificacao(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(NotificationChannel(CANAL, "SOS gravando", NotificationManager.IMPORTANCE_LOW))
    }
    val abrir = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    // Discreta de propósito: quem está por perto não deve perceber
    return NotificationCompat.Builder(this, CANAL)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("K1 Família")
      .setContentText("Sua família está acompanhando")
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(abrir)
      .build()
  }
}
