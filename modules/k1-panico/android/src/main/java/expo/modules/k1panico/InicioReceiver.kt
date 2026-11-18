package expo.modules.k1panico

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Celular ligou de novo: se este aparelho é a central, volta a receber alertas sozinho. */
class InicioReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val acao = intent.action ?: return
    if (acao != Intent.ACTION_BOOT_COMPLETED && acao != Intent.ACTION_MY_PACKAGE_REPLACED &&
      acao != "android.intent.action.QUICKBOOT_POWERON") return
    val token = context.getSharedPreferences(CentralService.PREFS, Context.MODE_PRIVATE).getString("token", null) ?: return
    if (token.isNotEmpty() && !CentralService.rodando) {
      try { ContextCompat.startForegroundService(context, Intent(context, CentralService::class.java)) } catch (_: Exception) {}
    }
  }
}
