<script>
document.addEventListener("DOMContentLoaded", () => {
  const nivel = sessionStorage.getItem("nivel");
  const instrutor = sessionStorage.getItem("instrutor") === "true";

  const admin = document.querySelector('a[href="admin.html"]');
  const usuarios = document.querySelector('a[href="usuarios.html"]');
  const treinamentos = document.querySelector('a[href="treinamentos.html"]');
  const lives = document.querySelector('a[href="lives.html"]');

  // Admin e Usuários: só comando
  if (nivel !== "comando") {
    if (admin) admin.style.display = "none";
    if (usuarios) usuarios.style.display = "none";
    if (lives) lives.style.display = "none";
  }

  // Treinamentos: instrutor ou comando
  if (!(nivel === "comando" || instrutor)) {
    if (treinamentos) treinamentos.style.display = "none";
  }
});
</script>
