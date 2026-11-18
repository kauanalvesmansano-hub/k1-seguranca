package expo.modules.k1panico

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * K1 Segurança — CELULAR DA CENTRAL.
 * Fica ligado (serviço em primeiro plano) perguntando ao servidor a cada 8 s se chegou alerta.
 * Pânico, coação e homem caído: o celular TOCA COMO LIGAÇÃO, em tela cheia, mesmo bloqueado.
 * Os outros alertas viram uma notificação comum com som.
 * Não usa nenhum serviço pago (nem Firebase): só o próprio servidor do K1.
 */
class CentralService : Service() {

  companion object {
    const val TAG = "K1Central"
    const val PREFS = "k1_central"
    const val CANAL_FIXO = "k1_central_fixo"
    const val CANAL_CHAMADA = "k1_central_chamada_v1"
    const val CANAL_AVISO = "k1_central_aviso_v1"
    const val NOTIF_FIXA = 7101
    const val ACAO_ATENDER = "expo.modules.k1panico.CENTRAL_ATENDER"
    const val ACAO_SILENCIAR = "expo.modules.k1panico.CENTRAL_SILENCIAR"
    const val INTERVALO_MS = 8_000L
    const val TOQUE_MAX_MS = 180_000L

    @Volatile var rodando = false
    @Volatile var instancia: CentralService? = null

    val CRITICOS = setOf("panico", "coacao", "sem_movimento", "atraso_chegada")

    fun titulo(tipo: String): String = when (tipo) {
      "panico" -> "PÂNICO — ASSALTO"
      "coacao" -> "COAÇÃO — VIGILANTE RENDIDO"
      "sem_movimento" -> "HOMEM CAÍDO"
      "senha_errada" -> "SENHA ERRADA"
      "sem_resposta" -> "VIGILANTE SEM RESPOSTA"
      "fora_do_posto" -> "FORA DO POSTO"
      "bateria_baixa" -> "BATERIA BAIXA"
      "atraso_chegada" -> "NÃO CHEGOU NO HORÁRIO"
      "teste" -> "TESTE DE ALARME"
      else -> tipo.uppercase()
    }

    fun notifId(id: String) = 8000 + (id.hashCode() and 0xFFFF)
  }

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var executor: ExecutorService
  private var player: MediaPlayer? = null
  private var volumeAntes: Int? = null
  private var wake: PowerManager.WakeLock? = null
  private var falhas = 0
  private val vistos = LinkedHashSet<String>()
  private var primeira = true

  private val prefs: SharedPreferences get() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private val ciclo = object : Runnable {
    override fun run() {
      try { executor.execute { consultar() } } catch (_: Exception) {}
      handler.postDelayed(this, INTERVALO_MS)
    }
  }
  private val pararToque = Runnable { silenciar() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    executor = Executors.newSingleThreadExecutor()
    rodando = true
    instancia = this
    // Sem cursor salvo = acabou de ativar: o que já existia não toca
    primeira = prefs.getString("desde", null) == null
    criarCanais()
    iniciarPrimeiroPlano("Aguardando alertas dos vigilantes")
    handler.post(ciclo)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACAO_ATENDER -> {
        val id = intent.getStringExtra("id")
        silenciar()
        if (id != null) {
          (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(notifId(id))
          if (!id.startsWith("teste")) {
            val token = prefs.getString("token", null)
            if (token != null) executor.execute {
              rpc("central_atender", JSONObject().put("p_token", token).put("p_alerta_id", id))
            }
          }
        }
      }
      ACAO_SILENCIAR -> silenciar()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    silenciar()
    try { executor.shutdownNow() } catch (_: Exception) {}
    rodando = false
    instancia = null
    super.onDestroy()
  }

  // ---------- Consulta ao servidor ----------
  private fun consultar() {
    val token = prefs.getString("token", null)
    if (token == null) { handler.post { stopSelf() }; return }
    val corpo = JSONObject().put("p_token", token)
    prefs.getString("desde", null)?.let { corpo.put("p_desde", it) }
    val (codigo, texto) = rpc("central_alertas", corpo)

    if (codigo == 401 || codigo == 403) {
      if (texto.contains("central_nao_autorizada")) {
        prefs.edit().remove("token").remove("desde").apply()
        handler.post { stopSelf() }
      } else {
        atualizarFixa("Acesso da empresa bloqueado — verifique o plano")
      }
      return
    }
    if (codigo !in 200..299) {
      falhas++
      if (falhas == 3) atualizarFixa("Sem internet — tentando reconectar…")
      return
    }
    if (falhas >= 3) atualizarFixa("Aguardando alertas dos vigilantes")
    falhas = 0

    try {
      val j = JSONObject(texto)
      prefs.edit().putString("desde", j.getString("agora")).apply()
      val lista = j.getJSONArray("alertas")
      for (i in 0 until lista.length()) {
        val a = lista.getJSONObject(i)
        val id = a.getString("id")
        if (!vistos.add(id)) continue
        while (vistos.size > 300) vistos.remove(vistos.first())
        if (primeira || a.optString("status") == "resolvido") continue
        handler.post { avisar(a) }
      }
      primeira = false
    } catch (e: Exception) {
      Log.w(TAG, "Resposta inválida: ${e.message}")
    }
  }

  private fun rpc(funcao: String, corpo: JSONObject): Pair<Int, String> {
    val url = prefs.getString("url", null) ?: return 0 to ""
    val chave = prefs.getString("anon", null) ?: return 0 to ""
    return try {
      val con = (URL("${url.trimEnd('/')}/rest/v1/rpc/$funcao").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 7_000
        readTimeout = 10_000
        doOutput = true
        setRequestProperty("apikey", chave)
        setRequestProperty("Authorization", "Bearer $chave")
        setRequestProperty("Content-Type", "application/json")
      }
      con.outputStream.use { it.write(corpo.toString().toByteArray(Charsets.UTF_8)) }
      val c = con.responseCode
      val s = (if (c in 200..299) con.inputStream else con.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
      con.disconnect()
      c to s
    } catch (e: Exception) {
      Log.w(TAG, "Sem conexão: ${e.message}")
      0 to ""
    }
  }

  // ---------- Alarme ----------
  fun testar() {
    val a = JSONObject()
      .put("id", "teste-${System.currentTimeMillis()}")
      .put("tipo", "teste")
      .put("vigilante", "Vigilante de teste")
      .put("posto", "Teste do alarme da central")
      .put("criado_em", "")
    handler.post { avisar(a, forcarChamada = true) }
  }

  private fun avisar(a: JSONObject, forcarChamada: Boolean = false) {
    val id = a.getString("id")
    val tipo = a.optString("tipo")
    val nome = a.optString("vigilante")
    val posto = a.optString("posto")
    val critico = forcarChamada || tipo in CRITICOS
    val texto = listOf(nome, posto).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "Vigilante" }

    val tela = Intent(this, ChamadaActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra("id", id)
      putExtra("tipo", tipo)
      putExtra("nome", nome)
      putExtra("posto", posto)
      putExtra("lat", if (a.isNull("lat")) Double.NaN else a.optDouble("lat", Double.NaN))
      putExtra("lng", if (a.isNull("lng")) Double.NaN else a.optDouble("lng", Double.NaN))
      putExtra("bateria", if (a.isNull("bateria")) -1 else a.optInt("bateria", -1))
      putExtra("hora", a.optString("criado_em"))
    }
    val fl = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val piTela = PendingIntent.getActivity(this, notifId(id), tela, fl)
    val piAtender = PendingIntent.getService(this, notifId(id) + 1,
      Intent(this, CentralService::class.java).setAction(ACAO_ATENDER).putExtra("id", id), fl)

    val b = NotificationCompat.Builder(this, if (critico) CANAL_CHAMADA else CANAL_AVISO)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("⚠ ${titulo(tipo)}")
      .setContentText(texto)
      .setColor(0xFFDC2626.toInt())
      .setContentIntent(piTela)
      .setAutoCancel(true)
      .addAction(0, "ATENDER", piAtender)
      .setPriority(if (critico) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
      .setCategory(if (critico) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    if (critico) {
      b.setFullScreenIntent(piTela, true).setOngoing(true)
      tocar()
    }
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(notifId(id), b.build())
    } catch (e: Exception) {
      Log.w(TAG, "Sem permissão de notificação: ${e.message}")
    }
  }

  private fun tocar() {
    handler.removeCallbacks(pararToque)
    handler.postDelayed(pararToque, TOQUE_MAX_MS)
    if (player != null) return
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      volumeAntes = am.getStreamVolume(AudioManager.STREAM_ALARM)
      am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
    } catch (_: Exception) { volumeAntes = null }

    val candidatos = mutableListOf<Uri?>()
    try { candidatos.add(RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)) } catch (_: Exception) {}
    candidatos.add(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
    candidatos.add(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
    for (uri in candidatos.filterNotNull()) {
      try {
        val mp = MediaPlayer()
        mp.setAudioAttributes(AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build())
        mp.setDataSource(this, uri)
        mp.isLooping = true
        mp.prepare()
        mp.start()
        player = mp
        break
      } catch (e: Exception) {
        Log.w(TAG, "Toque falhou ($uri): ${e.message}")
      }
    }
    try {
      val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      val padrao = longArrayOf(0, 1000, 700)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(padrao, 0))
      else @Suppress("DEPRECATION") v.vibrate(padrao, 0)
    } catch (_: Exception) {}
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "K1:CentralToque").apply { acquire(TOQUE_MAX_MS + 5_000) }
    } catch (_: Exception) {}
  }

  fun silenciar() {
    handler.removeCallbacks(pararToque)
    try { player?.stop() } catch (_: Exception) {}
    try { player?.release() } catch (_: Exception) {}
    player = null
    try { (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel() } catch (_: Exception) {}
    volumeAntes?.let {
      try { (getSystemService(Context.AUDIO_SERVICE) as AudioManager).setStreamVolume(AudioManager.STREAM_ALARM, it, 0) } catch (_: Exception) {}
    }
    volumeAntes = null
    try { if (wake?.isHeld == true) wake?.release() } catch (_: Exception) {}
    wake = null
  }

  // ---------- Notificações ----------
  private fun criarCanais() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(NotificationChannel(CANAL_FIXO, "Central K1 ativa", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Mostra que este celular está recebendo os alertas"
      setShowBadge(false)
    })
    nm.createNotificationChannel(NotificationChannel(CANAL_CHAMADA, "Chamada de emergência", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Pânico, coação e homem caído: toca como ligação"
      setSound(null, null) // o som é tocado pelo próprio serviço, em volume de alarme
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    })
    nm.createNotificationChannel(NotificationChannel(CANAL_AVISO, "Avisos dos vigilantes", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Senha errada, sem resposta, fora do posto, bateria baixa"
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    })
  }

  private fun notifFixa(texto: String): Notification {
    val abrir = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return NotificationCompat.Builder(this, CANAL_FIXO)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Central K1 Segurança")
      .setContentText(texto)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(abrir)
      .build()
  }

  private fun atualizarFixa(texto: String) {
    try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_FIXA, notifFixa(texto)) } catch (_: Exception) {}
  }

  private fun iniciarPrimeiroPlano(texto: String) {
    val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, NOTIF_FIXA, notifFixa(texto), tipo)
  }
}
