async function iniciarAuditoria() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");const firebaseConfig = {
            apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
            authDomain: "sttu-registros.firebaseapp.com",
            projectId: "sttu-registros",
            storageBucket: "sttu-registros.firebasestorage.app",
            messagingSenderId: "785219239564",
            appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
            measurementId: "G-C7PSE7YFRG"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        document.getElementById('btnSair')?.addEventListener('click', () => {
            if (confirm("Deseja realmente sair?")) {
                signOut(auth).then(() => window.location.href = "login.html");
            }
        });

        // Verifica se é Admin
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const docSnap = await getDoc(doc(db, "usuarios", user.uid));
                if (docSnap.exists() && docSnap.data().cargo === 'admin') {
                    carregarLogs();
                } else {
                    alert("Acesso restrito a administradores.");
                    window.location.href = "index.html";
                }
            } else {
                window.location.href = "login.html";
            }
        });

        window.carregarLogs = async () => {
            const tbody = document.getElementById('tabelaLogs').getElementsByTagName('tbody')[0];
            tbody.innerHTML = "";
            document.getElementById('avisoCarregando').style.display = 'block';

            // Pega os últimos 100 logs
            const q = query(collection(db, "logs_auditoria"), orderBy("timestamp", "desc"), limit(100));
            const snapshot = await getDocs(q);

            document.getElementById('avisoCarregando').style.display = 'none';

            const filtroUser = document.getElementById('filtroUsuario').value.toUpperCase();
            const filtroAcao = document.getElementById('filtroAcao').value.toUpperCase();

            snapshot.forEach(doc => {
                const d = doc.data();
                
                // Filtro simples no front
                if(filtroUser && !d.usuario.toUpperCase().includes(filtroUser)) return;
                if(filtroAcao && !d.acao.toUpperCase().includes(filtroAcao)) return;

                const row = tbody.insertRow();
                
                // Formata Data
                const dataObj = d.timestamp ? d.timestamp.toDate() : new Date();
                const dataFmt = dataObj.toLocaleString('pt-BR');

                // Cor da Ação
                let classeCor = "";
                if(d.acao.includes("CRIAR") || d.acao.includes("REGISTRAR")) classeCor = "acao-criar";
                if(d.acao.includes("EDITAR") || d.acao.includes("ENCAMINHAR")) classeCor = "acao-editar";
                if(d.acao.includes("EXCLUIR") || d.acao.includes("BAIXA")) classeCor = "acao-excluir";

                row.innerHTML = `
                    <td>${dataFmt}</td>
                    <td><strong>${d.usuario}</strong></td>
                    <td class="${classeCor}">${d.acao}</td>
                    <td>${d.detalhes}</td>
                `;
            });
        };
}

iniciarAuditoria().catch((error) => {
    console.error("Erro ao carregar auditoria:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


