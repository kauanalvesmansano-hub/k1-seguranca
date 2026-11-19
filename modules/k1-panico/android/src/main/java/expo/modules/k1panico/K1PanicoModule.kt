package expo.modules.k1panico

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.app.NotificationManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Ponte entre o app (JavaScript) e o serviço nativo do pânico.
 *  - iniciar(url, anonKey, token, homemCaidoMin): começa a vigiar o Power, GPS e movimento (início do turno)
 *  - parar(): para de vigiar (fim do turno / sair)
 *  - ativo(): se o serviço está rodando
 */
class K1PanicoModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("K1Panico")

    AsyncFunction("iniciar") { url: String, anonKey: String, token: String, homemCaidoMin: Int ->
      context.getSharedPreferences(PanicoService.PREFS, Context.MODE_PRIVATE).edit()
        .putString("url", url)
        .putString("anon", anonKey)
        .putString("token", token)
        .putInt("homem_caido_min", homemCaidoMin)
        .apply()
      ContextCompat.startForegroundService(context, Intent(context, PanicoService::class.java))
    }

    AsyncFunction("parar") {
      context.stopService(Intent(context, PanicoService::class.java))
      val prefs = context.getSharedPreferences(PanicoService.PREFS, Context.MODE_PRIVATE)
      // Se ainda há pânico guardado sem internet, mantém o token para ele ser enviado depois
      val fila = prefs.getString("fila_panico", "[]") ?: "[]"
      if (fila == "[]") prefs.edit().remove("token").apply()
    }

    // K1 Família: gravar câmera + áudio no SOS (a própria pessoa liga/desliga)
    Function("sosConfigurar") { ligado: Boolean ->
      context.getSharedPreferences(PanicoService.PREFS, Context.MODE_PRIVATE).edit().putBoolean("gravar_sos", ligado).apply()
    }

    Function("sosGravando") {
      GravacaoService.gravando
    }

    Function("ativo") {
      PanicoService.rodando
    }

    // Simula uma batida para testar (vibra, pergunta "Você está bem?" e, sem resposta, avisa)
    Function("testarBatida") {
      val s = PanicoService.instancia
      s?.testarBatida()
      s != null
    }

    // ===== Celular da central: toca como ligação quando chega alerta =====
    AsyncFunction("centralIniciar") { url: String, anonKey: String, token: String ->
      context.getSharedPreferences(CentralService.PREFS, Context.MODE_PRIVATE).edit()
        .putString("url", url)
        .putString("anon", anonKey)
        .putString("token", token)
        .remove("desde")
        .apply()
      ContextCompat.startForegroundService(context, Intent(context, CentralService::class.java))
    }

    AsyncFunction("centralParar") {
      context.stopService(Intent(context, CentralService::class.java))
      context.getSharedPreferences(CentralService.PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    Function("centralAtiva") {
      CentralService.rodando
    }

    Function("centralTestar") {
      val s = CentralService.instancia
      s?.testar()
      s != null
    }

    Function("centralSilenciar") {
      CentralService.instancia?.silenciar()
      true
    }

    // Android 14+: tela cheia com o celular bloqueado precisa de autorização
    Function("podeTelaCheia") {
      if (Build.VERSION.SDK_INT >= 34)
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
      else true
    }

    Function("abrirPermissaoTelaCheia") {
      if (Build.VERSION.SDK_INT >= 34) {
        try {
          context.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {}
      }
      true
    }

    // "Não Perturbe": com esta permissão o alarme fura o modo silencioso/Não Perturbe
    Function("podeFurarSilencio") {
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).isNotificationPolicyAccessGranted
    }

    Function("pedirFurarSilencio") {
      try {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: Exception) {}
      true
    }

    Function("semEconomiaBateria") {
      (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("pedirSemEconomiaBateria") {
      try {
        context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: Exception) {
        try {
          context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {}
      }
      true
    }
  }
}
