package expo.modules.k1panico

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Serviço em primeiro plano que fica ativo durante o turno do vigilante.
 *
 * Cada toque no botão Power liga ou desliga a tela. O serviço conta esses
 * eventos: 4 eventos em até [JANELA_MS] = pânico. O alerta é enviado direto
 * daqui (Kotlin), sem depender do app aberto, para a função vig_panico do
 * Supabase. O servidor então manda WhatsApp e faz a ligação para o monitoramento.
 *
 * Localização em tempo real: quando o vigilante se move, a posição é enviada a
 * cada [MIN_ENTRE_ENVIOS_MS] (se andou pelo menos [MIN_DISTANCIA_M]); parado,
 * manda um "sinal de vida" a cada [INTERVALO_TELEMETRIA_MS] com bateria e Wi-Fi.
 *
 * Homem caído (opcional, definido pela empresa): se o celular ficar parado além
 * do limite, ele vibra e avisa "Você está bem?" por 30 s; sem resposta (sem
 * mexer o celular), a empresa recebe o alerta "sem movimento".
 *
 * Pânico sem internet: o alerta é guardado no celular (fila) com a hora real do
 * aperto e enviado sozinho assim que a internet voltar. Nada aparece na tela.
 */
class PanicoService : Service() {

  companion object {
    private const val TAG = "K1Panico"
    const val PREFS = "k1_panico"
    private const val CANAL = "k1_turno"
    private const val NOTIF_ID = 4410
    private const val TOQUES = 4
    private const val JANELA_MS = 4000L
    private const val INTERVALO_ENTRE_PANICOS_MS = 30_000L
    private const val INTERVALO_TELEMETRIA_MS = 120_000L
    private const val MIN_ENTRE_ENVIOS_MS = 5_000L
    private const val MIN_DISTANCIA_M = 6f
    private const val FILA = "fila_panico"
    private const val CANAL_ALERTA = "k1_alerta"
    private const val NOTIF_HOMEM_CAIDO = 4411
    private const val LIMIAR_MOVIMENTO = 1.2f      // m/s² de variação em relação à gravidade
    private const val TEMPO_RESPOSTA_MS = 30_000L

    @Volatile var rodando = false
  }

  private val eventos = ArrayDeque<Long>()
  private var ultimoPanico = 0L
  private val handler = Handler(Looper.getMainLooper())
  @Volatile private var localAtual: Location? = null
  @Volatile private var ultimoEnvioLocal: Location? = null
  @Volatile private var ultimoEnvioEm = 0L
  private val enviandoTelemetria = AtomicBoolean(false)
  private val filaExecutor = Executors.newSingleThreadExecutor()
  private var ouvinteRede: ConnectivityManager.NetworkCallback? = null
  @Volatile private var ultimoMovimento = SystemClock.elapsedRealtime()
  @Volatile private var preAlarmeDesde = 0L

  private val ouvinteMovimento = object : SensorEventListener {
    override fun onSensorChanged(e: SensorEvent) {
      val (x, y, z) = Triple(e.values[0], e.values[1], e.values[2])
      val modulo = Math.sqrt((x * x + y * y + z * z).toDouble()).toFloat()
      if (Math.abs(modulo - SensorManager.GRAVITY_EARTH) > LIMIAR_MOVIMENTO) {
        ultimoMovimento = SystemClock.elapsedRealtime()
        if (preAlarmeDesde > 0) cancelarPreAlarme()
      }
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
  }

  private val verificaHomemCaido = object : Runnable {
    override fun run() {
      verificarHomemCaido()
      handler.postDelayed(this, 15_000L)
    }
  }

  private val ouvinteLocal = LocationListener { loc ->
    val atual = localAtual
    if (atual == null || loc.time >= atual.time) localAtual = loc
    // Tempo real: andou o suficiente e já passou o intervalo mínimo -> envia agora
    val ult = ultimoEnvioLocal
    val andou = ult == null || ult.distanceTo(loc) >= MIN_DISTANCIA_M
    if (andou && SystemClock.elapsedRealtime() - ultimoEnvioEm >= MIN_ENTRE_ENVIOS_MS) enviarTelemetria()
  }

  private val reenvioFila = object : Runnable {
    override fun run() {
      if (temPanicoNaFila()) {
        enviarFilaPanico()
        handler.postDelayed(this, 20_000L)
      }
    }
  }

  private val cicloTelemetria = object : Runnable {
    override fun run() {
      enviarTelemetria()
      handler.postDelayed(this, INTERVALO_TELEMETRIA_MS)
    }
  }

  private val receptor = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_OFF || intent.action == Intent.ACTION_SCREEN_ON) {
        registrarToque()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    criarCanal()
    iniciarPrimeiroPlano()
    val filtro = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
    }
    // Eventos de tela só podem ser recebidos com registro dinâmico
    ContextCompat.registerReceiver(this, receptor, filtro, ContextCompat.RECEIVER_NOT_EXPORTED)
    rodando = true
    iniciarLocalizacao()
    observarInternet()
    iniciarSensorMovimento()
    handler.postDelayed(cicloTelemetria, 5_000L)
    handler.postDelayed(verificaHomemCaido, 15_000L)
    if (temPanicoNaFila()) handler.post(reenvioFila)
    Log.i(TAG, "Monitoramento do botão Power ativo")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

  override fun onDestroy() {
    try { unregisterReceiver(receptor) } catch (_: Exception) {}
    handler.removeCallbacks(cicloTelemetria)
    handler.removeCallbacks(reenvioFila)
    handler.removeCallbacks(verificaHomemCaido)
    try { (getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(ouvinteMovimento) } catch (_: Exception) {}
    cancelarPreAlarme()
    ouvinteRede?.let { try { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) } catch (_: Exception) {} }
    try { (getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(ouvinteLocal) } catch (_: Exception) {}
    rodando = false
    super.onDestroy()
  }

  // ---------- Contagem dos toques ----------
  @Synchronized
  private fun registrarToque() {
    val agora = SystemClock.elapsedRealtime()
    eventos.addLast(agora)
    while (eventos.isNotEmpty() && agora - eventos.first() > JANELA_MS) eventos.removeFirst()
    if (eventos.size >= TOQUES && agora - ultimoPanico > INTERVALO_ENTRE_PANICOS_MS) {
      eventos.clear()
      ultimoPanico = agora
      dispararPanico()
    }
  }

  private fun dispararPanico() {
    Log.w(TAG, "PÂNICO acionado pelo botão Power")
    vibrarDiscreto()
    val loc = melhorLocalizacao()
    val item = JSONObject().apply {
      put("lat", loc?.latitude ?: JSONObject.NULL)
      put("lng", loc?.longitude ?: JSONObject.NULL)
      put("bateria", nivelBateria() ?: JSONObject.NULL)
      put("quando", isoAgora())
    }
    // 1) guarda no celular (não se perde sem internet nem se o app fechar)
    synchronized(this) {
      val p = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val fila = JSONArray(p.getString(FILA, "[]"))
      fila.put(item)
      p.edit().putString(FILA, fila.toString()).commit()
    }
    // 2) tenta mandar já; se não tiver internet, tenta de novo a cada 20 s e quando a conexão voltar
    enviarFilaPanico()
    handler.removeCallbacks(reenvioFila)
    handler.postDelayed(reenvioFila, 20_000L)
  }

  private fun temPanicoNaFila(): Boolean =
    JSONArray(getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(FILA, "[]")).length() > 0

  /** Envia todos os pânicos guardados, na ordem; o que der certo sai da fila. */
  private fun enviarFilaPanico() {
    filaExecutor.execute {
      val wake = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "k1:panico")
      wake.acquire(60_000L)
      try {
        val p = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val token = p.getString("token", null) ?: return@execute
        while (true) {
          val item = synchronized(this) { JSONArray(p.getString(FILA, "[]")).optJSONObject(0) } ?: break
          val ok = chamarRpc("vig_panico", JSONObject().apply {
            put("p_token", token)
            put("p_lat", item.opt("lat") ?: JSONObject.NULL)
            put("p_lng", item.opt("lng") ?: JSONObject.NULL)
            put("p_bateria", item.opt("bateria") ?: JSONObject.NULL)
            put("p_ocorrido_em", item.optString("quando"))
          })
          if (!ok) break // sem internet: fica na fila
          synchronized(this) {
            val fila = JSONArray(p.getString(FILA, "[]"))
            val resto = JSONArray()
            for (i in 1 until fila.length()) resto.put(fila.get(i))
            p.edit().putString(FILA, resto.toString()).commit()
          }
          Log.i(TAG, "Pânico enviado")
        }
      } catch (e: Exception) {
        Log.e(TAG, "Falha no pânico", e)
      } finally {
        if (wake.isHeld) wake.release()
      }
    }
  }

  /** Quando a internet volta, manda o que estiver na fila. */
  private fun observarInternet() {
    try {
      val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val cb = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          if (temPanicoNaFila()) enviarFilaPanico()
          enviarTelemetria()
        }
      }
      cm.registerDefaultNetworkCallback(cb)
      ouvinteRede = cb
    } catch (e: Exception) { Log.w(TAG, "Sem aviso de rede: ${e.message}") }
  }

  private fun isoAgora(): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())

  // ---------- Homem caído / sem movimento ----------
  private fun minutosHomemCaido(): Int = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("homem_caido_min", 0)

  private fun iniciarSensorMovimento() {
    try {
      val sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
      sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sm.registerListener(ouvinteMovimento, it, SensorManager.SENSOR_DELAY_NORMAL) }
    } catch (e: Exception) { Log.w(TAG, "Sem acelerômetro: ${e.message}") }
  }

  private fun verificarHomemCaido() {
    val minutos = minutosHomemCaido()
    if (minutos <= 0) return
    val agora = SystemClock.elapsedRealtime()
    if (preAlarmeDesde == 0L) {
      if (agora - ultimoMovimento >= minutos * 60_000L) iniciarPreAlarme()
    } else if (agora - preAlarmeDesde >= TEMPO_RESPOSTA_MS) {
      // Não respondeu: avisa a empresa e recomeça a contagem
      cancelarPreAlarme()
      ultimoMovimento = agora
      val token = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null) ?: return
      val loc = melhorLocalizacao()
      thread(name = "k1-sem-movimento") {
        val corpo = JSONObject().apply {
          put("p_token", token)
          put("p_lat", loc?.latitude ?: JSONObject.NULL)
          put("p_lng", loc?.longitude ?: JSONObject.NULL)
          put("p_minutos", minutos)
        }
        for (espera in longArrayOf(0, 5_000, 15_000, 30_000, 60_000)) {
          if (espera > 0) Thread.sleep(espera)
          if (chamarRpc("vig_sem_movimento", corpo)) break
        }
      }
    }
  }

  private fun iniciarPreAlarme() {
    preAlarmeDesde = SystemClock.elapsedRealtime()
    Log.w(TAG, "Sem movimento: pré-alarme")
    try {
      val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      val padrao = longArrayOf(0, 800, 400, 800, 400, 800, 400, 800)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(padrao, -1))
      else @Suppress("DEPRECATION") v.vibrate(padrao, -1)
    } catch (_: Exception) {}
    try {
      val notif = NotificationCompat.Builder(this, CANAL_ALERTA)
        .setSmallIcon(applicationInfo.icon)
        .setContentTitle("K1 Segurança: você está bem?")
        .setContentText("Celular parado há muito tempo. Mexa o celular em 30 s para cancelar o alerta.")
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setAutoCancel(true)
        .build()
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_HOMEM_CAIDO, notif)
    } catch (_: Exception) {}
  }

  private fun cancelarPreAlarme() {
    if (preAlarmeDesde == 0L) return
    preAlarmeDesde = 0L
    try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIF_HOMEM_CAIDO) } catch (_: Exception) {}
    try { (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel() } catch (_: Exception) {}
  }

  // ---------- Telemetria: localização, bateria, Wi-Fi ----------
  private fun enviarTelemetria() {
    val token = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null) ?: return
    if (!enviandoTelemetria.compareAndSet(false, true)) return
    thread(name = "k1-telemetria") {
     try {
      val loc = melhorLocalizacao()
      val (wifi, rede) = estadoWifi()
      val ok = chamarRpc("vig_telemetria", JSONObject().apply {
        put("p_token", token)
        put("p_lat", loc?.latitude ?: JSONObject.NULL)
        put("p_lng", loc?.longitude ?: JSONObject.NULL)
        put("p_precisao_m", loc?.accuracy?.toDouble() ?: JSONObject.NULL)
        put("p_bateria", nivelBateria() ?: JSONObject.NULL)
        put("p_carregando", carregando() ?: JSONObject.NULL)
        put("p_wifi_conectado", wifi ?: JSONObject.NULL)
        put("p_wifi_nome", rede ?: JSONObject.NULL)
      })
      if (ok) { ultimoEnvioLocal = loc; ultimoEnvioEm = SystemClock.elapsedRealtime() }
      if (ok && temPanicoNaFila()) enviarFilaPanico()
     } finally { enviandoTelemetria.set(false) }
    }
  }

  @SuppressLint("MissingPermission")
  private fun iniciarLocalizacao() {
    if (!temPermissaoLocal()) return
    val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    for (prov in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
      try {
        // GPS a cada 5 s / 5 m; rede a cada 10 s / 10 m -> mapa acompanha quem está andando
        val (tempo, dist) = if (prov == LocationManager.GPS_PROVIDER) Pair(2_000L, 3f) else Pair(8_000L, 8f)
        if (lm.isProviderEnabled(prov)) lm.requestLocationUpdates(prov, tempo, dist, ouvinteLocal, Looper.getMainLooper())
      } catch (e: Exception) { Log.w(TAG, "Sem localização por $prov: ${e.message}") }
    }
  }

  private fun melhorLocalizacao(): Location? {
    val atual = localAtual
    val ultima = ultimaLocalizacao()
    return listOfNotNull(atual, ultima).maxByOrNull { it.time }
  }

  private fun temPermissaoLocal() =
    ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  /** (está no Wi-Fi?, nome da rede) — o nome só aparece com permissão de localização. */
  @Suppress("DEPRECATION")
  private fun estadoWifi(): Pair<Boolean?, String?> = try {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val caps = cm.getNetworkCapabilities(cm.activeNetwork)
    val noWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    val nome = if (noWifi) {
      val ssid = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo?.ssid
      ssid?.trim('"')?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
    } else null
    Pair(if (caps == null) null else noWifi, nome)
  } catch (_: Exception) { Pair(null, null) }

  private fun carregando(): Boolean? = try {
    (getSystemService(Context.BATTERY_SERVICE) as BatteryManager).isCharging
  } catch (_: Exception) { null }

  private fun chamarRpc(funcao: String, corpoJson: JSONObject): Boolean {
    val p = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val url = p.getString("url", null) ?: return false
    val chave = p.getString("anon", null) ?: return false
    return try {
      val corpo = corpoJson.toString()
      val con = (URL("${url.trimEnd('/')}/rest/v1/rpc/$funcao").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 10_000
        readTimeout = 15_000
        doOutput = true
        setRequestProperty("apikey", chave)
        setRequestProperty("Authorization", "Bearer $chave")
        setRequestProperty("Content-Type", "application/json")
      }
      con.outputStream.use { it.write(corpo.toByteArray(Charsets.UTF_8)) }
      val codigo = con.responseCode
      con.disconnect()
      codigo in 200..299
    } catch (e: Exception) {
      Log.w(TAG, "Sem conexão: ${e.message}")
      false
    }
  }

  // ---------- Dados do aparelho ----------
  @SuppressLint("MissingPermission")
  private fun ultimaLocalizacao(): Location? {
    val ok = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!ok) return null
    val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val provedores = mutableListOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) provedores.add(0, LocationManager.FUSED_PROVIDER)
    return provedores.mapNotNull { prov ->
      try { lm.getLastKnownLocation(prov) } catch (_: Exception) { null }
    }.maxByOrNull { it.time }
  }

  private fun nivelBateria(): Int? = try {
    (getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
      .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }
  } catch (_: Exception) { null }

  private fun vibrarDiscreto() {
    try {
      val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createOneShot(60, 80))
      else @Suppress("DEPRECATION") v.vibrate(60)
    } catch (_: Exception) {}
  }

  // ---------- Notificação fixa (obrigatória para serviço em primeiro plano) ----------
  private fun criarCanal() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val canal = NotificationChannel(CANAL, "Turno K1 Segurança", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Mostra que o monitoramento do turno está ativo"
        setShowBadge(false)
      }
      val alerta = NotificationChannel(CANAL_ALERTA, "Alertas K1 Segurança", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Aviso de celular parado (homem caído)"
      }
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(canal)
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(alerta)
    }
  }

  private fun iniciarPrimeiroPlano() {
    val abrir = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notif: Notification = NotificationCompat.Builder(this, CANAL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("K1 Segurança")
      .setContentText("Turno em andamento")
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(abrir)
      .build()

    val temLocalizacao = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val tipo = when {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.Q -> 0
      temLocalizacao -> ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      else -> 0
    }
    ServiceCompat.startForeground(this, NOTIF_ID, notif, tipo)
  }
}
