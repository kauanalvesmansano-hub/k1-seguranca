package expo.modules.k1panico

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Tela de "chamada" da central: aparece em tela cheia, até com o celular bloqueado.
 * Feita só com componentes nativos do Android para abrir na hora, mesmo com o app fechado.
 */
class ChamadaActivity : Activity() {

  private var alertaId: String? = null
  private lateinit var raiz: LinearLayout

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      try { (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null) } catch (_: Exception) {}
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    montar(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    montar(intent)
  }

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun texto(t: String, tam: Float, negrito: Boolean = false, cor: Int = Color.WHITE) = TextView(this).apply {
    text = t
    textSize = tam
    setTextColor(cor)
    gravity = Gravity.CENTER
    if (negrito) setTypeface(typeface, Typeface.BOLD)
    setPadding(0, dp(4), 0, dp(4))
  }

  private fun botao(t: String, fundo: Int, acao: () -> Unit) = Button(this).apply {
    text = t
    textSize = 18f
    setTextColor(Color.WHITE)
    setTypeface(typeface, Typeface.BOLD)
    isAllCaps = true
    background = GradientDrawable().apply { setColor(fundo); cornerRadius = dp(14).toFloat() }
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64)).apply { topMargin = dp(14) }
    setOnClickListener { acao() }
  }

  private fun montar(i: Intent) {
    alertaId = i.getStringExtra("id")
    val tipo = i.getStringExtra("tipo") ?: ""
    val nome = i.getStringExtra("nome") ?: "Vigilante"
    val posto = i.getStringExtra("posto") ?: ""
    val lat = i.getDoubleExtra("lat", Double.NaN)
    val lng = i.getDoubleExtra("lng", Double.NaN)
    val bateria = i.getIntExtra("bateria", -1)
    val hora = formatarHora(i.getStringExtra("hora") ?: "")
    val critico = tipo in CentralService.CRITICOS || tipo == "teste"

    raiz = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(if (critico) Color.parseColor("#991B1B") else Color.parseColor("#78350F"))
      setPadding(dp(24), dp(40), dp(24), dp(32))
    }
    raiz.addView(texto("K1 SEGURANÇA · CENTRAL", 14f, true, Color.parseColor("#FECACA")))
    val tit = texto("⚠ ${CentralService.titulo(tipo)}", 30f, true)
    raiz.addView(tit)
    raiz.addView(texto(nome, 26f, true))
    if (posto.isNotBlank()) raiz.addView(texto(posto, 18f))
    val detalhes = listOfNotNull(
      hora.takeIf { it.isNotBlank() }?.let { "às $it" },
      if (bateria >= 0) "bateria $bateria%" else null
    ).joinToString(" · ")
    if (detalhes.isNotBlank()) raiz.addView(texto(detalhes, 16f, cor = Color.parseColor("#FEE2E2")))

    raiz.addView(botao("Atender", Color.parseColor("#16A34A")) {
      enviarAoServico(CentralService.ACAO_ATENDER)
      abrirApp()
      finish()
    })
    if (i.getBooleanExtra("sos", false)) {
      // K1 Família: abre a câmera + áudio ao vivo de quem pediu socorro
      raiz.addView(botao("● Ver câmera ao vivo", Color.parseColor("#E10600")) {
        enviarAoServico(CentralService.ACAO_ATENDER)
        try {
          startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("k1seguranca://sos/$alertaId?modo=central"))
            .setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) { abrirApp() }
        finish()
      })
    }
    if (!lat.isNaN() && !lng.isNaN()) {
      raiz.addView(botao("Ver no mapa", Color.parseColor("#1D4ED8")) {
        enviarAoServico(CentralService.ACAO_SILENCIAR)
        try {
          startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps?q=$lat,$lng")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {}
      })
    }
    raiz.addView(botao("Silenciar", Color.parseColor("#3F3F46")) {
      enviarAoServico(CentralService.ACAO_SILENCIAR)
    })
    setContentView(raiz)

    ObjectAnimator.ofFloat(tit, "alpha", 1f, 0.25f).apply {
      duration = 600
      repeatMode = ValueAnimator.REVERSE
      repeatCount = ValueAnimator.INFINITE
      start()
    }
  }

  private fun enviarAoServico(acao: String) {
    try {
      startService(Intent(this, CentralService::class.java).setAction(acao).putExtra("id", alertaId))
    } catch (_: Exception) {
      CentralService.instancia?.silenciar()
    }
  }

  private fun abrirApp() {
    try {
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(it)
      }
    } catch (_: Exception) {}
  }

  private fun formatarHora(iso: String): String {
    if (iso.length < 16) return ""
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
          .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
      } else iso.substring(11, 16)
    } catch (_: Exception) { "" }
  }
}
