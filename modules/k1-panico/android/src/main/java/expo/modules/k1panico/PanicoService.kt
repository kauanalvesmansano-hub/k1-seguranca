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
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
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
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Serviço em primeiro plano que fica ativo durante o turno do vigilante.
 *
 * Cada toque no botão Power liga ou desliga a tela. O serviço conta esses
 * eventos: 4 eventos em até [JANELA_MS] = pânico. O alerta é enviado direto
 * daqui (Kotlin), sem depender do app aberto, para a função vig_panico do
 * Supabase. O servidor então manda WhatsApp e faz a ligação para o monitoramento.
 *
 * Também envia a cada [INTERVALO_TELEMETRIA_MS] a localização, bateria e Wi-Fi
 * (função vig_telemetria), para a empresa ver cada vigilante no mapa.
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

    @Volatile var rodando = false
  }

  private val eventos = ArrayDeque<Long>()
  private var ultimoPanico = 0L
  private val handler = Handler(Looper.getMainLooper())
  @Volatile private var localAtual: Location? = null

  private val ouvinteLocal = LocationListener { loc ->
    val atual = localAtual
    if (atual == null || loc.time >= atual.time) localAtual = loc
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
    handler.postDelayed(cicloTelemetria, 5_000L)
    Log.i(TAG, "Monitoramento do botão Power ativo")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

  override fun onDestroy() {
    try { unregisterReceiver(receptor) } catch (_: Exception) {}
    handler.removeCallbacks(cicloTelemetria)
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
    val wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "k1:panico")
    wake.acquire(3 * 60 * 1000L)
    thread(name = "k1-panico") {
      try {
        val loc = melhorLocalizacao()
        val bateria = nivelBateria()
        // Tenta por até ~3 minutos (ex.: sinal oscilando)
        val esperas = longArrayOf(0, 3_000, 5_000, 10_000, 15_000, 30_000, 60_000, 60_000)
        for (espera in esperas) {
          if (espera > 0) Thread.sleep(espera)
          if (enviar(loc, bateria)) { Log.i(TAG, "Pânico enviado"); break }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Falha no pânico", e)
      } finally {
        if (wake.isHeld) wake.release()
      }
    }
  }

  private fun enviar(loc: Location?, bateria: Int?): Boolean {
    val token = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null) ?: return false
    return chamarRpc("vig_panico", JSONObject().apply {
      put("p_token", token)
      put("p_lat", loc?.latitude ?: JSONObject.NULL)
      put("p_lng", loc?.longitude ?: JSONObject.NULL)
      put("p_bateria", bateria ?: JSONObject.NULL)
    })
  }

  // ---------- Telemetria: localização, bateria, Wi-Fi ----------
  private fun enviarTelemetria() {
    val token = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null) ?: return
    thread(name = "k1-telemetria") {
      val loc = melhorLocalizacao()
      val (wifi, rede) = estadoWifi()
      chamarRpc("vig_telemetria", JSONObject().apply {
        put("p_token", token)
        put("p_lat", loc?.latitude ?: JSONObject.NULL)
        put("p_lng", loc?.longitude ?: JSONObject.NULL)
        put("p_precisao_m", loc?.accuracy?.toDouble() ?: JSONObject.NULL)
        put("p_bateria", nivelBateria() ?: JSONObject.NULL)
        put("p_carregando", carregando() ?: JSONObject.NULL)
        put("p_wifi_conectado", wifi ?: JSONObject.NULL)
        put("p_wifi_nome", rede ?: JSONObject.NULL)
      })
    }
  }

  @SuppressLint("MissingPermission")
  private fun iniciarLocalizacao() {
    if (!temPermissaoLocal()) return
    val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    for (prov in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
      try {
        if (lm.isProviderEnabled(prov)) lm.requestLocationUpdates(prov, 60_000L, 15f, ouvinteLocal, Looper.getMainLooper())
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
      Log.w(TAG, "Sem conexão, tentando de novo: ${e.message}")
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
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(canal)
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
