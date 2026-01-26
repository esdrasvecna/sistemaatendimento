<script>
(function () {
  const usuario = sessionStorage.getItem("usuario");
  const nivel = sessionStorage.getItem("nivel");

  // se não estiver logado
  if (!usuario || !nivel) {
    alert("Sessão expirada ou inválida.");
    window.location.href = "index.html";
  }
})();
</script>
