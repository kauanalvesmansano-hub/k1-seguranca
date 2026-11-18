package expo.modules.k1panico

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/**
 * Tela invisível que existe só por ~1 segundo: o Android só deixa ligar câmera e
 * microfone em segundo plano se o app estiver "visível" na hora de começar.
 * Ela aparece por cima da tela de bloqueio, liga a gravação e fecha sozinha.
 */
class SosGravacaoActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (!GravacaoService.gravando) GravacaoService.iniciar(this)
    Handler(Looper.getMainLooper()).postDelayed({ finish() }, 1200L)
  }

  override fun onDestroy() {
    super.onDestroy()
    getSystemService(android.app.NotificationManager::class.java)?.cancel(PanicoService.NOTIF_SOS_ID)
  }
}
