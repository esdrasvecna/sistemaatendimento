
import { auth, db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } 
from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let pessoaId=null;

document.getElementById("salvarPessoa").onclick=async()=>{
  const ref = await addDoc(collection(db,"pessoas"),{
    nome:nome.value,
    sus:sus.value,
    createdAt:serverTimestamp()
  });
  pessoaId=ref.id;
  alert("Pessoa salva");
};

async function toBase64(file){
  return new Promise(r=>{
    const fr=new FileReader();
    fr.onload=()=>r(fr.result);
    fr.readAsDataURL(file);
  });
}

document.getElementById("salvarRelatorio").onclick=async()=>{
  if(!pessoaId) return alert("Salve a pessoa primeiro");
  let anexo=null;
  if(anexoRelatorio.files[0]){
    const f=anexoRelatorio.files[0];
    anexo={nome:f.name,tipo:f.type,base64:await toBase64(f)};
  }
  await addDoc(collection(db,`pessoas/${pessoaId}/relatorios`),{
    texto:textoRelatorio.value,
    urgencia:urgencia.value,
    anexo,
    createdAt:serverTimestamp()
  });
  alert("Relatório salvo");
};
