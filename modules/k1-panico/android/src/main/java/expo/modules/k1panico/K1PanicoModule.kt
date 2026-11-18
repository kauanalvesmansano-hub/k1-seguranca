package expo.modules.k1panico

import android.content.Context
import android.content.Intent
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

    Function("ativo") {
      PanicoService.rodando
    }
  }
}
