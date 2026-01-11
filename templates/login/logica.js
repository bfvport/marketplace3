<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Login | Marketplace Manager</title>

  <link rel="stylesheet" href="../../assets/css/app.css" />

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../../assets/js/supabase.js"></script>
</head>
<body>
  <div style="max-width:420px;margin:60px auto;padding:16px;">
    <div class="card">
      <h1>🔐 Login</h1>

      <label>Usuario</label>
      <input id="usuario" autocomplete="username" />

      <label>Contraseña</label>
      <input id="contra" type="password" autocomplete="current-password" />

      <div class="row" style="margin-top:14px;">
        <button class="btn" id="btnLogin">Entrar</button>
      </div>

      <div class="muted" style="margin-top:10px;" id="msg"></div>
    </div>
  </div>

  <script type="module" src="./logica.js"></script>
</body>
</html>
